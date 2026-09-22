import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SomService {

  private contexto?: AudioContext;

  // Precisa ser chamado de dentro de um gesto do usuário (toque no botão, tecla do leitor USB),
  // e nada depois disso — nem um await, nem um requestAnimationFrame — antes de criar o
  // AudioContext. Só assim o navegador libera o som "na hora"; se a criação acontecer mais tarde
  // (ex.: dentro do callback assíncrono da câmera, quando o código já foi detectado), o Chrome
  // pode manter o contexto suspenso sem avisar, e o bipe nunca toca.
  destravar(): void {
    this.contexto ??= new AudioContext();
    if (this.contexto.state === 'suspended') {
      this.contexto.resume();
    }
  }

  // Bipe curto de confirmação, tocado assim que um código de barras é lido (achado ou não no
  // catálogo — o bipe confirma a leitura, não o resultado da busca). Não toca nada se destravar()
  // ainda não tiver sido chamado (não deveria acontecer, já que todo caminho até aqui passa por
  // um toque ou tecla antes).
  tocarBip(): void {
    if (!this.contexto) {
      return;
    }

    const agora = this.contexto.currentTime;
    const oscilador = this.contexto.createOscillator();
    const ganho = this.contexto.createGain();

    oscilador.type = 'square';
    oscilador.frequency.setValueAtTime(1800, agora);

    // Sobe e desce em rampa (em vez de ligar/desligar seco) para não estourar um "clique" nas pontas.
    ganho.gain.setValueAtTime(0.0001, agora);
    ganho.gain.exponentialRampToValueAtTime(0.2, agora + 0.005);
    ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.12);

    oscilador.connect(ganho).connect(this.contexto.destination);
    oscilador.start(agora);
    oscilador.stop(agora + 0.13);
  }
}
