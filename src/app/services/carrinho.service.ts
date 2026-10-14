import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from './produto-api.service';
import { GRUPOS_GASTO, GRUPO_OUTROS, GrupoGasto, grupoDoSetor, setorSemNumero } from '../utils/grupos-gasto';

export interface ItemCarrinho {
  codigoBarras: string;
  descricao: string;
  precoCentavos: number;
  quantidade: number;
  // Copiado do ProdutoDTO: é o que faz o item correspondente da pré-lista ser riscado.
  // Ausente em carrinhos salvos antes da pré-lista existir.
  preListaItemId?: number;
  // Revalidação (ver revalidar()): o preço mudou desde que o produto foi bipado — o novo já está em
  // precoCentavos e este é o de antes, para o aviso "Preço atualizado: de X para Y".
  precoAnteriorCentavos?: number;
  // A loja não tem mais o produto (saiu do PRICETAB): continua na lista, com aviso.
  indisponivel?: boolean;
  // Setor do mapa sem o número ("MERCEARIA"), para o gráfico de gastos. Ausente = sem setor mapeado
  // (fatia "Outros"); carrinho salvo antes do gráfico ganha o setor na próxima revalidação.
  setor?: string;
  // Produto vendido por kg sem etiqueta (hortifrúti, padaria): precoCentavos é o preço do QUILO,
  // quantidade fica 1 e o valor da linha sai da pesagem (ver valorItem). Ausente = item comum.
  pesagem?: Pesagem;
}

// Como o cliente informou o pesável: PESO = gramas digitadas; QUANTIDADE = unidades × peso médio
// (gramas já calculadas); CAIXA = sem valor, pesa no caixa. PESO e QUANTIDADE são estimativas (≈).
export interface Pesagem {
  modo: 'PESO' | 'QUANTIDADE' | 'CAIXA';
  gramas?: number;
  unidades?: number;
}

// Valor da linha: item comum = preço × quantidade; pesável = preço do kg × peso (a pesar = 0).
export function valorItem(item: ItemCarrinho): number {
  if (!item.pesagem) {
    return item.precoCentavos * item.quantidade;
  }
  return item.pesagem.modo === 'CAIXA' ? 0 : Math.round(item.precoCentavos * (item.pesagem.gramas ?? 0) / 1000);
}

// Fora da soma: pesável que só o caixa vai pesar.
function somaNoTotal(item: ItemCarrinho): boolean {
  return item.pesagem?.modo !== 'CAIXA';
}

function pesagemValida(pesagem: unknown): boolean {
  if (pesagem === undefined) {
    return true;
  }
  const p = pesagem as Pesagem;
  return (p?.modo === 'CAIXA')
    || (p?.modo === 'PESO' && Number.isInteger(p.gramas) && p.gramas! > 0)
    || (p?.modo === 'QUANTIDADE' && Number.isInteger(p.gramas) && p.gramas! > 0
      && Number.isInteger(p.unidades) && p.unidades! > 0);
}

export interface FatiaGasto {
  grupo: GrupoGasto;
  centavos: number;
  // Inteiro; as fatias somam exatamente 100 (maiores restos).
  percentual: number;
  // Valor real abaixo de 1% (o inteiro arredondado pode virar 0).
  menosDeUm: boolean;
}

const CHAVE_STORAGE = 'preconamao.carrinho';

@Injectable({
  providedIn: 'root'
})
export class CarrinhoService {

  private readonly itensState = signal<ItemCarrinho[]>(this.carregar());

  readonly itens = this.itensState.asReadonly();

  // Soma das unidades (3 unidades do mesmo produto contam como 3 itens), não de linhas.
  readonly quantidadeTotal = computed(() =>
    this.itensState().reduce((total, item) => total + item.quantidade, 0));

  // Pesável a pesar no caixa não entra na soma; por peso/quantidade entra com o valor estimado.
  readonly subtotalCentavos = computed(() =>
    this.itensState().filter(somaNoTotal).reduce((total, item) => total + valorItem(item), 0));

  // Parte do total que é estimativa (pesáveis por peso/quantidade): o total ganha "≈".
  readonly estimadoCentavos = computed(() =>
    this.itensState().filter(item => somaNoTotal(item) && item.pesagem)
      .reduce((total, item) => total + valorItem(item), 0));

  // "R$ X + 3 itens a pesar no caixa".
  readonly itensAPesar = computed(() =>
    this.itensState().filter(item => item.pesagem?.modo === 'CAIXA').length);

