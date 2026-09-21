import { Component } from '@angular/core';
import { CarrinhoService } from '../../services/carrinho.service';
import { formatarCentavos } from '../../utils/formatar-moeda';

@Component({
  selector: 'app-carrinho',
  standalone: true,
  imports: [],
  templateUrl: './carrinho.component.html',
  styleUrl: './carrinho.component.css'
})
export class CarrinhoComponent {

  readonly formatar = formatarCentavos;

  constructor(public carrinho: CarrinhoService) {}

  // Os botões do carrinho ficam ao lado do campo do leitor USB: se o clique tirasse o foco
  // do campo, os primeiros dígitos da próxima bipagem se perderiam.
  manterFocoNoCampo(evento: MouseEvent): void {
    evento.preventDefault();
  }

  limparCarrinho(): void {
    if (confirm('Remover todos os itens do carrinho?')) {
      this.carrinho.limpar();
    }
  }

  finalizarCompra(): void {
    if (confirm('Finalizar a compra e esvaziar o carrinho?')) {
      this.carrinho.limpar();
    }
  }
}
