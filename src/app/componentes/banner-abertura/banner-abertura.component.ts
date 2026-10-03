import { Component, EventEmitter, OnDestroy, Output } from '@angular/core';

// Banner publicitário em tela cheia na abertura do app (no lugar do antigo aviso legal, retirado
// a pedido do usuário). Só o banner e a barra "Abrindo aplicativo..." — fecha sozinho ao fim dela.
export const DURACAO_BANNER_MS = 6000;
const IMAGEM_BANNER = 'assets/banners/abertura_coca_zero_cafeina.jpg';

@Component({
  selector: 'app-banner-abertura',
  standalone: true,
  templateUrl: './banner-abertura.component.html',
  styleUrl: './banner-abertura.component.css'
})
export class BannerAberturaComponent implements OnDestroy {

  @Output() fechar = new EventEmitter<void>();

  readonly imagem = IMAGEM_BANNER;
  readonly duracaoMs = DURACAO_BANNER_MS;

  private readonly temporizador = setTimeout(() => this.fechar.emit(), DURACAO_BANNER_MS);

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
  }
}
