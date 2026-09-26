import { Component, OnInit, computed, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { PreListaService, SituacaoItem, VisaoPreLista } from '../../services/pre-lista.service';
import { ModalConfirmacaoComponent } from '../modal-confirmacao/modal-confirmacao.component';

interface ItemVisivel {
  id: number;
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

  readonly opcoesVisao: OpcaoVisao[] = [
    { valor: 'categoria', rotulo: 'Por categoria' },
    { valor: 'alfabetica', rotulo: 'De A a Z' },
    { valor: 'busca', rotulo: 'Buscar' },
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

  // Busca: primeiro os que COMEÇAM com o texto, depois os que têm uma palavra começando com ele,
  // por fim os que só o CONTÊM no meio; cada grupo em ordem alfabética. Sem texto, mostra tudo.
  readonly resultadosBusca = computed<ItemVisivel[]>(() => {
    const termo = normalizar(this.preLista.textoBusca());
    if (!termo) {
      return this.todosItens();
    }
    const relevancia = (nome: string) => {
      const normalizado = normalizar(nome);
      if (normalizado.startsWith(termo)) return 0;
      if (normalizado.split(/\s+/).some(palavra => palavra.startsWith(termo))) return 1;
      return normalizado.includes(termo) ? 2 : -1;
    };
    return this.todosItens()
      .map(item => ({ item, nota: relevancia(item.nome) }))
      .filter(({ nota }) => nota >= 0)
      .sort((a, b) => a.nota - b.nota)   // sort estável: mantém a ordem alfabética em cada nota
      .map(({ item }) => item);
  });

  constructor(public preLista: PreListaService) {}

  ngOnInit(): void {
    this.preLista.carregarCatalogo();
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
