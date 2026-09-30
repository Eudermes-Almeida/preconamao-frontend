import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';
import { OfertasService } from './ofertas.service';

// Relatório de mídias: cada interação do cliente com uma oferta vai para DOIS destinos —
//   1. nossa API (POST /eventos), em lote a cada ~10 s: relatório operacional da aba /admin;
//   2. Google Analytics 4, direto do navegador: medição independente, que dá credibilidade aos
//      números (só se environment.ga4Id estiver preenchido).
// Mesmas definições nos dois (ver scripts/018_eventos_midia.sql):
//   EXIBICAO     oferta visível por 1 s (anúncio, ou card da tela Ofertas com metade à mostra)
//   FAVORITAR / DESFAVORITAR, LOCALIZAR, PRE_LISTA (só a inclusão).
export type TipoEvento = 'EXIBICAO' | 'FAVORITAR' | 'DESFAVORITAR' | 'LOCALIZAR' | 'PRE_LISTA';
export type OrigemEvento = 'ANUNCIO' | 'TELA_OFERTAS';
// Instalação do app (scripts/019_instalacao_app.sql).
export type OrigemInstalacao = 'BOTAO' | 'NAVEGADOR';
export type Plataforma = 'ANDROID' | 'IOS' | 'OUTRA';

interface Evento {
  tipo: TipoEvento;
  origem: OrigemEvento;
  codigoBarras: string;
}

type Gtag = (...args: unknown[]) => void;

// Código aleatório do aparelho, sem nenhum dado pessoal: conta aparelhos distintos no relatório.
const CHAVE_APARELHO = 'preconamao.aparelho';
const INTERVALO_ENVIO_MS = 10_000;
const ENVIAR_A_PARTIR_DE = 20;
// Igual ao limite do back (EventoMidiaService.MAX_EVENTOS_POR_LOTE).
const MAX_POR_LOTE = 50;
// Sem rede por muito tempo, a fila não cresce sem fim: os mais antigos se perdem.
const MAX_NA_FILA = 200;

@Injectable({
  providedIn: 'root'
})
export class EventosMidiaService {

  private readonly aparelhoId = this.lerOuCriarAparelho();
  private fila: Evento[] = [];
  private enviando = false;
  private iniciado = false;
  private gtag: Gtag | null = null;

  constructor(private http: HttpClient, private ofertas: OfertasService) {}

