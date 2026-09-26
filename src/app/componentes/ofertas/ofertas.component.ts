import { Component, EventEmitter, OnInit, Output, computed } from '@angular/core';
import { OFERTAS, Oferta, OfertasService } from '../../services/ofertas.service';
import { PreListaService } from '../../services/pre-lista.service';

// Tela "Ofertas" (botão dourado abaixo dos modos): os cards das ofertas da loja, cada um com
// "Localizar" (abre o modo 3 com o produto), "Pôr na pré-lista" (o produto exato, não o item
// genérico) e o coração de favoritar, com o filtro "Só favoritas" no topo.
@Component({
  selector: 'app-ofertas',
  standalone: true,
  templateUrl: './ofertas.component.html',
  styleUrl: './ofertas.component.css'
})
export class OfertasComponent implements OnInit {

  // Código de barras da oferta: o ScannerProdutoComponent troca para o localizador.
  @Output() localizar = new EventEmitter<string>();
  // "X" do topo: sai das ofertas e mostra de novo os botões de função.
  @Output() fechar = new EventEmitter<void>();

  // Filtro só vale com alguma favorita: senão a tela ficaria vazia (mesma regra da pré-lista).
  readonly somenteFavoritas = computed(() =>
    this.ofertas.somenteFavoritas() && this.ofertas.totalFavoritas() > 0);

  readonly visiveis = computed<readonly Oferta[]>(() => this.somenteFavoritas()
    ? OFERTAS.filter(oferta => this.ofertas.favoritas().includes(oferta.codigoBarras))
    : OFERTAS);

  constructor(public ofertas: OfertasService, public preLista: PreListaService) {}

  ngOnInit(): void {
    this.ofertas.carregarProdutos();
  }

  // Descrição do banco (ex.: "MAIONESE HELLMANNS 335ML"); null enquanto carrega ou se o produto
  // não existir — aí o botão da pré-lista fica desabilitado.
  descricao(oferta: Oferta): string | null {
    return this.ofertas.produtos()?.[oferta.codigoBarras]?.descricao ?? null;
  }

  alternarPreLista(oferta: Oferta): void {
    const descricao = this.descricao(oferta);
    if (descricao) {
      this.preLista.alternarProduto(oferta.codigoBarras, descricao);
    }
  }
}
