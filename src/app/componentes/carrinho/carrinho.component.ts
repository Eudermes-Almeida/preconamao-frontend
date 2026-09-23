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

  limparCarrinho(): void {
    if (confirm('Remover todos os itens do carrinho?')) {
      this.carrinho.limpar();
    }
  }
}
