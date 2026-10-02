import { Component, ElementRef, EventEmitter, Input, OnDestroy, OnInit, Output, ViewChild, signal } from '@angular/core';
import {
  Avaliacao, LojaComDistancia, LojaPublica, LojaService, MARGEM_MAXIMA_M, PedidoEscolha,
  distanciaEmMetros, formatarDistancia, slugDoEndereco,
} from '../../services/loja.service';
import { LeitorCameraService } from '../../services/leitor-camera.service';
import { InstalacaoAppService } from '../../services/instalacao-app.service';

type Etapa = 'inicio' | 'localizando' | 'escolher' | 'confirmar' | 'nenhuma' | 'imprecisa' | 'bloqueada'
  | 'como-liberar' | 'lendo-qr' | 'erro' | 'saiu';

// "Em qual loja você está?" — desenho aprovado em 02/10/2026: o cliente informa a loja pelo QR code
// afixado nela ou escolhe numa lista que só traz as lojas cujo raio alcança a posição do celular, e
// confirma que está dentro dela (os preços valem somente ali). Sem localização, só o QR code.
@Component({
  selector: 'app-escolher-loja',
  standalone: true,
  templateUrl: './escolher-loja.component.html',
  styleUrls: ['../familia/familia.css', './escolher-loja.component.css']
})
export class EscolherLojaComponent implements OnInit, OnDestroy {

  @Input({ required: true }) pedido!: PedidoEscolha;
  @Output() fechar = new EventEmitter<void>();

  @ViewChild('videoQr') videoQr?: ElementRef<HTMLVideoElement>;

  readonly etapa = signal<Etapa>('inicio');
  readonly avaliacao = signal<Avaliacao | null>(null);
  readonly selecionada = signal<LojaPublica | null>(null);
  readonly origem = signal<'QR' | 'LOCALIZACAO'>('LOCALIZACAO');
  // QR aberto longe da loja (com localização confiável): só avisa, não bloqueia.
  readonly avisoLonge = signal<string | null>(null);
  readonly erro = signal<string | null>(null);
  readonly erroCamera = signal<string | null>(null);

  readonly margemMaxima = MARGEM_MAXIMA_M;
  readonly formatarDistancia = formatarDistancia;

  constructor(public loja: LojaService, private camera: LeitorCameraService, private instalacao: InstalacaoAppService) {}

  get iphone(): boolean {
    return this.instalacao.plataforma === 'IOS';
  }

  // Linha de teste (só com o botão "Exigir localização" ligado): distância, margem e raio.
  linhaTeste(item: LojaComDistancia | null): string | null {
    const posicao = this.avaliacao()?.posicao;
    if (!this.loja.exigir() || !posicao) {
      return null;
    }
    const base = `Teste: margem ±${Math.round(posicao.precisao)} m`;
    return item
      ? `${base} · distância ${Math.round(item.distanciaM)} m · entrada ${item.loja.raioM} m · saída ${item.loja.raioSaidaM} m`
      : base;
  }

  medidaDe(loja: LojaPublica | null): LojaComDistancia | null {
    return this.avaliacao()?.maisProximas.find(m => m.loja.id === loja?.id)
      ?? this.avaliacao()?.noRaio.find(m => m.loja.id === loja?.id) ?? null;
  }

  async ngOnInit(): Promise<void> {
    if (this.pedido.tipo === 'qr') {
      await this.abrirQr(this.pedido.slug);
    } else if (this.pedido.tipo === 'saiu') {
      this.etapa.set('saiu');
    }
  }

  get nomeLojaQueSaiu(): string {
    return this.pedido.tipo === 'saiu' ? this.pedido.nome : '';
  }