  // Gráfico de gastos: o mesmo total do Valor Total, repartido nos 6 grupos + "Outros", na ordem
  // fixa da rosca (as cores seguem o grupo). Grupo sem gasto não aparece.
  readonly gastosPorGrupo = computed<FatiaGasto[]>(() => {
    const porGrupo = new Map<string, number>();
    for (const item of this.itensState()) {
      if (!somaNoTotal(item)) {
        continue;
      }
      const grupo = grupoDoSetor(item.setor);
      porGrupo.set(grupo.id, (porGrupo.get(grupo.id) ?? 0) + valorItem(item));
    }
    const total = [...porGrupo.values()].reduce((soma, valor) => soma + valor, 0);
    if (total <= 0) {
      return [];
    }
    const fatias: FatiaGasto[] = [...GRUPOS_GASTO, GRUPO_OUTROS]
      .map(grupo => ({ grupo, centavos: porGrupo.get(grupo.id) ?? 0, percentual: 0, menosDeUm: false }))
      .filter(fatia => fatia.centavos > 0);
    // Maiores restos: arredonda para baixo e dá o que falta para 100 às fatias de maior resto.
    const exatos = fatias.map(fatia => fatia.centavos * 100 / total);
    fatias.forEach((fatia, i) => {
      fatia.percentual = Math.floor(exatos[i]);
      fatia.menosDeUm = exatos[i] < 1;
    });
    let falta = 100 - fatias.reduce((soma, fatia) => soma + fatia.percentual, 0);
    const porResto = fatias.map((_, i) => i).sort((a, b) => (exatos[b] % 1) - (exatos[a] % 1));
    for (const i of porResto) {
      if (falta <= 0) {
        break;
      }
      fatias[i].percentual++;
      falta--;
    }
    return fatias;
  });

  // false quando a última revalidação voltou sem garantia de preço (agente da loja sem sinal):
  // o carrinho mostra o aviso para conferir no caixa.
  readonly precosConfiaveis = signal(true);
  private revalidando = false;

  constructor(private api: ProdutoApiService) {
    effect(() => this.salvar(this.itensState()));
  }

  // Confere na API o preço atual dos itens (ao abrir o app, ao voltar para ele e no "Valor Total"):
  // um carrinho salvo ontem não pode mostrar o preço de ontem. Etiqueta de balança volta igual
  // (o valor é o impresso). Sem rede, fica como está.
  revalidar(): void {
    const codigos = [...new Set(this.itensState().map(item => item.codigoBarras))];
    if (codigos.length === 0 || this.revalidando) {
      return;
    }
    this.revalidando = true;
    const consultados = new Set(codigos.slice(0, 100));
    this.api.buscarLote([...consultados]).pipe(catchError(() => of(null))).subscribe(produtos => {
      this.revalidando = false;
      if (!produtos) {
        return;
      }
      const confiaveis = produtos.every(produto => produto.precoConfiavel !== false);
      this.precosConfiaveis.set(confiaveis);
      const porCodigo = new Map(produtos.map(produto => [produto.codigoBarras, produto]));
      if (!confiaveis) {
        // Preço fica como está, mas o setor (gráfico de gastos) não depende do sinal da loja.
        this.itensState.update(itens => itens.map(item => {
          const setor = setorSemNumero(porCodigo.get(item.codigoBarras)?.localizacao?.nomeSetor);
          return porCodigo.has(item.codigoBarras) && setor !== item.setor ? { ...item, setor } : item;
        }));
        return;
      }
      this.itensState.update(itens => itens.map(item => {
        if (!consultados.has(item.codigoBarras)) {
          return item;
        }
        const atual = porCodigo.get(item.codigoBarras);
        if (!atual) {
          return { ...item, indisponivel: true };
        }
        const mudou = atual.precoCentavos !== item.precoCentavos;
        return {
          ...item,
          indisponivel: undefined,
          precoCentavos: atual.precoCentavos,
          setor: setorSemNumero(atual.localizacao?.nomeSetor),
          precoAnteriorCentavos: mudou ? item.precoCentavos : item.precoAnteriorCentavos,
        };
      }));
    });
  }

  quantidadeDe(codigoBarras: string): number {
    return this.itensState().find(item => item.codigoBarras === codigoBarras)?.quantidade ?? 0;
  }

