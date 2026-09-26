import { Injectable } from '@angular/core';
import { OFERTAS } from './ofertas.service';

// Cada consulta (código de barras ou voz) sorteia uma das OFERTAS (ver OfertasService), enquanto a
// publicidade estiver ativa. O código de barras do produto anunciado é o que o botão "Localizar
// Oferta" do anúncio usa. As propagandas antigas (sem código no nome) continuam em
// src/assets/publicidade/, só fora do sorteio.

export interface Propaganda {
  imagem: string;
  // null quando o nome do arquivo não traz código: o anúncio aparece, mas sem "Localizar Oferta".
  codigoBarras: string | null;
}

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

  sortear(): Propaganda {
    const oferta = OFERTAS[Math.floor(Math.random() * OFERTAS.length)];
    return { imagem: oferta.imagem, codigoBarras: oferta.codigoBarras };
  }

  private lerEstadoSalvo(): boolean {
    try {
      return localStorage.getItem(CHAVE_LOCALSTORAGE) === 'true';
    } catch {
      return false;
    }
  }
}
