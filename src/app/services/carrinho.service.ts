import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from './produto-api.service';
import { LojaService } from './loja.service';
import { codigoCanonico } from '../utils/codigo-barras';
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
  // A loja não tem o produto (saiu do PRICETAB, ou o cliente trocou para uma loja que não o tem):
  // continua na lista, apagado, com aviso e sem somar; volta ao normal se a loja voltar a ter.
  indisponivel?: boolean;
  // A loja tem o produto, mas sem preço confiável (0,00, código em conflito ou loja sem sinal):
  // "sem preço", não soma no Valor Total (multi-loja, regras 11g, 18 e 19).
  semPreco?: boolean;
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

// Fora da soma: a loja não tem, está sem preço, ou é pesável que só o caixa vai pesar.
function somaNoTotal(item: ItemCarrinho): boolean {
  return !item.indisponivel && !item.semPreco && item.pesagem?.modo !== 'CAIXA';
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

  // Só o que tem preço: item sem preço, que a loja não tem ou a pesar no caixa não entra na soma.
  // Pesável informado por peso/quantidade entra com o valor estimado.
  readonly subtotalCentavos = computed(() =>
    this.itensState().filter(somaNoTotal).reduce((total, item) => total + valorItem(item), 0));

  // Parte do total que é estimativa (pesáveis por peso/quantidade): o total ganha "≈".
  readonly estimadoCentavos = computed(() =>
    this.itensState().filter(item => somaNoTotal(item) && item.pesagem)
      .reduce((total, item) => total + valorItem(item), 0));

  // "R$ X + 3 itens a pesar no caixa".
  readonly itensAPesar = computed(() => this.descricoesAPesar().length);

  // Lista do botão "+ N itens a pesar no caixa" (Valor Total), na ordem do carrinho.
  readonly descricoesAPesar = computed(() =>
    this.itensState().filter(item => !item.indisponivel && !item.semPreco && item.pesagem?.modo === 'CAIXA')
      .map(item => item.descricao));

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

  // Quantos itens ficaram fora da soma (o Valor Total avisa).
  readonly itensForaDaSoma = computed(() =>
    this.itensState().filter(item => item.indisponivel || item.semPreco).length);

  // Aviso único depois de trocar de loja ("Carrinho atualizado para a Alfa Bairro: ...").
  readonly avisoTrocaDeLoja = signal<string | null>(null);
  private lojaDosPrecos: number | null = null;

  // false quando a última revalidação voltou sem garantia de preço (agente da loja sem sinal):
  // o carrinho mostra o aviso para conferir no caixa.
  readonly precosConfiaveis = signal(true);
  private revalidando = false;

  constructor(private api: ProdutoApiService, private loja: LojaService) {
    effect(() => this.salvar(this.itensState()));
    // Trocou de loja (multi-loja, regra 24): recalcula o carrinho inteiro na loja nova.
    effect(() => {
      const loja = this.loja.lojaConsultaId();
      if (loja == null) {
        return;
      }
      if (this.lojaDosPrecos != null && loja !== this.lojaDosPrecos) {
        this.revalidar(true);
      }
      this.lojaDosPrecos = loja;
    });
  }

  // Confere na API o preço atual dos itens (ao abrir o app, ao voltar para ele e no "Valor Total"):
  // um carrinho salvo ontem não pode mostrar o preço de ontem. Etiqueta de balança volta igual
  // (o valor é o impresso). Sem rede, fica como está.
  // trocaDeLoja: o cliente passou para outra loja — um carrinho só, recalculado: preço da loja
  // nova, "Não encontrado nesta loja" no que ela não tem (sem apagar), "sem preço" no que está sem
  // preço lá, e um aviso só. Preço antigo NÃO é mostrado (não expõe a comparação entre lojas).
  revalidar(trocaDeLoja = false): void {
    const codigos = [...new Set(this.itensState().map(item => item.codigoBarras))];
    if (codigos.length === 0 || (this.revalidando && !trocaDeLoja)) {
      return;
    }
    this.revalidando = true;
    const consultados = new Set(codigos.slice(0, 100));
    this.api.buscarLote([...consultados]).pipe(catchError(() => of(null))).subscribe(produtos => {
      this.revalidando = false;
      if (!produtos) {
        return;
      }
      // Proteção da loja (sem sinal / dados não aplicados): nenhum preço é garantido, fica o aviso.
      // Sem preço de UM produto (0,00, conflito) é por item, abaixo.
      const lojaProtegida = produtos.some(produto => produto.motivoSemPreco === 'PROTECAO');
      this.precosConfiaveis.set(!lojaProtegida);
      const porCodigo = new Map(produtos.map(produto => [produto.codigoBarras, produto]));
      if (lojaProtegida && !trocaDeLoja) {
        // Preço fica como está, mas o setor (gráfico de gastos) não depende do sinal da loja.
        this.itensState.update(itens => itens.map(item => {
          const atual = porCodigo.get(item.codigoBarras) ?? porCodigo.get(codigoCanonico(item.codigoBarras));
          const setor = setorSemNumero(atual?.localizacao?.nomeSetor);
          return atual && setor !== item.setor ? { ...item, setor } : item;
        }));
        return;
      }
      let mudaram = 0;
      let naoExistem = 0;
      let semPreco = 0;
      this.itensState.update(itens => itens.map(item => {
        if (!consultados.has(item.codigoBarras)) {
          return item;
        }
        // O servidor devolve o código canônico; carrinho antigo pode ter "07891991010153".
        const atual = porCodigo.get(item.codigoBarras) ?? porCodigo.get(codigoCanonico(item.codigoBarras));
        if (!atual) {
          naoExistem++;
          return { ...item, indisponivel: true, semPreco: undefined, precoAnteriorCentavos: trocaDeLoja ? undefined : item.precoAnteriorCentavos };
        }
        const itemSemPreco = atual.precoConfiavel === false;
        if (itemSemPreco) {
          semPreco++;
        }
        const mudou = !itemSemPreco && atual.precoCentavos !== item.precoCentavos;
        if (mudou) {
          mudaram++;
        }
        return {
          ...item,
          indisponivel: undefined,
          semPreco: itemSemPreco || undefined,
          precoCentavos: itemSemPreco ? item.precoCentavos : atual.precoCentavos,
          setor: setorSemNumero(atual.localizacao?.nomeSetor),
          precoAnteriorCentavos: trocaDeLoja ? undefined : mudou ? item.precoCentavos : item.precoAnteriorCentavos,
        };
      }));
      if (trocaDeLoja) {
        const partes = [
          mudaram > 0 ? `${mudaram} ${mudaram === 1 ? 'preço mudou' : 'preços mudaram'}` : '',
          naoExistem > 0 ? `${naoExistem} ${naoExistem === 1 ? 'produto não existe' : 'produtos não existem'} nesta loja` : '',
          semPreco > 0 ? `${semPreco} sem preço` : '',
        ].filter(Boolean);
        const nome = this.loja.lojaExibida()?.nome ?? 'a loja escolhida';
        this.avisoTrocaDeLoja.set(`Carrinho atualizado para ${nome}: `
          + (partes.length > 0 ? partes.join(', ') + '.' : 'nenhuma mudança.'));
      }
    });
  }

  fecharAvisoTrocaDeLoja(): void {
    this.avisoTrocaDeLoja.set(null);
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
            semPreco: produto.precoConfiavel === false || undefined,
            setor: setorSemNumero(produto.localizacao?.nomeSetor) ?? existente.setor,
          }
        : {
            codigoBarras: produto.codigoBarras,
            descricao: produto.descricao,
            precoCentavos: produto.precoCentavos,
            quantidade: 1,
            preListaItemId: produto.preListaItemId,
            semPreco: produto.precoConfiavel === false || undefined,
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
        semPreco: produto.precoConfiavel === false || undefined,
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
    this.avisoTrocaDeLoja.set(null);
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
