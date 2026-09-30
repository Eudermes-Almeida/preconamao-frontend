import { Component, EventEmitter, OnInit, Output, computed, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PreListaService, SituacaoItem, VisaoPreLista } from '../../services/pre-lista.service';
import { ModalConfirmacaoComponent } from '../modal-confirmacao/modal-confirmacao.component';
import { FamiliaService } from '../../services/familia.service';

interface ItemVisivel {
  // number = item genérico do catálogo; string = código de barras de um produto de oferta.
  id: number | string;
  nome: string;
  // Nas visões sem accordion (A-Z e busca), aparece em letra miúda para situar o item.
  categoria: string;
  situacao: SituacaoItem;
}

interface CategoriaVisivel {
  id: number;
  nome: string;
  // Cabeçalho do accordion: "concluidos/marcados" daquela categoria.
  marcados: number;
  concluidos: number;
  itens: ItemVisivel[];
}

// Accordion da visão A-Z: os itens que começam com a mesma letra.
interface GrupoLetra {
  letra: string;
  marcados: number;
  concluidos: number;
  itens: ItemVisivel[];
}

interface OpcaoVisao {
  valor: VisaoPreLista;
  rotulo: string;
  // "d" de um <path> de ícone 24x24 (Material Icons).
  icone: string;
}

// Comparação e busca sem diferenciar maiúscula nem acento ("acucar" acha "Açúcar").
const normalizar = (texto: string) =>
  texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

const porNome = (a: { nome: string }, b: { nome: string }) =>
  a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' });

// Modo 4 do app: a pré-lista com checkbox e quantidade por item, em três visões — por categoria
// (accordions), tudo em ordem alfabética, ou busca por texto. Os itens são riscados sozinhos
// pelo PreListaService conforme o carrinho.
@Component({
  selector: 'app-pre-lista',
  standalone: true,
  imports: [ModalConfirmacaoComponent, NgTemplateOutlet],
  templateUrl: './pre-lista.component.html',
  styleUrl: './pre-lista.component.css'
})
export class PreListaComponent implements OnInit {

  // "X" do cabeçalho: o ScannerProdutoComponent sai da pré-lista e mostra de novo os botões de função.
  @Output() fechar = new EventEmitter<void>();

  readonly opcoesVisao: OpcaoVisao[] = [
    // Ordem pedida pelo usuário: Buscar, De A a Z, Por categoria.
    // Lupa.
    { valor: 'busca', rotulo: 'Buscar', icone: 'M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5Zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14Z' },
    // "AZ" com seta para baixo = ordem alfabética.
    { valor: 'alfabetica', rotulo: 'De A a Z', icone: 'M14.94 4.66h-4.72l2.36-2.36 2.36 2.36Zm-4.69 14.71h4.66l-2.33 2.33-2.33-2.33ZM6.1 6.27 1.6 17.73h1.84l.92-2.45h5.11l.92 2.45h1.84L7.74 6.27H6.1Zm-1.13 7.37 1.94-5.18 1.94 5.18H4.97Zm10.76 2.5h6.12v1.59h-8.53v-1.29l5.92-8.56h-5.88v-1.6h8.3v1.26l-5.93 8.6Z' },
    // Formas agrupadas = categorias.
    { valor: 'categoria', rotulo: 'Por categoria', icone: 'M12 2 6.5 11h11L12 2Zm5.5 11a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9ZM3 21.5h8v-8H3v8Z' },
  ];

  // "Ver só minha lista": no mercado, esconde os itens não marcados e abre as categorias. O
  // estado mora no PreListaService (sobrevive à troca de modo); só vale com algum item marcado —
  // senão, com o filtro ligado e a lista vazia, a tela ficaria sem itens e sem o botão de desligar.
  readonly somenteMarcados = computed(() =>
    this.preLista.somenteMarcados() && this.preLista.totalSelecionados() > 0);

  // Só um accordion aberto por vez (pedido do usuário): abrir um fecha o anterior. Controlado
  // aqui, não pelo atributo nativo <details name>, que não existe em iOS < 17.2 / Chrome < 120.
  // Chave "categoria-<id>" na visão por categoria e "letra-<A>" na visão A-Z.
  readonly abaAberta = signal<string | null>(null);

  // Modal "Limpar pré-lista?" (mesmo componente do "Limpar tudo" do header).
  readonly confirmandoLimpeza = signal(false);

  // Recalcula sozinho quando muda a seleção, o carrinho (riscados) ou o filtro. Itens em ordem
  // alfabética dentro de cada categoria; as categorias mantêm a ordem do catálogo.
  readonly categorias = computed<CategoriaVisivel[]>(() => {
    const somenteMarcados = this.somenteMarcados();
    return (this.preLista.catalogo() ?? [])
      .map(categoria => {
        const itens = categoria.itens
          .map(item => ({
            id: item.id,
            nome: item.nome,
            categoria: categoria.nome,
            situacao: this.preLista.situacao(item.id),
          }))
          .filter(item => !somenteMarcados || item.situacao.selecionado)
          .sort(porNome);
        const marcados = itens.filter(item => item.situacao.selecionado);
        return {
          id: categoria.id,
          nome: categoria.nome,
          marcados: marcados.length,
          concluidos: marcados.filter(item => item.situacao.concluido).length,
          itens,
        };
      })
      .filter(categoria => categoria.itens.length > 0);
  });

