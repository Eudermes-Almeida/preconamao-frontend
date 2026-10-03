import { Injectable, NgZone } from '@angular/core';

// A Web Speech API ainda não faz parte dos tipos do TypeScript (só existe como webkitSpeechRecognition
// no Chrome/Edge/Safari), então declaramos apenas o que usamos.
interface ResultadoVoz {
  isFinal: boolean;
  0: { transcript: string };
}

interface EventoResultadoVoz {
  resultIndex: number;
  results: ArrayLike<ResultadoVoz>;
}

interface ReconhecimentoVoz {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((evento: EventoResultadoVoz) => void) | null;
  onerror: ((evento: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type ConstrutorReconhecimentoVoz = new () => ReconhecimentoVoz;

export interface OuvinteVoz {
  // Texto reconhecido até agora (parcial, ainda pode mudar), para mostrar em tempo real.
  aoOuvir(texto: string): void;
  // Sempre chamado ao fim da escuta: `erro` vem preenchido só se a escuta falhou.
  aoTerminar(texto: string, erro: string | null): void;
}

const MENSAGENS_DE_ERRO: Record<string, string> = {
  'not-allowed': 'Permissão do microfone negada. Libere o microfone nas configurações do navegador.',
  'service-not-allowed': 'Permissão do microfone negada. Libere o microfone nas configurações do navegador.',
  'audio-capture': 'Nenhum microfone encontrado.',
  'network': 'Sem conexão com o serviço de voz do navegador.',
  'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo.',
};

const MENSAGEM_GENERICA = 'Não foi possível reconhecer a voz. Tente novamente.';

// No app instalado do iPhone (tela de início) o iOS não libera o reconhecimento de voz: o start()
// passa, mas a escuta é cortada na hora ('aborted'). No Safari funciona. Limitação da Apple, sem
// contorno no site (WebKit bug 225298) — o app tenta assim mesmo e, se falhar, explica.
// Paliativo da fase de testes: a solução definitiva é o app na App Store. O ScannerProdutoComponent
// reconhece esta mensagem e a mostra com o link que abre o Safari.
export const MENSAGEM_IPHONE_INSTALADO = 'No iPhone, a Apple não libera a busca por voz no app instalado.';

// Erros que não têm a ver com a limitação do iPhone: o cliente só não falou, ou está sem internet.
const ERROS_COMUNS = ['no-speech', 'network'];

function iphoneInstalado(): boolean {
  const ua = navigator.userAgent;
  // iPad com iPadOS se apresenta como Mac; a tela de toque denuncia.
  const ios = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
  const instalado = matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return ios && instalado;
}

@Injectable({
  providedIn: 'root'
})
export class ReconhecimentoVozService {

  private reconhecimento?: ReconhecimentoVoz;

  constructor(private zone: NgZone) {}

  get suportado(): boolean {
    return this.construtor() !== undefined;
  }

  get ouvindo(): boolean {
    return this.reconhecimento !== undefined;
  }

  // Escuta uma frase (pt-BR) e encerra sozinho quando o cliente para de falar.
  iniciar(ouvinte: OuvinteVoz): void {
    const Construtor = this.construtor();
    if (!Construtor || this.reconhecimento) {
      return;
    }

    const reconhecimento = new Construtor();
    reconhecimento.lang = 'pt-BR';
    reconhecimento.continuous = false;
    reconhecimento.interimResults = true;
    reconhecimento.maxAlternatives = 1;

    let textoFinal = '';
    let erro: string | null = null;

    // Os eventos do navegador nem sempre disparam a detecção de mudanças do Angular.
    reconhecimento.onresult = (evento) => this.zone.run(() => {
      let parcial = '';
      for (let i = evento.resultIndex; i < evento.results.length; i++) {
        const resultado = evento.results[i];
        if (resultado.isFinal) {
          textoFinal += resultado[0].transcript;
        } else {
          parcial += resultado[0].transcript;
        }
      }
      ouvinte.aoOuvir((textoFinal + parcial).trim());
    });

    reconhecimento.onerror = (evento) => this.zone.run(() => {
      erro = iphoneInstalado() && !ERROS_COMUNS.includes(evento.error)
        ? MENSAGEM_IPHONE_INSTALADO
        : MENSAGENS_DE_ERRO[evento.error] ?? MENSAGEM_GENERICA;
    });

    reconhecimento.onend = () => this.zone.run(() => {
      this.reconhecimento = undefined;
      ouvinte.aoTerminar(textoFinal.trim(), erro);
    });

    this.reconhecimento = reconhecimento;
    try {
      reconhecimento.start();
    } catch {
      // start() que falha na hora não dispara onend: sem isto o botão ficaria preso em "ouvindo".
      this.reconhecimento = undefined;
      ouvinte.aoTerminar('', iphoneInstalado() ? MENSAGEM_IPHONE_INSTALADO : MENSAGEM_GENERICA);
    }
  }

  // Encerra a escuta aproveitando o que já foi ouvido (o resultado ainda chega em aoTerminar).
  parar(): void {
    this.reconhecimento?.stop();
  }

  // Descarta a escuta em andamento sem avisar ninguém (troca de modo, saída da tela).
  cancelar(): void {
    if (!this.reconhecimento) {
      return;
    }
    this.reconhecimento.onresult = null;
    this.reconhecimento.onerror = null;
    this.reconhecimento.onend = null;
    this.reconhecimento.abort();
    this.reconhecimento = undefined;
  }

  private construtor(): ConstrutorReconhecimentoVoz | undefined {
    const janela = window as unknown as {
      SpeechRecognition?: ConstrutorReconhecimentoVoz;
      webkitSpeechRecognition?: ConstrutorReconhecimentoVoz;
    };
    return janela.SpeechRecognition ?? janela.webkitSpeechRecognition;
  }
}
