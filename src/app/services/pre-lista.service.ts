import { Injectable, computed, effect, signal, untracked } from '@angular/core';
import { CarrinhoService } from './carrinho.service';
import { PreListaCategoriaDTO, ProdutoApiService } from './produto-api.service';

// id do item da pré-lista -> quantidade que o cliente pretende comprar.
export type SelecaoPreLista = Record<number, number>;

// Produtos exatos postos na lista pela tela "Ofertas" (ex.: MAIONESE HELLMANNS 335ML), por código
// de barras. Riscados só quando AQUELE produto entra no carrinho, diferente dos itens genéricos.
export interface ProdutoPreLista {
  descricao: string;
  quantidade: number;
}
export type ProdutosPreLista = Record<string, ProdutoPreLista>;

// Itens trocados pela "Família" (ver FamiliaService): mesmo formato da seleção e dos produtos,
// com o id do item como texto (é o formato do JSON).
export interface ConteudoLista {
  itens: Record<string, number>;
  produtos: ProdutosPreLista;
  // Lembrete da linha ("Codil - 5 kg", falado ou digitado), pela chave da linha (id do item ou código de barras).
  // Opcional: lista de app antigo não tem.
  lembretes?: Record<string, string>;
}

// Chave do lembrete: o id do item genérico ou o código de barras do produto exato (ids têm poucos
// dígitos e códigos de barras 8 ou mais, então não se confundem). É também a chave na Família.
export type ChaveLembrete = number | string;

// Soma de quantidades ao juntar listas nunca passa disto (mesmo limite da API).
const QUANTIDADE_MAXIMA = 99;

// Tamanho máximo do lembrete de uma linha (mesmo limite da API da Família).
export const LEMBRETE_MAXIMO = 40;

// Como a tela monta a lista: falando item a item, busca, tudo em ordem alfabética, ou por categoria.
export type VisaoPreLista = 'voz' | 'categoria' | 'alfabetica' | 'busca';

export interface SituacaoItem {
  selecionado: boolean;
  planejado: number;
  // Unidades já no carrinho de produtos que atendem este item (ex.: 2 detergentes de marcas diferentes).
  noCarrinho: number;
  // Riscado: o carrinho já tem pelo menos a quantidade planejada.
  concluido: boolean;
}

