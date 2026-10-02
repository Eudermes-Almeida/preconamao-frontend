import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

// Loja parceira como a API devolve (GET /lojas): só as que têm posição cadastrada.
export interface LojaPublica {
  id: number;
  // Fim do endereço do QR code afixado na loja: www.simplificacompras.app.br/<slug>.
  slug: string;
  // Nome curto, que cabe no topo da tela.
  nome: string;
  latitude: number;
  longitude: number;
  raioM: number;
}

export interface LojaEscolhida {
  id: number;
  slug: string;
  nome: string;
  escolhidaEm: number;
  origem: 'QR' | 'LOCALIZACAO';
}

export interface Posicao {
  latitude: number;
  longitude: number;
  // Margem de erro informada pelo celular, em metros.
  precisao: number;
}

export interface LojaComDistancia {
  loja: LojaPublica;
  distanciaM: number;
}

// Resultado de uma posição contra as lojas: as que dá para escolher e, para informar, as mais perto.
export interface Avaliacao {
  posicao: Posicao;
  // false = margem de erro grande demais para confiar (computador, GPS desligado): pede o QR code.
  confiavel: boolean;
  noRaio: LojaComDistancia[];
  maisProximas: LojaComDistancia[];
}

export type PedidoEscolha =
  // Toque numa função de preço sem loja, ou "Trocar" no topo.
  | { tipo: 'escolher' }
  // QR code lido (pela câmera do app ou pelo endereço /<slug>).
  | { tipo: 'qr'; slug: string };

// Decisões de 02/10/2026 (ver memória do projeto): a escolha vale 3 horas; a loja só pode ser
// escolhida pela localização se distância − margem de erro ≤ raio; margem acima de 150 m não vale.
export const VALIDADE_ESCOLHA_MS = 3 * 60 * 60 * 1000;
export const MARGEM_MAXIMA_M = 150;

const CHAVE_ESCOLHIDA = 'preconamao.loja.escolhida';
const CHAVE_ULTIMA = 'preconamao.loja.ultima';
const CHAVE_EXIGIR = 'preconamao.exigirLocalizacao';

// Em qual loja o cliente está. O link do app é público: sem isto, o cliente poderia ver dentro da
// loja B os preços da loja A. A posição do celular é comparada com as lojas aqui mesmo, no
// aparelho — nunca é enviada ao servidor.
@Injectable({
  providedIn: 'root'
})
export class LojaService {

  readonly lojas = signal<LojaPublica[] | null>(null);
  readonly escolhida = signal<LojaEscolhida | null>(this.ler<LojaEscolhida>(CHAVE_ESCOLHIDA));
  // Fase de testes (pedido do usuário): botão discreto, só neste aparelho, começa desligado.
  // Desligado = o app funciona como antes, de qualquer lugar.
  readonly exigir = signal<boolean>(this.ler<boolean>(CHAVE_EXIGIR) === true);
  // Janela de escolha da loja aberta (null = fechada).
  readonly pedido = signal<PedidoEscolha | null>(null);

  // Avança a cada minuto, para a escolha vencer sozinha com o app aberto.
  private readonly agora = signal(Date.now());

  readonly lojaValida = computed<LojaEscolhida | null>(() => {
    const loja = this.escolhida();
    return loja && this.agora() - loja.escolhidaEm < VALIDADE_ESCOLHA_MS ? loja : null;
  });

  // Funções de preço (leitor, voz, localizador, carrinho, ouvir preço) liberadas.
  readonly liberado = computed(() => !this.exigir() || !!this.lojaValida());

  // Nome no topo e em cada preço: a loja escolhida; com a exigência desligada, a loja piloto.
  readonly lojaExibida = computed<{ nome: string } | null>(() =>
    this.lojaValida() ?? (this.exigir() ? null : this.lojas()?.[0] ?? null));

  // Ofertas sem loja escolhida: "válido somente no ..." da última loja usada, ou da piloto.
  readonly lojaDasOfertas = computed<{ nome: string } | null>(() => {
    const ultima = this.ler<number>(CHAVE_ULTIMA);
    const lojas = this.lojas() ?? [];
    return this.lojaValida() ?? lojas.find(l => l.id === ultima) ?? lojas[0] ?? null;
  });

  private carregamento?: Promise<LojaPublica[]>;

  constructor(private http: HttpClient) {
    setInterval(() => this.agora.set(Date.now()), 60_000);
  }