  // Produtos exatos postos pela tela "Ofertas": accordion próprio no topo das visões por
  // categoria e A-Z, e misturados aos resultados da busca.
  readonly produtosOferta = computed<ItemVisivel[]>(() =>
    Object.entries(this.preLista.produtos())
      .map(([codigoBarras, produto]) => ({
        id: codigoBarras,
        nome: produto.descricao,
        categoria: 'Oferta',
        situacao: this.preLista.situacaoProduto(codigoBarras),
      }))
      .sort(porNome));

  readonly ofertasConcluidas = computed(() =>
    this.produtosOferta().filter(produto => produto.situacao.concluido).length);

  // Todos os itens sem categoria, em ordem alfabética (base das visões A-Z e busca).
  private readonly todosItens = computed<ItemVisivel[]>(() =>
    this.categorias().flatMap(categoria => categoria.itens).sort(porNome));

  // Visão A-Z: um accordion por letra inicial, com o mesmo contador das categorias.
  readonly gruposPorLetra = computed<GrupoLetra[]>(() => {
    const grupos: GrupoLetra[] = [];
    for (const item of this.todosItens()) {
      const letra = normalizar(item.nome).charAt(0).toUpperCase();
      let grupo = grupos[grupos.length - 1];
      if (grupo?.letra !== letra) {
        grupo = { letra, marcados: 0, concluidos: 0, itens: [] };
        grupos.push(grupo);
      }
      grupo.itens.push(item);
      if (item.situacao.selecionado) {
        grupo.marcados++;
        if (item.situacao.concluido) {
          grupo.concluidos++;
        }
      }
    }
    return grupos;
  });

  // Itens genéricos + produtos de oferta numa lista só, em ordem alfabética (busca e "minha lista" A-Z).
  readonly itensEProdutos = computed<ItemVisivel[]>(() =>
    [...this.todosItens(), ...this.produtosOferta()].sort(porNome));

  // "Ver só minha lista", em qualquer visão: poucos itens, então sem accordions — a lista direto,
  // em ordem alfabética, com os produtos de oferta misturados (pedido do usuário).
  readonly minhaListaPlana = computed(() => this.somenteMarcados());

  // Busca: primeiro os que COMEÇAM com o texto, depois os que têm uma palavra começando com ele,
  // por fim os que só o CONTÊM no meio; cada grupo em ordem alfabética. Sem texto, mostra tudo.
  readonly resultadosBusca = computed<ItemVisivel[]>(() => {
    const termo = normalizar(this.preLista.textoBusca());
    const todos = this.itensEProdutos();
    if (!termo) {
      return todos;
    }
    const relevancia = (nome: string) => {
      const normalizado = normalizar(nome);
      if (normalizado.startsWith(termo)) return 0;
      if (normalizado.split(/\s+/).some(palavra => palavra.startsWith(termo))) return 1;
      return normalizado.includes(termo) ? 2 : -1;
    };
    return todos
      .map(item => ({ item, nota: relevancia(item.nome) }))
      .filter(({ nota }) => nota >= 0)
      .sort((a, b) => a.nota - b.nota)   // sort estável: mantém a ordem alfabética em cada nota
      .map(({ item }) => item);
  });

  constructor(public preLista: PreListaService, public familia: FamiliaService) {}

  ngOnInit(): void {
    this.preLista.carregarCatalogo();
  }

  // Checkbox e quantidade da linha: item genérico (id numérico) ou produto de oferta (código).
  alternar(item: ItemVisivel): void {
    if (typeof item.id === 'string') {
      this.preLista.alternarProduto(item.id, item.nome);
    } else {
      this.preLista.alternar(item.id);
    }
  }

  incrementar(item: ItemVisivel): void {
    if (typeof item.id === 'string') {
      this.preLista.incrementarProduto(item.id);
    } else {
      this.preLista.incrementar(item.id);
    }
  }

  decrementar(item: ItemVisivel): void {
    if (typeof item.id === 'string') {
      this.preLista.decrementarProduto(item.id);
    } else {
      this.preLista.decrementar(item.id);
    }
  }

  escolherVisao(visao: VisaoPreLista): void {
    this.preLista.visao.set(visao);
  }

  digitarBusca(evento: Event): void {
    this.preLista.textoBusca.set((evento.target as HTMLInputElement).value);
  }

  limparBusca(campo: HTMLInputElement): void {
    this.preLista.textoBusca.set('');
    campo.focus();
  }

  alternarAba(evento: Event, chave: string): void {
    // Sem isto o <details> abre/fecha sozinho e brigaria com o [open] controlado pelo signal.
    evento.preventDefault();
    const abrindo = this.abaAberta() !== chave;
    this.abaAberta.set(abrindo ? chave : null);

    // Leva o cabeçalho tocado para o topo da tela, logo depois de redesenhar: se a aba de cima
    // fechou, o conteúdo subiu; e uma aba aberta lá no fim da tela teria os itens fora da vista.
    if (abrindo) {
      const cabecalho = evento.currentTarget as HTMLElement;
      setTimeout(() => cabecalho.scrollIntoView({ block: 'start', behavior: 'smooth' }));
    }
  }

  alternarSomenteMarcados(): void {
    this.preLista.alternarSomenteMarcados();
  }

  pedirConfirmacaoDeLimpeza(): void {
    this.confirmandoLimpeza.set(true);
  }

  cancelarLimpeza(): void {
    this.confirmandoLimpeza.set(false);
  }

  confirmarLimpeza(): void {
    this.preLista.limpar();
    this.confirmandoLimpeza.set(false);
  }
}
