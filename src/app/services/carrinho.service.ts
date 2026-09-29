import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from './produto-api.service';

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

  readonly subtotalCentavos = computed(() =>
    this.itensState().reduce((total, item) => total + item.precoCentavos * item.quantidade, 0));

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
      if (!confiaveis) {
        return;
      }
      const porCodigo = new Map(produtos.map(produto => [produto.codigoBarras, produto]));
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
          }
        : {
            codigoBarras: produto.codigoBarras,
            descricao: produto.descricao,
            precoCentavos: produto.precoCentavos,
            quantidade: 1,
            preListaItemId: produto.preListaItemId,
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
