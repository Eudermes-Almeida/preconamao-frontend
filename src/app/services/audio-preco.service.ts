import { Injectable } from '@angular/core';

const CHAVE_LOCALSTORAGE = 'preconamao.audioPrecoAtivo';

// A Web Speech API não expõe o gênero da voz, só o nome (que varia por navegador/SO). Em ORDEM DE
// PREFERÊNCIA (não é só "achou, usa"): "Francisca Online (Natural)" e "Google português do Brasil"
// soam naturais; "Microsoft Maria Desktop" é uma voz SAPI antiga e soa monótona/"triste" — só
// entra por último, como fallback, mesmo sendo comum no Windows.
const PREFERENCIA_VOZ_FEMININA = ['francisca', 'google português do brasil', 'luciana', 'maria', 'female'];
// Para não cair numa voz masculina quando nada da lista acima bater.
const NOMES_VOZ_MASCULINA = ['daniel', 'felipe', 'ricardo', 'male', 'fred'];

// Recurso de acessibilidade para deficientes visuais: com o toggle ligado, fala o nome e o preço
// do produto assim que o card principal da consulta aparece (modos 1 e 2), ou o nome e a
// localização no modo localizador (modo 3). Não fala nada na lista de candidatos — só quando um
// único produto "pousa" na tela.
@Injectable({
  providedIn: 'root'
})
export class AudioPrecoService {

  // Começa desligado e o estado do toggle fica salvo no aparelho, então a escolha sobrevive a um
  // F5/reabertura do app (mesmo padrão do PublicidadeService).
  ativo = this.lerEstadoSalvo();

  get suportado(): boolean {
    return 'speechSynthesis' in window;
  }

  alternar(): void {
    this.ativo = !this.ativo;
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, String(this.ativo));
    } catch {
      // Modo privado ou storage bloqueado: o toggle ainda funciona nesta sessão, só não persiste.
    }
    if (!this.ativo) {
      this.cancelar();
    }
  }

  // Fala "descrição, complemento" (preço no card principal, localização no modo localizador) assim
  // que o resultado é exibido. Uma fala nova sempre vence a anterior (ex.: bipagens rápidas em
  // sequência), a mesma lógica do bipe de confirmação.
  falar(descricao: string, complemento: string): void {
    if (!this.ativo || !this.suportado) {
      return;
    }
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(`${descricao}, ${complemento}`);
    fala.lang = 'pt-BR';
    const voz = this.vozFemininaDisponivel();
    if (voz) {
      fala.voice = voz;
    }
    window.speechSynthesis.speak(fala);
  }

  cancelar(): void {
    if (this.suportado) {
      window.speechSynthesis.cancel();
    }
  }

  // Escolhida a cada fala (não cacheada): getVoices() só vem populada depois que o navegador
  // carrega as vozes do sistema, o que pode acontecer bem depois do app abrir.
  private vozFemininaDisponivel(): SpeechSynthesisVoice | undefined {
    const vozesPt = window.speechSynthesis.getVoices().filter((voz) => voz.lang.toLowerCase().startsWith('pt'));
    if (vozesPt.length === 0) {
      return undefined;
    }

    // Testa cada nome PREFERIDO, nessa ordem, contra todas as vozes — não a primeira voz da lista
    // do navegador que bater com qualquer nome (senão "Maria" podia vencer "Francisca" só por
    // acaso de ordenação).
    for (const nome of PREFERENCIA_VOZ_FEMININA) {
      const encontrada = vozesPt.find((voz) => voz.name.toLowerCase().includes(nome));
      if (encontrada) {
        return encontrada;
      }
    }

    return vozesPt.find((voz) => !NOMES_VOZ_MASCULINA.some((nome) => voz.name.toLowerCase().includes(nome)))
      ?? vozesPt[0];
  }

  private lerEstadoSalvo(): boolean {
    try {
      return localStorage.getItem(CHAVE_LOCALSTORAGE) === 'true';
    } catch {
      return false;
    }
  }
}
