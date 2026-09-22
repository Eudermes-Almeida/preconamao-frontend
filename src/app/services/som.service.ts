import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class SomService {

  private contexto?: AudioContext;

  // Bipe curto de confirmação, tocado assim que um código de barras é lido (achado ou não no
  // catálogo — o bipe confirma a leitura, não o resultado da busca). O AudioContext só existe a
  // partir da primeira chamada, que precisa vir de um gesto do usuário (toque ou tecla do leitor
  // USB) para o navegador liberar o som.
  tocarBip(): void {
    this.contexto ??= new AudioContext();
    if (this.contexto.state === 'suspended') {
      this.contexto.resume();
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
