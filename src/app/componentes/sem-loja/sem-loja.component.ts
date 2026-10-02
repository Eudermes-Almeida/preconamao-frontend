import { Component } from '@angular/core';
import { LojaService } from '../../services/loja.service';

// No lugar do leitor, da voz e do localizador enquanto não há loja escolhida (com "Exigir
// localização" ligado): sem loja, nada de preço.
@Component({
  selector: 'app-sem-loja',
  standalone: true,
  template: `
    <div class="sem-loja" role="status">
      <p class="titulo">📍 Para ver preços, informe em qual loja você está</p>
      <p class="texto">Os preços do app valem somente dentro de uma loja parceira. A pré-lista, a Família e as ofertas continuam liberadas.</p>
      <button type="button" class="botao" (click)="loja.abrirEscolha()">Escolher a loja</button>
    </div>
  `,
  styles: `
    .sem-loja {
      padding: 16px;
      text-align: center;
      background: #fff7ed;
      border: 2px solid #fdba74;
      border-radius: 14px;
    }
    .titulo {
      margin: 0 0 6px;
      font-size: 1.1rem;
      font-weight: 700;
      color: #7c2d12;
    }
    .texto {
      margin: 0 0 12px;
      font-size: 0.9rem;
      line-height: 1.4;
      color: #475569;
    }
    .botao {
      width: 100%;
      min-height: 48px;
      font-size: 1rem;
      font-weight: 600;
      color: #ffffff;
      background: #15803d;
      border: 0;
      border-radius: 10px;
      cursor: pointer;
    }
  `
})
export class SemLojaComponent {

  constructor(public loja: LojaService) {}
}