  carregar(): Promise<LojaPublica[]> {
    this.carregamento ??= firstValueFrom(this.http.get<LojaPublica[]>(`${environment.apiUrl}/lojas`))
      .then(lojas => {
        this.lojas.set(lojas);
        return lojas;
      })
      .catch(erro => {
        this.carregamento = undefined;
        throw erro;
      });
    return this.carregamento;
  }

  porSlug(slug: string): LojaPublica | undefined {
    return this.lojas()?.find(l => l.slug === slug);
  }

  abrirEscolha(pedido: PedidoEscolha = { tipo: 'escolher' }): void {
    this.pedido.set(pedido);
  }

  fecharEscolha(): void {
    this.pedido.set(null);
  }

  escolher(loja: LojaPublica, origem: LojaEscolhida['origem']): void {
    const escolhida: LojaEscolhida = { id: loja.id, slug: loja.slug, nome: loja.nome, escolhidaEm: Date.now(), origem };
    this.agora.set(Date.now());
    this.escolhida.set(escolhida);
    this.gravar(CHAVE_ESCOLHIDA, escolhida);
    this.gravar(CHAVE_ULTIMA, loja.id);
  }

  alternarExigir(): void {
    this.exigir.update(valor => !valor);
    this.gravar(CHAVE_EXIGIR, this.exigir());
  }

  // Pede a posição ao celular. Rejeita com o GeolocationPositionError (code 1 = bloqueada).
  obterPosicao(): Promise<Posicao> {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject({ code: 2, message: 'Sem geolocalização neste navegador' });
        return;
      }
      navigator.geolocation.getCurrentPosition(
        p => resolve({ latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy }),
        reject,
        { enableHighAccuracy: true, timeout: 20_000, maximumAge: 30_000 },
      );
    });
  }

  // 'granted' | 'denied' | 'prompt', ou null quando o navegador não informa (Safari antigo).
  async permissao(): Promise<PermissionState | null> {
    try {
      return (await navigator.permissions.query({ name: 'geolocation' })).state;
    } catch {
      return null;
    }
  }

  avaliar(posicao: Posicao, lojas: LojaPublica[]): Avaliacao {
    const medidas = lojas
      .map(loja => ({ loja, distanciaM: distanciaEmMetros(posicao, loja) }))
      .sort((a, b) => a.distanciaM - b.distanciaM);
    const confiavel = posicao.precisao <= MARGEM_MAXIMA_M;
    return {
      posicao,
      confiavel,
      // A favor do cliente: na dúvida (dentro da margem de erro), a loja entra.
      noRaio: confiavel ? medidas.filter(m => m.distanciaM - posicao.precisao <= m.loja.raioM) : [],
      maisProximas: medidas.slice(0, 3),
    };
  }

  // Botão "Registrar a posição desta loja" (/admin/posicao). A loja é a da chave de relatório.
  registrarPosicao(chave: string, latitude: number, longitude: number, raioM: number | null): Observable<LojaPublica> {
    return this.http.put<LojaPublica>(`${environment.apiUrl}/lojas/posicao`, { latitude, longitude, raioM }, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
    });
  }

  private ler<T>(chave: string): T | null {
    try {
      const valor = localStorage.getItem(chave);
      return valor ? JSON.parse(valor) as T : null;
    } catch {
      return null;
    }
  }

  private gravar(chave: string, valor: unknown): void {
    try {
      localStorage.setItem(chave, JSON.stringify(valor));
    } catch {
      // Modo privado ou storage bloqueado: vale só nesta sessão.
    }
  }
}

// Haversine: precisão de centímetros nas distâncias de que precisamos (metros a quilômetros).
export function distanciaEmMetros(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }): number {
  const raioTerra = 6_371_000;
  const rad = (graus: number) => graus * Math.PI / 180;
  const dLat = rad(b.latitude - a.latitude);
  const dLon = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * raioTerra * Math.asin(Math.sqrt(h));
}

// "a 35 m" / "a 1,2 km".
export function formatarDistancia(metros: number): string {
  return metros < 1000
    ? `${Math.round(metros)} m`
    : `${(metros / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

// Slug lido de um QR code ou endereço: www.simplificacompras.app.br/<slug> (qualquer domínio do
// app — produção, vercel.app antigo ou localhost nos testes).
export function slugDoEndereco(texto: string): string | null {
  let caminho: string;
  try {
    caminho = new URL(texto.trim(), location.origin).pathname;
  } catch {
    return null;
  }
  const achado = caminho.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
  return achado && !['admin', 'familia'].includes(achado[1]) ? achado[1] : null;
}
