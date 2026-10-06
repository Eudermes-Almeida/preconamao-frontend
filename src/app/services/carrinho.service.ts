import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from './produto-api.service';
import { LojaService } from './loja.service';
import { codigoCanonico } from '../utils/codigo-barras';

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

  // Só o que tem preço: item sem preço ou que a loja não tem não entra na soma.
  readonly subtotalCentavos = computed(() =>
    this.itensState().filter(item => !item.indisponivel && !item.semPreco)
      .reduce((total, item) => total + item.precoCentavos * item.quantidade, 0));

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
      if (lojaProtegida && !trocaDeLoja) {
        return;
      }
      const porCodigo = new Map(produtos.map(produto => [produto.codigoBarras, produto]));
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
          }
        : {
            codigoBarras: produto.codigoBarras,
            descricao: produto.descricao,
            precoCentavos: produto.precoCentavos,
            quantidade: 1,
            preListaItemId: produto.preListaItemId,
            semPreco: produto.precoConfiavel === false || undefined,
          };
      return [atualizado, ...restantes];
    });
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
        && (item.preListaItemId === undefined || Number.isInteger(item.preListaItemId)));
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
