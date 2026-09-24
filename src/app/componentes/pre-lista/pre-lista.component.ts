import { Component, OnInit, computed, signal } from '@angular/core';
import { PreListaService, SituacaoItem } from '../../services/pre-lista.service';

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
  templateUrl: './pre-lista.component.html',
  styleUrl: './pre-lista.component.css'
})
export class PreListaComponent implements OnInit {

  // "Ver só minha lista": no mercado, esconde os itens não marcados e abre as categorias.
  readonly somenteMarcados = signal(false);

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

  alternarSomenteMarcados(): void {
    this.somenteMarcados.update(valor => !valor);
  }

  limparLista(): void {
    if (confirm('Desmarcar todos os itens da pré-lista?')) {
      this.preLista.limpar();
      this.somenteMarcados.set(false);
    }
  }
}
