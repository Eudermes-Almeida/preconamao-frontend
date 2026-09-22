import { Injectable } from '@angular/core';

const CHAVE_LOCALSTORAGE = 'preconamao.audioPrecoAtivo';

// Recurso de acessibilidade para deficientes visuais: com o toggle ligado, fala o nome e o preço
// do produto assim que o card principal da consulta aparece (modos 1 e 2). Não fala nada no modo
// localizador nem na lista de candidatos — só quando um único produto "pousa" na tela.
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

  // Fala "descrição, preço" assim que o card principal do produto é exibido. Uma fala nova sempre
  // vence a anterior (ex.: bipagens rápidas em sequência), a mesma lógica do bipe de confirmação.
  falar(descricao: string, precoFormatado: string): void {
    if (!this.ativo || !this.suportado) {
      return;
    }
    window.speechSynthesis.cancel();
    const fala = new SpeechSynthesisUtterance(`${descricao}, ${precoFormatado}`);
    fala.lang = 'pt-BR';
    window.speechSynthesis.speak(fala);
  }

  cancelar(): void {
    if (this.suportado) {
      window.speechSynthesis.cancel();
    }
  }

  private lerEstadoSalvo(): boolean {
    try {
      return localStorage.getItem(CHAVE_LOCALSTORAGE) === 'true';
    } catch {
      return false;
    }
  }
}
