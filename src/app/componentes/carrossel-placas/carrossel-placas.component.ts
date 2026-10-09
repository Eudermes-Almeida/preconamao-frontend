import { Component } from '@angular/core';

export interface PlacaCarrossel {
  imagem: string;
  marca: string;
}

// Peças 5:1 (1000x200) geradas a partir de CARROSSEL_IMAGENS/ na raiz do projeto. Ordem intercalada
// (alimento, higiene/limpeza...) para marcas parecidas não passarem juntas.
export const PLACAS_CARROSSEL: PlacaCarrossel[] = [
  { imagem: 'assets/carrossel/friboi.jpg', marca: 'Friboi' },
  { imagem: 'assets/carrossel/colgate.jpg', marca: 'Colgate' },
  { imagem: 'assets/carrossel/kibon.jpg', marca: 'Kibon' },
  { imagem: 'assets/carrossel/ruffles.jpg', marca: 'Ruffles' },
  { imagem: 'assets/carrossel/pomarola.jpg', marca: 'Pomarola' },
  { imagem: 'assets/carrossel/omo.jpg', marca: 'Omo' },
  { imagem: 'assets/carrossel/red-bull.jpg', marca: 'Red Bull' },
  { imagem: 'assets/carrossel/danone.jpg', marca: 'Danone' },
  { imagem: 'assets/carrossel/santa-amalia.jpg', marca: 'Santa Amália' },
  { imagem: 'assets/carrossel/ype.jpg', marca: 'Ypê' },
  { imagem: 'assets/carrossel/tramontina.jpg', marca: 'Tramontina' },
  { imagem: 'assets/carrossel/tang.jpg', marca: 'Tang' },
];

// Merchandising no espaço livre abaixo do botão do leitor/microfone (pedido do usuário): placas
// rolando sem parar, como as de LED na beira do gramado. Duas faixas em sentidos opostos, cada uma
// com a lista repetida duas vezes para a volta emendar sem salto. Só existe enquanto a área está
// livre (ver ScannerProdutoComponent.areaLivre) e com o toggle "Publicidade" ligado. Tocar e segurar pausa.
@Component({
  selector: 'app-carrossel-placas',
  standalone: true,
  template: `
    <section class="placar" aria-label="Publicidade">
      <p class="rotulo">Publicidade</p>
      @for (faixa of faixas; track $index) {
        <div class="faixa" [class.reversa]="$index === 1">
          <div class="trilho">
            @for (placa of faixa; track $index) {
              <img class="placa" [src]="placa.imagem" [alt]="placa.marca" width="1000" height="200" loading="lazy" draggable="false" />
            }
          </div>
        </div>
      }
    </section>
  `,
  styles: `
    /* No rodapé (a .tela do scanner é uma coluna da altura do celular): a margem automática come o
       espaço que sobra. A folga de baixo é fixa: em alguns Android (ex.: Xiaomi com barra de 3 botões)
       o app ocupa também a área atrás da barra de navegação, e o carrossel encostado na borda ficava
       escondido. Em celular pequeno não sobra espaço e ele fica logo abaixo do botão. */
    :host {
      display: block;
      margin-top: auto;
      margin-bottom: calc(52px + env(safe-area-inset-bottom, 0px));
    }
    .placar {
      margin-top: 8px;
      padding: 6px 0 8px;
      background: linear-gradient(#0f172a, #1e293b);
      border-radius: 12px;
      box-shadow: inset 0 0 0 2px #334155, 0 2px 8px rgba(15, 23, 42, 0.25);
      overflow: hidden;
      user-select: none;
      -webkit-user-select: none;
    }
    .rotulo {
      margin: 0 0 6px;
      font-size: 0.65rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      text-align: center;
      color: #94a3b8;
    }
    .faixa {
      overflow: hidden;
    }
    .faixa + .faixa {
      margin-top: 6px;
    }
    .trilho {
      display: flex;
      width: max-content;
      gap: 6px;
      animation: rolar 84s linear infinite;
    }
    .reversa .trilho {
      animation-direction: reverse;
      animation-duration: 96s;
    }
    .placar:active .trilho {
      animation-play-state: paused;
    }
    .placa {
      display: block;
      width: 340px;
      height: 68px;
      border-radius: 4px;
      object-fit: cover;
    }
    /* 2 cópias da lista: andar metade do trilho (mais meio gap) cai no mesmo desenho do início. */
    @keyframes rolar {
      from { transform: translateX(0); }
      to { transform: translateX(calc(-50% - 3px)); }
    }
    /* Tela baixa (ex.: 360x640): placas menores para caber acima da folga do rodapé. */
    @media (max-height: 700px) {
      .placa {
        width: 280px;
        height: 56px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .faixa {
        overflow-x: auto;
      }
      .trilho {
        animation: none;
      }
    }
  `
})
export class CarrosselPlacasComponent {

  // 2ª faixa em outra ordem, para as mesmas marcas não passarem lado a lado.
  readonly faixas: PlacaCarrossel[][] = [
    PLACAS_CARROSSEL,
    [...PLACAS_CARROSSEL.slice(6), ...PLACAS_CARROSSEL.slice(0, 6)],
  ].map(lista => [...lista, ...lista]);
}