  // A lista é mantida do mais recente para o mais antigo: o produto bipado por último fica no topo,
  // inclusive quando já estava no carrinho (soma +1 e sobe). Já incrementar/decrementar não
  // reordenam, para a linha não fugir de baixo do dedo/mouse enquanto se ajusta a quantidade.
  adicionar(produto: ProdutoDTO): void {
    this.itensState.update(itens => {
      const existente = itens.find(item => item.codigoBarras === produto.codigoBarras);
      const restantes = itens.filter(item => item.codigoBarras !== produto.codigoBarras);
      // Bipar de novo traz o preço do momento: se mudou, a linha inteira passa a valer o novo.
      const atualizado: ItemCarrinho = existente
        ? {
            ...existente,
            quantidade: existente.quantidade + 1,
            precoCentavos: produto.precoCentavos,
            precoAnteriorCentavos: existente.precoCentavos !== produto.precoCentavos
              ? existente.precoCentavos : existente.precoAnteriorCentavos,
            indisponivel: undefined,
            setor: setorSemNumero(produto.localizacao?.nomeSetor) ?? existente.setor,
          }
        : {
            codigoBarras: produto.codigoBarras,
            descricao: produto.descricao,
            precoCentavos: produto.precoCentavos,
            quantidade: 1,
            preListaItemId: produto.preListaItemId,
            setor: setorSemNumero(produto.localizacao?.nomeSetor),
          };
      return [atualizado, ...restantes];
    });
  }

  pesagemDe(codigoBarras: string): Pesagem | undefined {
    return this.itensState().find(item => item.codigoBarras === codigoBarras)?.pesagem;
  }

  // Pesável sem etiqueta (ver o modal "Como você quer informar?"): entra com quantidade 1 e a
  // pesagem escolhida. Já no carrinho, a pesagem nova SUBSTITUI a antiga (é uma edição, não soma)
  // e a linha sobe para o topo, como no adicionar().
  adicionarPesavel(produto: ProdutoDTO, pesagem: Pesagem): void {
    this.itensState.update(itens => {
      const existente = itens.find(item => item.codigoBarras === produto.codigoBarras);
      const restantes = itens.filter(item => item.codigoBarras !== produto.codigoBarras);
      const atualizado: ItemCarrinho = {
        codigoBarras: produto.codigoBarras,
        descricao: produto.descricao,
        precoCentavos: produto.precoCentavos,
        quantidade: 1,
        preListaItemId: produto.preListaItemId ?? existente?.preListaItemId,
        precoAnteriorCentavos: existente && existente.precoCentavos !== produto.precoCentavos
          ? existente.precoCentavos : existente?.precoAnteriorCentavos,
        setor: setorSemNumero(produto.localizacao?.nomeSetor) ?? existente?.setor,
        pesagem,
      };
      return [atualizado, ...restantes];
    });
  }

  // Edição pelo carrinho (botão "Alterar"): troca só a pesagem, sem reordenar a lista.
  alterarPesagem(codigoBarras: string, pesagem: Pesagem): void {
    this.itensState.update(itens => itens.map(item => item.codigoBarras === codigoBarras
      ? { ...item, pesagem }
      : item));
  }

  incrementar(codigoBarras: string): void {
    this.itensState.update(itens => itens.map(item => item.codigoBarras === codigoBarras
      ? { ...item, quantidade: item.quantidade + 1 }
      : item));
  }

  // A quantidade nunca cai abaixo de 1: para tirar o produto existe o botão de remover.
  decrementar(codigoBarras: string): void {
    this.itensState.update(itens => itens.map(item => item.codigoBarras === codigoBarras && item.quantidade > 1
      ? { ...item, quantidade: item.quantidade - 1 }
      : item));
  }

  remover(codigoBarras: string): void {
    this.itensState.update(itens => itens.filter(item => item.codigoBarras !== codigoBarras));
  }

  limpar(): void {
    this.itensState.set([]);
    this.precosConfiaveis.set(true);
  }

  // Storage pode estar indisponível ou com dado corrompido (modo privado, edição manual):
  // nesse caso o carrinho simplesmente começa vazio.
  private carregar(): ItemCarrinho[] {
    try {
      const bruto = localStorage.getItem(CHAVE_STORAGE);
      if (!bruto) {
        return [];
      }
      const dados: unknown = JSON.parse(bruto);
      if (!Array.isArray(dados)) {
        return [];
      }
      return dados.filter((item): item is ItemCarrinho =>
        typeof item?.codigoBarras === 'string'
        && typeof item?.descricao === 'string'
        && Number.isInteger(item?.precoCentavos)
        && Number.isInteger(item?.quantidade)
        && item.quantidade >= 1
        && (item.preListaItemId === undefined || Number.isInteger(item.preListaItemId))
        && pesagemValida(item.pesagem));
    } catch {
      return [];
    }
  }

  private salvar(itens: ItemCarrinho[]): void {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(itens));
    } catch {
      // sem storage o carrinho continua funcionando só em memória
    }
  }
}
