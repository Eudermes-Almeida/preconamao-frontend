import { Component, EventEmitter, Output } from '@angular/core';
import { CarrinhoService } from '../../services/carrinho.service';
import { PublicidadeService } from '../../services/publicidade.service';
import { formatarCentavos } from '../../utils/formatar-moeda';
import { AvisoConferenciaModalComponent } from '../aviso-conferencia-modal/aviso-conferencia-modal.component';
import { BANNER_LIMPAR_CARRINHO, BANNER_SOMA, BannerTelaCheiaComponent } from '../banner-tela-cheia/banner-tela-cheia.component';
import { ModalConfirmacaoComponent } from '../modal-confirmacao/modal-confirmacao.component';

@Component({
  selector: 'app-carrinho',
  standalone: true,
  imports: [AvisoConferenciaModalComponent, BannerTelaCheiaComponent, ModalConfirmacaoComponent],
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

  // "Limpar Carrinho": depois da confirmação, o banner da "limpeza em processamento" (espaço
  // publicitário) e só então o carrinho esvazia. Publicidade desligada: esvazia na hora.
  readonly bannerLimpar = BANNER_LIMPAR_CARRINHO;
  mostrandoBannerLimpar = false;
  // Confirmação no modal do sistema (antes era o confirm() do navegador).
  confirmandoLimpeza = false;

  limparCarrinho(): void {
    this.confirmandoLimpeza = true;
    this.valorTotalAberto.emit(true);
  }

  cancelarLimpeza(): void {
    this.confirmandoLimpeza = false;
    this.valorTotalAberto.emit(false);
  }

  confirmarLimpeza(): void {
    this.confirmandoLimpeza = false;
    if (this.publicidade.ativa) {
      this.mostrandoBannerLimpar = true;
    } else {
      this.carrinho.limpar();
      this.valorTotalAberto.emit(false);
    }
  }

  aoTerminarLimpeza(): void {
    this.mostrandoBannerLimpar = false;
    this.valorTotalAberto.emit(false);
    this.carrinho.limpar();
  }
}
