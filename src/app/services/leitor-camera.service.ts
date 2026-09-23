import { Injectable, NgZone } from '@angular/core';
// Só tipos (apagados na compilação) — o import() dentro de iniciarZxing() é quem baixa a
// biblioteca de fato, e só quando ela é realmente necessária (ver comentário lá).
import type { IScannerControls } from '@zxing/browser';

// A Shape Detection API ainda não faz parte dos tipos do TypeScript (só existe nativamente no
// Chrome/Android), então declaramos apenas o que usamos.
interface CodigoDetectado {
  rawValue: string;
}

interface DetectorDeCodigoDeBarras {
  detect(fonte: CanvasImageSource): Promise<CodigoDetectado[]>;
}

type ConstrutorDetector = new (opcoes: { formats: string[] }) => DetectorDeCodigoDeBarras;

export interface OuvinteCamera {
  // Chamado assim que a câmera está pronta e o vídeo pode ser exibido.
  aoIniciar(stream: MediaStream): void;
  // Chamado uma única vez, ao achar um código; a leitura já para sozinha antes de chamar isto.
  aoLer(codigoBarras: string): void;
  // Chamado se a câmera não pôde ser aberta (permissão negada, sem câmera etc.).
  aoFalhar(mensagem: string): void;
}

const MENSAGENS_DE_ERRO: Record<string, string> = {
  NotAllowedError: 'Permissão da câmera negada. Libere a câmera nas configurações do navegador.',
  NotFoundError: 'Nenhuma câmera encontrada neste aparelho.',
  NotReadableError: 'Não foi possível acessar a câmera (pode estar em uso por outro app).',
};

@Injectable({
  providedIn: 'root'
})
export class LeitorCameraService {

  // --- Caminho nativo: BarcodeDetector (Chrome/Edge/Android). Prioridade — mais rápido e não
  // depende de biblioteca nenhuma. Intocado desde a versão validada em produção no Android. ---
  private stream?: MediaStream;
  private detector?: DetectorDeCodigoDeBarras;
  private lendo = false;
  private quadroAgendado?: number;

  // --- Fallback: ZXing (decodifica por processamento de pixel, funciona em qualquer navegador —
  // é o caminho usado no Safari/iOS, que nunca implementou o BarcodeDetector). ---
  private controlesZxing?: IScannerControls;

  constructor(private zone: NgZone) {}

  get suportado(): boolean {
    // O BarcodeDetector é só um atalho mais rápido; sem ele, o ZXing cobre qualquer navegador
    // que tenha câmera, então o único requisito real é ter getUserMedia.
    return !!navigator.mediaDevices?.getUserMedia;
  }

  // Abre a câmera traseira e começa a procurar um código EAN-13 a cada quadro, até achar um.
  async iniciar(video: HTMLVideoElement, ouvinte: OuvinteCamera): Promise<void> {
    if (this.stream || this.controlesZxing) {
      return;
    }

    const Construtor = this.construtorDetector();
    if (Construtor) {
      await this.iniciarNativo(Construtor, video, ouvinte);
    } else {
      await this.iniciarZxing(video, ouvinte);
    }
  }

  // Solta a câmera (a luz do aparelho apaga) e cancela a busca por código em andamento.
  parar(): void {
    if (this.quadroAgendado !== undefined) {
      cancelAnimationFrame(this.quadroAgendado);
      this.quadroAgendado = undefined;
    }
    this.lendo = false;
    this.stream?.getTracks().forEach((faixa) => faixa.stop());
    this.stream = undefined;
    this.detector = undefined;

    // stop() do ZXing já solta a câmera e desliga o vídeo (ver decodeFromConstraints).
    this.controlesZxing?.stop();
    this.controlesZxing = undefined;
  }

  private async iniciarNativo(Construtor: ConstrutorDetector, video: HTMLVideoElement, ouvinte: OuvinteCamera): Promise<void> {
    this.detector = new Construtor({ formats: ['ean_13'] });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (erro) {
      this.detector = undefined;
      this.zone.run(() => ouvinte.aoFalhar(this.mensagemDeErro(erro)));
      return;
    }

    video.srcObject = this.stream;
    await video.play();
    this.zone.run(() => ouvinte.aoIniciar(this.stream!));

    this.lendo = true;
    this.procurarCodigo(video, ouvinte);
  }

  private procurarCodigo(video: HTMLVideoElement, ouvinte: OuvinteCamera): void {
    if (!this.lendo || !this.detector) {
      return;
    }

    // Evita empilhar chamadas: só agenda o próximo quadro depois que este terminar de analisar.
    this.detector.detect(video)
      .then((codigos) => {
        if (!this.lendo) {
          return;
        }
        if (codigos.length > 0) {
          const codigoBarras = codigos[0].rawValue;
          this.parar();
          this.zone.run(() => ouvinte.aoLer(codigoBarras));
        } else {
          this.quadroAgendado = requestAnimationFrame(() => this.procurarCodigo(video, ouvinte));
        }
      })
      .catch(() => {
        if (this.lendo) {
          this.quadroAgendado = requestAnimationFrame(() => this.procurarCodigo(video, ouvinte));
        }
      });
  }

  // Sem BarcodeDetector (Safari/iOS): getUserMedia + decodificação contínua por pixel, tudo
  // gerenciado pelo próprio ZXing (inclusive soltar a câmera ao chamar controlesZxing.stop()).
  // import() dinâmico: só baixa a biblioteca (~1MB) em quem realmente precisa dela — no
  // Chrome/Android, que usa o caminho nativo acima, esse código nunca é buscado.
  private async iniciarZxing(video: HTMLVideoElement, ouvinte: OuvinteCamera): Promise<void> {
    const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
      import('@zxing/browser'),
      import('@zxing/library'),
    ]);
    const hints = new Map([[DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.EAN_13]]]);
    const leitor = new BrowserMultiFormatReader(hints);

    try {
      this.controlesZxing = await leitor.decodeFromConstraints(
        { video: { facingMode: 'environment' }, audio: false },
        video,
        (resultado) => {
          if (!resultado || !this.controlesZxing) {
            return;
          }
          const codigoBarras = resultado.getText();
          this.parar();
          this.zone.run(() => ouvinte.aoLer(codigoBarras));
        },
      );
    } catch (erro) {
      this.controlesZxing = undefined;
      this.zone.run(() => ouvinte.aoFalhar(this.mensagemDeErro(erro)));
      return;
    }

    const streamAtual = video.srcObject as MediaStream | null;
    if (streamAtual) {
      this.zone.run(() => ouvinte.aoIniciar(streamAtual));
    }
  }

  private mensagemDeErro(erro: unknown): string {
    const nome = erro instanceof Error ? erro.name : '';
    return MENSAGENS_DE_ERRO[nome] ?? 'Não foi possível acessar a câmera. Tente novamente.';
  }

  private construtorDetector(): ConstrutorDetector | undefined {
    const janela = window as unknown as { BarcodeDetector?: ConstrutorDetector };
    return janela.BarcodeDetector;
  }
}
