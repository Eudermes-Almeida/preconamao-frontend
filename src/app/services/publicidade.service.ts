import { Injectable } from '@angular/core';

// Cada consulta (código de barras ou voz) sorteia uma destas, enquanto a publicidade estiver
// ativa. Ficam em src/assets/publicidade/ (recortadas de MARKTING/, na raiz do projeto).
const IMAGENS: readonly string[] = [
  'amaciante.png',
  'biscoito.png',
  'caldo-knnor.png',
  'chokito.png',
  'creme-dental.png',
  'desodorante.png',
  'detergente-limao.png',
  'detergente.png',
  'escova.png',
  'iogurte.png',
  'kitkat.png',
  'knnor-arroz.png',
  'sabonete.png',
  'sazon.png',
  'tixan.png',
  'vinho.png',
];

const CHAVE_LOCALSTORAGE = 'preconamao.publicidadeAtiva';

@Injectable({
  providedIn: 'root'
})
export class PublicidadeService {

  // Recurso ainda em teste (ver feedback do usuário): começa desligado e o estado do toggle fica
  // salvo no aparelho, então a escolha sobrevive a um F5/reabertura do app.
  ativa = this.lerEstadoSalvo();

  alternar(): void {
    this.ativa = !this.ativa;
    try {
      localStorage.setItem(CHAVE_LOCALSTORAGE, String(this.ativa));
    } catch {
      // Modo privado ou storage bloqueado: o toggle ainda funciona nesta sessão, só não persiste.
    }
  }

  sortearImagem(): string {
    const indice = Math.floor(Math.random() * IMAGENS.length);
    return `assets/publicidade/${IMAGENS[indice]}`;
  }

  private lerEstadoSalvo(): boolean {
    try {
      return localStorage.getItem(CHAVE_LOCALSTORAGE) === 'true';
    } catch {
      return false;
    }
  }
}