  // Chamado pelo AppComponent só no app do cliente (nunca na aba /admin).
  iniciar(): void {
    if (this.iniciado) {
      return;
    }
    this.iniciado = true;
    setInterval(() => this.enviar(), INTERVALO_ENVIO_MS);
    // Saindo do app (outra aba, tela desligada, fechando): o que estiver na fila vai por beacon,
    // que o navegador entrega mesmo com a página indo embora.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        this.enviarPorBeacon();
      }
    });
    window.addEventListener('pagehide', () => this.enviarPorBeacon());
    this.iniciarGa4();
  }

  registrar(tipo: TipoEvento, origem: OrigemEvento, codigoBarras: string): void {
    this.fila.push({ tipo, origem, codigoBarras });
    if (this.fila.length > MAX_NA_FILA) {
      this.fila.splice(0, this.fila.length - MAX_NA_FILA);
    }
    if (this.fila.length >= ENVIAR_A_PARTIR_DE) {
      this.enviar();
    }
    this.enviarGa4(tipo, origem, codigoBarras);
  }

  // App instalado na tela inicial (ver InstalacaoAppService): vai direto, fora do lote, porque é
  // raro e a API grava uma vez por aparelho. GA4 fica com quem chama (só na 1ª tentativa).
  registrarInstalacao(origem: OrigemInstalacao, plataforma: Plataforma): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/eventos/instalacao`, { aparelhoId: this.aparelhoId, origem, plataforma });
  }

  // Evento avulso para o GA4 (instalação do app e toques no botão "Instalar").
  eventoGa4(nome: string, parametros: Record<string, string>): void {
    this.gtag?.('event', nome, parametros);
  }

  private enviar(): void {
    if (this.enviando || this.fila.length === 0) {
      return;
    }
    const lote = this.fila.splice(0, MAX_POR_LOTE);
    this.enviando = true;
    this.http.post(`${environment.apiUrl}/eventos`, { aparelhoId: this.aparelhoId, eventos: lote }).subscribe({
      next: () => {
        this.enviando = false;
        if (this.fila.length >= ENVIAR_A_PARTIR_DE) {
          this.enviar();
        }
      },
      error: (err) => {
        this.enviando = false;
        // 400 = lote recusado (não adianta reenviar); rede/servidor fora = tenta no próximo ciclo.
        if (err.status !== 400) {
          this.fila.unshift(...lote);
          this.fila.splice(MAX_NA_FILA);
        }
      },
    });
  }

  // text/plain não dispara o preflight de CORS, que o beacon não sabe fazer (o back aceita).
  private enviarPorBeacon(): void {
    while (this.fila.length > 0 && typeof navigator.sendBeacon === 'function') {
      const lote = this.fila.slice(0, MAX_POR_LOTE);
      const corpo = new Blob([JSON.stringify({ aparelhoId: this.aparelhoId, eventos: lote })], { type: 'text/plain' });
      if (!navigator.sendBeacon(`${environment.apiUrl}/eventos`, corpo)) {
        return;
      }
      this.fila.splice(0, lote.length);
    }
  }

  // ------------------------------------------------------------------------------------------
  // Google Analytics 4
  // ------------------------------------------------------------------------------------------

  // Carrega o gtag.js do Google. Fora de produção os eventos vão marcados como debug (aparecem
  // em Administrador > DebugView do GA4, sem sujar os relatórios).
  private iniciarGa4(): void {
    const id = environment.ga4Id;
    if (!id) {
      return;
    }
    const janela = window as unknown as { dataLayer: unknown[]; gtag: Gtag };
    janela.dataLayer = janela.dataLayer || [];
    janela.gtag = function () {
      // gtag exige o objeto "arguments" original, não um array.
      // eslint-disable-next-line prefer-rest-params
      janela.dataLayer.push(arguments);
    };
    this.gtag = janela.gtag;
    this.gtag('js', new Date());
    this.gtag('config', id, environment.production ? {} : { debug_mode: true });

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
    document.head.appendChild(script);
  }

  // Eventos oficiais do GA4 onde existem (view_promotion, select_promotion, add_to_wishlist: os
  // relatórios prontos do Google já entendem) e nossos para o resto. Todos levam codigo_barras,
  // produto e origem, que precisam ser registrados como dimensões personalizadas no GA4.
  private enviarGa4(tipo: TipoEvento, origem: OrigemEvento, codigoBarras: string): void {
    if (!this.gtag) {
      return;
    }
    const produto = this.ofertas.produtos()?.[codigoBarras]?.descricao ?? codigoBarras;
    const origemGa = origem === 'ANUNCIO' ? 'anuncio' : 'tela_ofertas';
    const comuns = { codigo_barras: codigoBarras, produto, origem: origemGa };
    const promocao = {
      ...comuns,
      promotion_id: codigoBarras,
      promotion_name: produto,
      creative_slot: origemGa,
      items: [{ item_id: codigoBarras, item_name: produto }],
    };

    switch (tipo) {
      case 'EXIBICAO':
        this.gtag('event', 'view_promotion', promocao);
        break;
      case 'LOCALIZAR':
        this.gtag('event', 'select_promotion', promocao);
        this.gtag('event', 'localizar_produto', comuns);
        break;
      case 'FAVORITAR':
        this.gtag('event', 'add_to_wishlist', { ...comuns, items: promocao.items });
        break;
      case 'DESFAVORITAR':
        this.gtag('event', 'remover_favorito', comuns);
        break;
      case 'PRE_LISTA':
        this.gtag('event', 'incluir_pre_lista', comuns);
        break;
    }
  }

  private lerOuCriarAparelho(): string {
    try {
      const salvo = localStorage.getItem(CHAVE_APARELHO);
      if (salvo) {
        return salvo;
      }
      const novo = this.novoUuid();
      localStorage.setItem(CHAVE_APARELHO, novo);
      return novo;
    } catch {
      // Sem storage (modo privado restrito): um código só para esta sessão.
      return this.novoUuid();
    }
  }

  // crypto.randomUUID só existe em HTTPS/localhost; o fallback monta um UUID v4 na mão.
  private novoUuid(): string {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
}
