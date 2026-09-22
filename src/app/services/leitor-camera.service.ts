import { Injectable, NgZone } from '@angular/core';

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

  private stream?: MediaStream;
  private detector?: DetectorDeCodigoDeBarras;
  private lendo = false;
  private quadroAgendado?: number;

  constructor(private zone: NgZone) {}

  get suportado(): boolean {
    return this.construtorDetector() !== undefined && !!navigator.mediaDevices?.getUserMedia;
  }

  // Abre a câmera traseira e começa a procurar um código EAN-13 a cada quadro, até achar um.
  async iniciar(video: HTMLVideoElement, ouvinte: OuvinteCamera): Promise<void> {
    const Construtor = this.construtorDetector();
    if (!Construtor || this.stream) {
      return;
    }

    this.detector = new Construtor({ formats: ['ean_13'] });

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
    } catch (erro) {
      const nome = erro instanceof Error ? erro.name : '';
      this.zone.run(() => ouvinte.aoFalhar(MENSAGENS_DE_ERRO[nome] ?? 'Não foi possível acessar a câmera. Tente novamente.'));
      return;
    }

    video.srcObject = this.stream;
    await video.play();
    this.zone.run(() => ouvinte.aoIniciar(this.stream!));

    this.lendo = true;
    this.procurarCodigo(video, ouvinte);
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

  private construtorDetector(): ConstrutorDetector | undefined {
    const janela = window as unknown as { BarcodeDetector?: ConstrutorDetector };
    return janela.BarcodeDetector;
  }
}
