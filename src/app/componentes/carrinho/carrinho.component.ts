import { Component, EventEmitter, Output } from '@angular/core';
import { CarrinhoService } from '../../services/carrinho.service';
import { formatarCentavos } from '../../utils/formatar-moeda';
import { AvisoConferenciaModalComponent } from '../aviso-conferencia-modal/aviso-conferencia-modal.component';

@Component({
  selector: 'app-carrinho',
  standalone: true,
  imports: [AvisoConferenciaModalComponent],
  templateUrl: './carrinho.component.html',
  styleUrl: './carrinho.component.css'
})
export class CarrinhoComponent {

  readonly formatar = formatarCentavos;

  // Botão "Valor Total" do cabeçalho: aviso de conferência + subtotal em destaque.
  mostrandoValorTotal = false;

  // Avisa o scanner para não aceitar bipagens do leitor USB por trás do modal.
  @Output() valorTotalAberto = new EventEmitter<boolean>();

  abrirValorTotal(): void {
    this.mostrandoValorTotal = true;
    this.valorTotalAberto.emit(true);
  }

  fecharValorTotal(): void {
    this.mostrandoValorTotal = false;
    this.valorTotalAberto.emit(false);
  }

  constructor(public carrinho: CarrinhoService) {}

  limparCarrinho(): void {
    if (confirm('Remover todos os itens do carrinho?')) {
      this.carrinho.limpar();
    }
  }
}