const CHAVE_STORAGE = 'preconamao.prelista';
const CHAVE_PRODUTOS = 'preconamao.prelista.produtos';
const CHAVE_LEMBRETES = 'preconamao.prelista.lembretes';
const CHAVE_FILTRO = 'preconamao.prelista.somenteMarcados';
const CHAVE_VISAO = 'preconamao.prelista.visao';
const VISOES: VisaoPreLista[] = ['voz', 'categoria', 'alfabetica', 'busca'];

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

  private readonly produtosState = signal<ProdutosPreLista>(this.carregarProdutos());
  readonly produtos = this.produtosState.asReadonly();

  // "15 kg", "Codil - 5 kg": a marca e a medida que o cliente falou, mostradas na linha. Não conta
  // para riscar (quem risca é a quantidade).
  private readonly lembretesState = signal<Record<string, string>>(this.carregarLembretes());
  readonly lembretes = this.lembretesState.asReadonly();

  // Filtro "Ver só minha lista". Fica aqui (e no storage), não na tela: o PreListaComponent é
  // destruído ao trocar de modo, e o filtro precisa continuar ligado na volta (pedido do usuário).
  readonly somenteMarcados = signal<boolean>(this.carregarFiltro());

  // Visão escolhida e texto da busca: aqui pelo mesmo motivo do filtro (sobrevivem à troca de
  // modo). Só a visão vai para o storage; a busca recomeça vazia ao reabrir o app.
  readonly visao = signal<VisaoPreLista>(this.carregarVisao());
  readonly textoBusca = signal('');

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

  // Itens genéricos + produtos de oferta: os dois contam no progresso e no "lista completa".
  readonly totalSelecionados = computed(() =>
    Object.keys(this.selecaoState()).length + Object.keys(this.produtosState()).length);

  readonly totalConcluidos = computed(() => {
    const noCarrinho = this.noCarrinhoPorItem();
    const itens = Object.entries(this.selecaoState())
      .filter(([id, planejado]) => (noCarrinho.get(Number(id)) ?? 0) >= planejado)
      .length;
    const produtos = Object.entries(this.produtosState())
      .filter(([codigo, produto]) => this.carrinho.quantidadeDe(codigo) >= produto.quantidade)
      .length;
    return itens + produtos;
  });

  readonly completa = computed(() =>
    this.totalSelecionados() > 0 && this.totalConcluidos() === this.totalSelecionados());

  constructor(private carrinho: CarrinhoService, private api: ProdutoApiService) {
    effect(() => this.salvar(this.selecaoState()));
    effect(() => this.salvarProdutos(this.produtosState()));
    effect(() => this.salvarLembretes(this.lembretesState()));
    effect(() => this.salvarFiltro(this.somenteMarcados()));
    effect(() => this.salvarVisao(this.visao()));

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

  situacaoProduto(codigoBarras: string): SituacaoItem {
    const produto = this.produtosState()[codigoBarras];
    const noCarrinho = this.carrinho.quantidadeDe(codigoBarras);
    return {
      selecionado: produto !== undefined,
      planejado: produto?.quantidade ?? 1,
      noCarrinho,
      concluido: produto !== undefined && noCarrinho >= produto.quantidade,
    };
  }

  temProduto(codigoBarras: string): boolean {
    return this.produtosState()[codigoBarras] !== undefined;
  }

  // Botão "Pôr na pré-lista" da oferta e checkbox da linha do produto: inclui com quantidade 1
  // ou tira (um produto desmarcado sai da lista, já que não faz parte do catálogo fixo).
  alternarProduto(codigoBarras: string, descricao: string): void {
    const saiu = this.temProduto(codigoBarras);
    this.produtosState.update(produtos => {
      const { [codigoBarras]: atual, ...resto } = produtos;
      return atual === undefined ? { ...produtos, [codigoBarras]: { descricao, quantidade: 1 } } : resto;
    });
    if (saiu) {
      this.esquecerLembretes([codigoBarras]);
    }
    this.desligarFiltroSeVazia();
  }

  // Pré-lista por voz: o item falado entra SOMANDO com o que já estava na lista (decisão do
  // usuário, igual à Família) e o lembrete falado ("Codil - 5 kg") substitui o anterior.
  adicionarFalado(itemId: number, quantidade: number, lembrete: string | null): void {
    this.selecaoState.update(selecao => ({
      ...selecao,
      [itemId]: Math.min(QUANTIDADE_MAXIMA, (selecao[itemId] ?? 0) + quantidade),
    }));
    this.guardarLembrete(itemId, lembrete);
  }

  lembrete(chave: ChaveLembrete): string | null {
    return this.lembretesState()[String(chave)] ?? null;
  }

  // ✏️ da linha (Buscar, A-Z, categoria, ofertas): grava o que o cliente digitou; vazio apaga.
  definirLembrete(chave: ChaveLembrete, texto: string): void {
    if (texto.trim()) {
      this.guardarLembrete(chave, texto);
    } else {
      this.esquecerLembretes([chave]);
    }
  }

  private guardarLembrete(chave: ChaveLembrete, lembrete: string | null): void {
    const texto = lembrete?.trim().slice(0, LEMBRETE_MAXIMO);
    if (texto) {
      this.lembretesState.update(lembretes => ({ ...lembretes, [String(chave)]: texto }));
    }
  }

  private esquecerLembretes(chaves: readonly ChaveLembrete[]): void {
    const atuais = this.lembretesState();
    if (!chaves.some(chave => atuais[String(chave)] !== undefined)) {
      return;
    }
    const resto = { ...atuais };
    chaves.forEach(chave => delete resto[String(chave)]);
    this.lembretesState.set(resto);
  }

  incrementarProduto(codigoBarras: string): void {
    this.produtosState.update(produtos => {
      const produto = produtos[codigoBarras];
      return produto ? { ...produtos, [codigoBarras]: { ...produto, quantidade: produto.quantidade + 1 } } : produtos;
    });
  }

  decrementarProduto(codigoBarras: string): void {
    this.produtosState.update(produtos => {
      const produto = produtos[codigoBarras];
      return produto && produto.quantidade > 1
        ? { ...produtos, [codigoBarras]: { ...produto, quantidade: produto.quantidade - 1 } }
        : produtos;
    });
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
    const saiu = this.selecaoState()[itemId] !== undefined;
    this.selecaoState.update(selecao => {
      const { [itemId]: atual, ...resto } = selecao;
      return atual === undefined ? { ...selecao, [itemId]: 1 } : resto;
    });
    if (saiu) {
      this.esquecerLembretes([itemId]);
    }
    this.desligarFiltroSeVazia();
  }

  // Lista esvaziada desmarcando item a item: desliga o filtro de verdade, senão o próximo item
  // marcado faria os outros 165 sumirem de repente.
  private desligarFiltroSeVazia(): void {
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

  // "Família": o que vai no envio são os itens ainda não riscados (os já comprados ficam).
  readonly paraEnviar = computed<ConteudoLista>(() => {
    const itens: Record<string, number> = {};
    for (const [id, quantidade] of Object.entries(this.selecaoState())) {
      if (!this.situacao(Number(id)).concluido) {
        itens[id] = quantidade;
      }
    }
    const produtos: ProdutosPreLista = {};
    for (const [codigo, produto] of Object.entries(this.produtosState())) {
      if (!this.situacaoProduto(codigo).concluido) {
        produtos[codigo] = produto;
      }
    }
    const lembretes: Record<string, string> = {};
    for (const [chave, lembrete] of Object.entries(this.lembretesState())) {
      if (itens[chave] !== undefined || produtos[chave] !== undefined) {
        lembretes[chave] = lembrete;
      }
    }
    return Object.keys(lembretes).length > 0 ? { itens, produtos, lembretes } : { itens, produtos };
  });

  readonly totalParaEnviar = computed(() =>
    Object.keys(this.paraEnviar().itens).length + Object.keys(this.paraEnviar().produtos).length);

  // Depois de enviar, os itens saem desta lista (decisão do usuário: como entregar um bilhete; um
  // segundo envio leva só o que for novo, e a soma do outro lado não duplica).
  removerEnviados(conteudo: ConteudoLista): void {
    this.selecaoState.update(selecao => {
      const resto = { ...selecao };
      Object.keys(conteudo.itens).forEach(id => delete resto[Number(id)]);
      return resto;
    });
    this.produtosState.update(produtos => {
      const resto = { ...produtos };
      Object.keys(conteudo.produtos).forEach(codigo => delete resto[codigo]);
      return resto;
    });
    this.esquecerLembretes([...Object.keys(conteudo.itens), ...Object.keys(conteudo.produtos)]);
    this.desligarFiltroSeVazia();
  }

  // Lista recebida da "Família": entra somando (decisão do usuário) — Arroz 1 aqui + 2 recebidos = 3.
  juntar(conteudo: ConteudoLista): void {
    this.selecaoState.update(selecao => {
      const juntos = { ...selecao };
      for (const [id, quantidade] of Object.entries(conteudo.itens)) {
        juntos[Number(id)] = Math.min(QUANTIDADE_MAXIMA, (juntos[Number(id)] ?? 0) + quantidade);
      }
      return juntos;
    });
    this.produtosState.update(produtos => {
      const juntos = { ...produtos };
      for (const [codigo, produto] of Object.entries(conteudo.produtos)) {
        const atual = juntos[codigo]?.quantidade ?? 0;
        juntos[codigo] = { descricao: produto.descricao, quantidade: Math.min(QUANTIDADE_MAXIMA, atual + produto.quantidade) };
      }
      return juntos;
    });
    // Lembrete recebido vale mais que o daqui (é o mais recente).
    for (const [chave, lembrete] of Object.entries(conteudo.lembretes ?? {})) {
      if (typeof lembrete === 'string' && lembrete.trim()) {
        this.guardarLembrete(chave, lembrete.trim());
      }
    }
  }

  // Nome de um item genérico pelo id (catálogo carregado), para mostrar uma lista recebida.
  nomeDoItem(id: number): string | null {
    for (const categoria of this.catalogo() ?? []) {
      const item = categoria.itens.find(i => i.id === id);
      if (item) {
        return item.nome;
      }
    }
    return null;
  }

  limpar(): void {
    this.selecaoState.set({});
    this.produtosState.set({});
    this.lembretesState.set({});
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

  private carregarProdutos(): ProdutosPreLista {
    try {
      const dados: unknown = JSON.parse(localStorage.getItem(CHAVE_PRODUTOS) ?? '{}');
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        return {};
      }
      const produtos: ProdutosPreLista = {};
      for (const [codigo, produto] of Object.entries(dados as Record<string, Partial<ProdutoPreLista>>)) {
        if (typeof produto?.descricao === 'string' && Number.isInteger(produto.quantidade) && produto.quantidade! >= 1) {
          produtos[codigo] = { descricao: produto.descricao, quantidade: produto.quantidade! };
        }
      }
      return produtos;
    } catch {
      return {};
    }
  }

  private carregarLembretes(): Record<string, string> {
    try {
      const dados: unknown = JSON.parse(localStorage.getItem(CHAVE_LEMBRETES) ?? '{}');
      if (!dados || typeof dados !== 'object' || Array.isArray(dados)) {
        return {};
      }
      return Object.fromEntries(Object.entries(dados).filter(([, texto]) => typeof texto === 'string' && texto.trim()));
    } catch {
      return {};
    }
  }

  private salvarLembretes(lembretes: Record<string, string>): void {
    try {
      localStorage.setItem(CHAVE_LEMBRETES, JSON.stringify(lembretes));
    } catch {
      // sem storage os lembretes continuam valendo só em memória
    }
  }

  private salvarProdutos(produtos: ProdutosPreLista): void {
    try {
      localStorage.setItem(CHAVE_PRODUTOS, JSON.stringify(produtos));
    } catch {
      // sem storage os produtos da lista continuam valendo só em memória
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

  private carregarVisao(): VisaoPreLista {
    try {
      const salva = localStorage.getItem(CHAVE_VISAO) as VisaoPreLista;
      return VISOES.includes(salva) ? salva : 'busca';
    } catch {
      return 'busca';
    }
  }

  private salvarVisao(visao: VisaoPreLista): void {
    try {
      localStorage.setItem(CHAVE_VISAO, visao);
    } catch {
      // sem storage a visão só volta para "por categoria" ao recarregar a página
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