  async usarLocalizacao(): Promise<void> {
    this.etapa.set('localizando');
    let lojas: LojaPublica[];
    try {
      lojas = await this.loja.carregar();
    } catch {
      this.falhar('Não foi possível carregar as lojas parceiras. Verifique a internet e tente de novo.');
      return;
    }
    try {
      const posicao = await this.loja.obterPosicao(0);
      const avaliacao = this.loja.avaliar(posicao, lojas);
      this.avaliacao.set(avaliacao);
      // "Trocar" fora da loja conta como uma das duas leituras de saída da loja atual.
      this.loja.registrarLeitura(posicao);
      if (!avaliacao.confiavel) {
        this.etapa.set('imprecisa');
      } else if (avaliacao.noRaio.length === 0) {
        this.etapa.set('nenhuma');
      } else if (avaliacao.noRaio.length === 1) {
        this.confirmar(avaliacao.noRaio[0].loja, 'LOCALIZACAO');
      } else {
        this.etapa.set('escolher');
      }
    } catch (erro) {
      this.etapa.set((erro as GeolocationPositionError)?.code === 1 ? 'bloqueada' : 'imprecisa');
    }
  }

  confirmar(loja: LojaPublica, origem: 'QR' | 'LOCALIZACAO'): void {
    this.selecionada.set(loja);
    this.origem.set(origem);
    this.etapa.set('confirmar');
  }

  aceitar(): void {
    const loja = this.selecionada();
    if (loja) {
      this.loja.escolher(loja, this.origem());
    }
    this.fechar.emit();
  }

  escolherOutra(): void {
    this.avisoLonge.set(null);
    this.selecionada.set(null);
    this.etapa.set('inicio');
  }

  // A câmera do app lê o QR code da loja (o da câmera do celular abriria o navegador, que no iPhone
  // não é o mesmo app instalado na tela inicial).
  lerQr(): void {
    this.erroCamera.set(null);
    this.etapa.set('lendo-qr');
    // O <video> só existe depois que a etapa aparece na tela.
    setTimeout(() => {
      const video = this.videoQr?.nativeElement;
      if (!video) {
        return;
      }
      this.camera.iniciar(video, {
        aoIniciar: () => undefined,
        aoFalhar: mensagem => this.erroCamera.set(mensagem),
        aoLer: texto => {
          const slug = slugDoEndereco(texto);
          if (slug) {
            this.abrirQr(slug);
          } else {
            this.falhar('Este QR code não é de uma loja parceira Simplifica Compra$.');
          }
        },
      }, 'qr_code');
    });
  }

  cancelarQr(): void {
    this.camera.parar();
    this.etapa.set('inicio');
  }

  private async abrirQr(slug: string): Promise<void> {
    this.etapa.set('localizando');
    let lojas: LojaPublica[];
    try {
      lojas = await this.loja.carregar();
    } catch {
      this.falhar('Não foi possível carregar as lojas parceiras. Verifique a internet e tente de novo.');
      return;
    }
    const loja = lojas.find(l => l.slug === slug);
    if (!loja) {
      this.falhar('Este QR code não é de uma loja parceira Simplifica Compra$.');
      return;
    }
    this.confirmar(loja, 'QR');
    await this.conferirDistanciaDoQr(loja, lojas);
  }

  // Só se a localização já estiver liberada (não pede permissão por causa disto) e for confiável.
  private async conferirDistanciaDoQr(loja: LojaPublica, lojas: LojaPublica[]): Promise<void> {
    if (await this.loja.permissao() !== 'granted') {
      return;
    }
    try {
      const posicao = await this.loja.obterPosicao();
      this.avaliacao.set(this.loja.avaliar(posicao, lojas));
      const distancia = distanciaEmMetros(posicao, loja);
      if (posicao.precisao <= MARGEM_MAXIMA_M && distancia - posicao.precisao > loja.raioM) {
        this.avisoLonge.set(`Pela localização do seu celular, você parece estar a ${formatarDistancia(distancia)} desta loja.`);
      }
    } catch {
      // Sem posição agora: segue só com a confirmação do cliente.
    }
  }

  private falhar(mensagem: string): void {
    this.camera.parar();
    this.erro.set(mensagem);
    this.etapa.set('erro');
  }

  ngOnDestroy(): void {
    this.camera.parar();
  }
}
