import { Injectable, signal } from '@angular/core';
import { EventosMidiaService, OrigemInstalacao, Plataforma } from './eventos-midia.service';

// Botão "Instalar o app" (grade da tela inicial): põe o app na tela inicial do celular sem passar
// pela loja de aplicativos, para o cliente abrir em casa (pré-lista) sem precisar do QR code.
//
// Android (Chrome, Edge, Samsung Internet): o navegador avisa que o app pode ser instalado
// (evento beforeinstallprompt); guardamos o aviso e o botão abre a janela nativa "Instalar app?".
// Onde isso não existe (iPhone, navegador dentro do Instagram/Facebook, Firefox...) o botão abre
// um passo a passo (InstalarAppAjudaComponent).
//
// Instalação registrada uma vez por aparelho na API (relatório /admin) e no GA4 (app_instalado).

// Evento do Chrome, ainda fora dos tipos do TypeScript.
interface PedidoInstalacao extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type AjudaInstalacao = 'endereco-oficial' | 'iphone' | 'navegador-interno' | 'menu-navegador';

export const ENDERECO_OFICIAL = 'https://www.simplificacompras.app.br';
// Instalar pelo endereço antigo prenderia o ícone e os dados do cliente nele (ver memória do domínio).
const HOST_ANTIGO = 'preconamao-frontend.vercel.app';

const CHAVE_REGISTRADA = 'preconamao.app.instalacaoRegistrada';
// Origem da instalação ainda não aceita pela API (sem rede na hora): reenviada na próxima abertura.
const CHAVE_PENDENTE = 'preconamao.app.instalacaoPendente';

@Injectable({
  providedIn: 'root'
})
export class InstalacaoAppService {

  // Aberto pelo ícone da tela inicial, ou o navegador confirmou que o app já está no aparelho:
  // o botão some.
  readonly instalado = signal(this.abertoPeloIcone());
  // Passo a passo aberto (null = fechado).
  readonly ajuda = signal<AjudaInstalacao | null>(null);

  readonly plataforma: Plataforma = this.detectarPlataforma();

  private pedido: PedidoInstalacao | null = null;
  // A janela nativa foi aberta pelo nosso botão: se o appinstalled vier, a origem é BOTAO.
  private pediuPeloBotao = false;
  private iniciado = false;

  constructor(private eventosMidia: EventosMidiaService) {}

  // Chamado pelo AppComponent (depois do EventosMidiaService.iniciar, que prepara o GA4).
  iniciar(): void {
    if (this.iniciado) {
      return;
    }
    this.iniciado = true;

    window.addEventListener('beforeinstallprompt', (evento) => {
      // Sem o preventDefault o Chrome mostra a própria faixa "Instalar app" no rodapé; o nosso
      // botão já cumpre esse papel.
      evento.preventDefault();
      this.pedido = evento as PedidoInstalacao;
      this.instalado.set(false);
    });

    window.addEventListener('appinstalled', () => {
      this.instalado.set(true);
      this.pedido = null;
      this.ajuda.set(null);
      this.novaInstalacao(this.pediuPeloBotao ? 'BOTAO' : 'NAVEGADOR');
    });

    const pendente = this.ler(CHAVE_PENDENTE) as OrigemInstalacao | null;
    if (pendente) {
      this.enviar(pendente);
    } else if (this.abertoPeloIcone() && !this.ler(CHAVE_REGISTRADA)) {
      // Instalado pelo menu do navegador sem passar pelo appinstalled (ou no iPhone, onde o app
      // instalado não enxerga os dados do Safari): só percebemos na 1ª abertura pelo ícone.
      this.novaInstalacao('NAVEGADOR');
    }

    this.verificarJaInstalado();
  }

  // Toque no botão "Instalar o app".
  async instalar(): Promise<void> {
    if (location.hostname === HOST_ANTIGO) {
      this.abrirAjuda('endereco-oficial');
      return;
    }
    if (this.pedido) {
      const pedido = this.pedido;
      // O Chrome só deixa usar cada aviso uma vez; se o cliente recusar, ele manda outro mais tarde.
      this.pedido = null;
      this.pediuPeloBotao = true;
      await pedido.prompt();
      const { outcome } = await pedido.userChoice;
      this.eventosMidia.eventoGa4('instalar_app_clique', { resultado: outcome === 'accepted' ? 'aceitou' : 'recusou' });
      if (outcome !== 'accepted') {
        this.pediuPeloBotao = false;
      }
      return;
    }
    if (this.navegadorInterno()) {
      this.abrirAjuda('navegador-interno');
    } else if (this.plataforma === 'IOS') {
      this.abrirAjuda('iphone');
    } else {
      this.abrirAjuda('menu-navegador');
    }
  }

  fecharAjuda(): void {
    this.ajuda.set(null);
  }

  private abrirAjuda(ajuda: AjudaInstalacao): void {
    this.eventosMidia.eventoGa4('instalar_app_clique', { resultado: `ajuda_${ajuda}` });
    this.ajuda.set(ajuda);
  }

  private novaInstalacao(origem: OrigemInstalacao): void {
    if (this.ler(CHAVE_REGISTRADA)) {
      return;
    }
    this.eventosMidia.eventoGa4('app_instalado', { origem: origem.toLowerCase(), plataforma: this.plataforma.toLowerCase() });
    this.gravar(CHAVE_PENDENTE, origem);
    this.enviar(origem);
  }

  private enviar(origem: OrigemInstalacao): void {
    this.eventosMidia.registrarInstalacao(origem, this.plataforma).subscribe({
      next: () => {
        this.gravar(CHAVE_REGISTRADA, '1');
        this.apagar(CHAVE_PENDENTE);
      },
      error: (err) => {
        // 400 = recusado (não adianta reenviar); rede/servidor fora = tenta na próxima abertura.
        if (err.status === 400) {
          this.apagar(CHAVE_PENDENTE);
        }
      },
    });
  }

  // Chrome no Android responde se o app deste endereço já está instalado, mesmo aberto no
  // navegador (precisa de related_applications no manifest.webmanifest).
  private verificarJaInstalado(): void {
    const nav = navigator as Navigator & { getInstalledRelatedApps?: () => Promise<unknown[]> };
    if (this.instalado() || typeof nav.getInstalledRelatedApps !== 'function') {
      return;
    }
    nav.getInstalledRelatedApps()
      .then(apps => {
        if (apps.length > 0) {
          this.instalado.set(true);
        }
      })
      .catch(() => {
        // Sem resposta: o botão continua (no pior caso, o cliente vê o passo a passo).
      });
  }

  private abertoPeloIcone(): boolean {
    return matchMedia('(display-mode: standalone)').matches
      || matchMedia('(display-mode: fullscreen)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  }

  private detectarPlataforma(): Plataforma {
    const ua = navigator.userAgent;
    // iPad com iPadOS se apresenta como Mac; a tela de toque denuncia.
    if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) {
      return 'IOS';
    }
    return /Android/i.test(ua) ? 'ANDROID' : 'OUTRA';
  }

  // Navegador embutido de outros apps (Instagram, Facebook, Line, WebView do Android): não instala.
  private navegadorInterno(): boolean {
    return /FBAN|FBAV|FB_IAB|Instagram|Line\/|; wv\)/i.test(navigator.userAgent);
  }

  private ler(chave: string): string | null {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  }

  private gravar(chave: string, valor: string): void {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      // Sem storage: a instalação pode ser enviada de novo; a API ignora a repetição.
    }
  }

  private apagar(chave: string): void {
    try {
      localStorage.removeItem(chave);
    } catch {
      // idem
    }
  }
}
