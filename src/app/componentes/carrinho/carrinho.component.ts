import { Component, EventEmitter, Output } from '@angular/core';
import { CarrinhoService } from '../../services/carrinho.service';
import { PublicidadeService } from '../../services/publicidade.service';
import { formatarCentavos } from '../../utils/formatar-moeda';
import { AvisoConferenciaModalComponent } from '../aviso-conferencia-modal/aviso-conferencia-modal.component';
import { BANNER_SOMA, BannerTelaCheiaComponent } from '../banner-tela-cheia/banner-tela-cheia.component';

@Component({
  selector: 'app-carrinho',
  standalone: true,
  imports: [AvisoConferenciaModalComponent, BannerTelaCheiaComponent],
  templateUrl: './carrinho.component.html',
  styleUrl: './carrinho.component.css'
})
export class CarrinhoComponent {

  readonly formatar = formatarCentavos;

  // Botão "Valor Total" do cabeçalho: primeiro o banner da "somatória em processamento" (espaço
  // publicitário; enquanto isso os preços do carrinho são reconferidos), depois o aviso de
  // conferência + subtotal em destaque.
  readonly bannerSoma = BANNER_SOMA;
  mostrandoBannerSoma = false;
  mostrandoValorTotal = false;

  // Avisa o scanner para não aceitar bipagens do leitor USB por trás do modal.
  @Output() valorTotalAberto = new EventEmitter<boolean>();

  abrirValorTotal(): void {
    // O total mostrado usa os preços atuais (atualiza em seguida, se algum tiver mudado).
    this.carrinho.revalidar();
    // Publicidade desligada: sem banner, o total abre na hora.
    if (this.publicidade.ativa) {
      this.mostrandoBannerSoma = true;
    } else {
      this.mostrandoValorTotal = true;
    }
    this.valorTotalAberto.emit(true);
  }

  aoTerminarSoma(): void {
    this.mostrandoBannerSoma = false;
    this.mostrandoValorTotal = true;
  }

  fecharValorTotal(): void {
    this.mostrandoValorTotal = false;
    this.valorTotalAberto.emit(false);
  }

  constructor(public carrinho: CarrinhoService, private publicidade: PublicidadeService) {}

  limparCarrinho(): void {
    if (confirm('Remover todos os itens do carrinho?')) {
      this.carrinho.limpar();
    }
  }
}
