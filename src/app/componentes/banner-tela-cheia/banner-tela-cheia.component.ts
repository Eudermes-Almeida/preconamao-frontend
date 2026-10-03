import { Component, EventEmitter, Input, OnDestroy, OnInit, Output } from '@angular/core';

// Banner publicitário em tela cheia com uma barra de progresso embaixo: só o banner e a barra —
// fecha sozinho quando ela enche. Usado na abertura do app (no lugar do antigo aviso legal) e no
// "Valor Total" do carrinho (a "somatória em processamento") e no "Enviar lista" da Família.
export const DURACAO_BANNER_MS = 6000;

export interface BannerTelaCheia {
  imagem: string;
  // Texto alternativo da arte (o que ela diz), para leitores de tela.
  descricao: string;
  rotulo: string;
}

export const BANNER_ABERTURA: BannerTelaCheia = {
  imagem: 'assets/banners/abertura_coca_zero_cafeina.jpg',
  descricao: 'Coca-Cola Zero Cafeína: um convite para viver as noites de um jeito diferente',
  rotulo: 'Abrindo aplicativo Simplifica Compras ...',
};

export const BANNER_SOMA: BannerTelaCheia = {
  imagem: 'assets/banners/soma_avivar.jpg',
  descricao: 'Avivar: Minas não tem mar, mas tem Avivar',
  rotulo: 'Somatória em processamento',
};

export const BANNER_ENVIO_LISTA: BannerTelaCheia = {
  imagem: 'assets/banners/envio_dove_roma.jpg',
  descricao: 'Dove Romã: axilas bem cuidadas não mentem',
  rotulo: 'Envio da lista em processamento',
};

@Component({
  selector: 'app-banner-tela-cheia',
  standalone: true,
  templateUrl: './banner-tela-cheia.component.html',
  styleUrl: './banner-tela-cheia.component.css'
})
export class BannerTelaCheiaComponent implements OnInit, OnDestroy {

  @Input({ required: true }) banner!: BannerTelaCheia;
  @Input() duracaoMs = DURACAO_BANNER_MS;

  @Output() fechar = new EventEmitter<void>();

  private temporizador?: ReturnType<typeof setTimeout>;

  ngOnInit(): void {
    this.temporizador = setTimeout(() => this.fechar.emit(), this.duracaoMs);
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
  }
}
