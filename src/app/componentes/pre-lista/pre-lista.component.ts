import { Component, OnInit, computed, signal } from '@angular/core';
import { PreListaService, SituacaoItem } from '../../services/pre-lista.service';
import { ModalConfirmacaoComponent } from '../modal-confirmacao/modal-confirmacao.component';

interface ItemVisivel {
  id: number;
  nome: string;
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

// Modo 4 do app: a pré-lista em accordions (uma categoria por accordion), com checkbox e
// quantidade por item. Os itens são riscados sozinhos pelo PreListaService conforme o carrinho.
@Component({
  selector: 'app-pre-lista',
  standalone: true,
  imports: [ModalConfirmacaoComponent],
  templateUrl: './pre-lista.component.html',
  styleUrl: './pre-lista.component.css'
})
export class PreListaComponent implements OnInit {

  // "Ver só minha lista": no mercado, esconde os itens não marcados e abre as categorias. O
  // estado mora no PreListaService (sobrevive à troca de modo); só vale com algum item marcado —
  // senão, com o filtro ligado e a lista vazia, a tela ficaria sem itens e sem o botão de desligar.
  readonly somenteMarcados = computed(() =>
    this.preLista.somenteMarcados() && this.preLista.totalSelecionados() > 0);

  // Só um accordion aberto por vez (pedido do usuário): abrir um fecha o anterior. Controlado
  // aqui, não pelo atributo nativo <details name>, que não existe em iOS < 17.2 / Chrome < 120.
  readonly categoriaAberta = signal<number | null>(null);

  // Modal "Limpar pré-lista?" (mesmo componente do "Limpar tudo" do header).
  readonly confirmandoLimpeza = signal(false);

  // Recalcula sozinho quando muda a seleção, o carrinho (riscados) ou o filtro.
  readonly categorias = computed<CategoriaVisivel[]>(() => {
    const somenteMarcados = this.somenteMarcados();
    return (this.preLista.catalogo() ?? [])
      .map(categoria => {
        const itens = categoria.itens
          .map(item => ({ id: item.id, nome: item.nome, situacao: this.preLista.situacao(item.id) }))
          .filter(item => !somenteMarcados || item.situacao.selecionado);
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

  constructor(public preLista: PreListaService) {}

  ngOnInit(): void {
    this.preLista.carregarCatalogo();
  }

  alternarCategoria(evento: Event, categoriaId: number): void {
    // Sem isto o <details> abre/fecha sozinho e brigaria com o [open] controlado pelo signal.
    evento.preventDefault();
    const abrindo = this.categoriaAberta() !== categoriaId;
    this.categoriaAberta.set(abrindo ? categoriaId : null);

    // Ao abrir uma categoria abaixo de outra que estava aberta, a de cima fecha e o conteúdo
    // sobe: traz o cabeçalho tocado de volta para a vista, logo depois de a tela redesenhar.
    if (abrindo) {
      const cabecalho = evento.currentTarget as HTMLElement;
      setTimeout(() => cabecalho.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
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
