import { Component, EventEmitter, Output } from '@angular/core';

// Hortifrúti/padaria de loja que não informa a unidade (PRICETAB de 16 posições): o cliente diz
// se o preço do card é do quilo (abre o pesável) ou da unidade (entra como item comum).
@Component({
  selector: 'app-pergunta-unidade',
  standalone: true,
  template: `
    <div class="pergunta-unidade">
      <p class="pergunta-unidade-texto">Este preço é por quilo ou por unidade?</p>
      <p class="pergunta-unidade-dica">Confira na placa da gôndola.</p>
      <div class="pergunta-unidade-botoes">
        <button type="button" (click)="porQuilo.emit()">Por quilo</button>
        <button type="button" (click)="porUnidade.emit()">Por unidade</button>
      </div>
    </div>
  `,
  styles: [`
    .pergunta-unidade {
      margin-top: 12px;
      padding: 12px;
      background: #dbe7f8;
      border-radius: 8px;
    }

    .pergunta-unidade-texto {
      margin: 0;
      font-size: 1.05rem;
      font-weight: 700;
      color: #163a6b;
    }

    .pergunta-unidade-dica {
      margin: 2px 0 10px;
      font-size: 0.85rem;
      color: #334155;
    }

    .pergunta-unidade-botoes {
      display: flex;
      gap: 8px;
    }

    .pergunta-unidade-botoes button {
      flex: 1;
      min-height: 48px;
      font-size: 1.05rem;
      font-weight: 600;
      color: #ffffff;
      background: #15803d;
      border: 0;
      border-radius: 8px;
      cursor: pointer;
    }
  `]
})
export class PerguntaUnidadeComponent {
  @Output() porQuilo = new EventEmitter<void>();
  @Output() porUnidade = new EventEmitter<void>();
}
