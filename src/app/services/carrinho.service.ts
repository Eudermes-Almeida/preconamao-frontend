import { Injectable, computed, effect, signal } from '@angular/core';
import { ProdutoDTO } from './produto-api.service';

export interface ItemCarrinho {
  codigoBarras: string;
  descricao: string;
  precoCentavos: number;
  quantidade: number;
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

  constructor() {
    effect(() => this.salvar(this.itensState()));
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
      const atualizado: ItemCarrinho = existente
        ? { ...existente, quantidade: existente.quantidade + 1 }
        : {
            codigoBarras: produto.codigoBarras,
            descricao: produto.descricao,
            precoCentavos: produto.precoCentavos,
            quantidade: 1,
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
        && item.quantidade >= 1);
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
