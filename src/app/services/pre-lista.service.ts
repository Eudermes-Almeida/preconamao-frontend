import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { CarrinhoService } from './carrinho.service';
import { PreListaCategoriaDTO, ProdutoApiService } from './produto-api.service';

// id do item da pré-lista -> quantidade que o cliente pretende comprar.
export type SelecaoPreLista = Record<number, number>;

export interface SituacaoItem {
  selecionado: boolean;
  planejado: number;
  // Unidades já no carrinho de produtos que atendem este item (ex.: 2 detergentes de marcas diferentes).
  noCarrinho: number;
  // Riscado: o carrinho já tem pelo menos a quantidade planejada.
  concluido: boolean;
}

const CHAVE_STORAGE = 'preconamao.prelista';
const CHAVE_FILTRO = 'preconamao.prelista.somenteMarcados';

// Pré-lista de compras: o cliente marca em casa o que pretende comprar (e quanto); no mercado,
// cada item é riscado sozinho quando o carrinho atinge a quantidade planejada. Riscado é
// CONSEQUÊNCIA do carrinho (computed), não um evento guardado: tirar o produto do carrinho
// desfaz o risco, sem nada para sair de sincronia.
@Injectable({
  providedIn: 'root'
})
export class PreListaService {

  private readonly selecaoState = signal<SelecaoPreLista>(this.carregar());
  readonly selecao = this.selecaoState.asReadonly();

  // Filtro "Ver só minha lista". Fica aqui (e no storage), não na tela: o PreListaComponent é
  // destruído ao trocar de modo, e o filtro precisa continuar ligado na volta (pedido do usuário).
  readonly somenteMarcados = signal<boolean>(this.carregarFiltro());

  readonly catalogo = signal<PreListaCategoriaDTO[] | null>(null);
  readonly carregandoCatalogo = signal(false);
  readonly erroCatalogo = signal<string | null>(null);

  // Modal "lista completa": abre quando a lista passa de incompleta para completa.
  readonly mostrandoSucesso = signal(false);

  private readonly noCarrinhoPorItem = computed(() => {
    const porItem = new Map<number, number>();
    for (const item of this.carrinho.itens()) {
      if (item.preListaItemId !== undefined) {
        porItem.set(item.preListaItemId, (porItem.get(item.preListaItemId) ?? 0) + item.quantidade);
      }
    }
    return porItem;
  });

  readonly totalSelecionados = computed(() => Object.keys(this.selecaoState()).length);

  readonly totalConcluidos = computed(() => {
    const noCarrinho = this.noCarrinhoPorItem();
    return Object.entries(this.selecaoState())
      .filter(([id, planejado]) => (noCarrinho.get(Number(id)) ?? 0) >= planejado)
      .length;
  });

  readonly completa = computed(() =>
    this.totalSelecionados() > 0 && this.totalConcluidos() === this.totalSelecionados());

  constructor(private carrinho: CarrinhoService, private api: ProdutoApiService) {
    effect(() => this.salvar(this.selecaoState()));
    effect(() => this.salvarFiltro(this.somenteMarcados()));

    // Começa com o estado atual: reabrir o app com a lista já completa não repete o modal.
    let estavaCompleta = untracked(() => this.completa());
    effect(() => {
      const completa = this.completa();
      if (completa && !estavaCompleta) {
        this.mostrandoSucesso.set(true);
      }
      estavaCompleta = completa;
    }, { allowSignalWrites: true });
  }

  situacao(itemId: number): SituacaoItem {
    const planejado = this.selecaoState()[itemId];
    const noCarrinho = this.noCarrinhoPorItem().get(itemId) ?? 0;
    return {
      selecionado: planejado !== undefined,
      planejado: planejado ?? 1,
      noCarrinho,
      concluido: planejado !== undefined && noCarrinho >= planejado,
    };
  }

  // Busca o catálogo uma vez por sessão; nova tentativa só depois de um erro.
  carregarCatalogo(): void {
    if (this.catalogo() || this.carregandoCatalogo()) {
      return;
    }
    this.carregandoCatalogo.set(true);
    this.erroCatalogo.set(null);
    this.api.buscarPreLista().subscribe({
      next: (categorias) => {
        this.catalogo.set(categorias);
        this.carregandoCatalogo.set(false);
      },
      error: (err) => {
        console.error('Erro ao carregar a pré-lista:', err);
        this.erroCatalogo.set('Não foi possível carregar a pré-lista. Verifique a conexão e tente de novo.');
        this.carregandoCatalogo.set(false);
      },
    });
  }

  // Checkbox: marca com quantidade 1 ou desmarca (esquecendo a quantidade).
  alternar(itemId: number): void {
    this.selecaoState.update(selecao => {
      const { [itemId]: atual, ...resto } = selecao;
      return atual === undefined ? { ...selecao, [itemId]: 1 } : resto;
    });
    // Lista esvaziada desmarcando item a item: desliga o filtro de verdade, senão o próximo item
    // marcado faria os outros 165 sumirem de repente.
    if (this.totalSelecionados() === 0) {
      this.somenteMarcados.set(false);
    }
  }

  incrementar(itemId: number): void {
    this.selecaoState.update(selecao => selecao[itemId] === undefined
      ? selecao
      : { ...selecao, [itemId]: selecao[itemId] + 1 });
  }

  // Nunca abaixo de 1: para tirar o item da lista existe o checkbox.
  decrementar(itemId: number): void {
    this.selecaoState.update(selecao => selecao[itemId] === undefined || selecao[itemId] <= 1
      ? selecao
      : { ...selecao, [itemId]: selecao[itemId] - 1 });
  }

  limpar(): void {
    this.selecaoState.set({});
    this.somenteMarcados.set(false);
  }

  alternarSomenteMarcados(): void {
    this.somenteMarcados.update(valor => !valor);
  }

  fecharSucesso(): void {
    this.mostrandoSucesso.set(false);
  }

  // Storage indisponível ou corrompido: a lista começa vazia (mesma regra do carrinho).
  private carregar(): SelecaoPreLista {
    try {
      const dados: unknown = JSON.parse(localStorage.getItem(CHAVE_STORAGE) ?? '{}');
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        return {};
      }
      const selecao: SelecaoPreLista = {};
      for (const [id, quantidade] of Object.entries(dados)) {
        if (Number.isInteger(Number(id)) && Number.isInteger(quantidade) && (quantidade as number) >= 1) {
          selecao[Number(id)] = quantidade as number;
        }
      }
      return selecao;
    } catch {
      return {};
    }
  }

  private carregarFiltro(): boolean {
    try {
      return localStorage.getItem(CHAVE_FILTRO) === 'true';
    } catch {
      return false;
    }
  }

  private salvarFiltro(ligado: boolean): void {
    try {
      localStorage.setItem(CHAVE_FILTRO, String(ligado));
    } catch {
      // sem storage o filtro só não sobrevive a um recarregamento da página
    }
  }

  private salvar(selecao: SelecaoPreLista): void {
    try {
      localStorage.setItem(CHAVE_STORAGE, JSON.stringify(selecao));
    } catch {
      // sem storage a lista continua funcionando só em memória
    }
  }
}
