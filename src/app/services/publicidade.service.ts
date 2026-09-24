import { Injectable } from '@angular/core';

// Cada consulta (código de barras ou voz) sorteia uma destas, enquanto a publicidade estiver
// ativa. Ficam em src/assets/publicidade/ e são geradas pela skill gerar-ofertas (pasta OFERTAS na
// raiz do projeto). O código de barras do produto anunciado vem do próprio nome do arquivo
// (oferta-<codigo>.png) e é o que o botão "Localizar Oferta" do anúncio usa. As propagandas antigas
// (sem código no nome) continuam na pasta, só fora do sorteio.
const IMAGENS: readonly string[] = [
  'oferta-7891095012596.png',
  'oferta-7891150027749.png',
  'oferta-7891150107533.png',
  'oferta-7894900011524.png',
  'oferta-7896004003901.png',
  'oferta-7896022204557.png',
  'oferta-7896022204571.png',
  'oferta-7896051111024.png',
  'oferta-7896051114024.png',
  'oferta-7898255671617.png',
];

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
    const arquivo = IMAGENS[Math.floor(Math.random() * IMAGENS.length)];
    const codigo = arquivo.match(/\d{8,14}/);
    return { imagem: `assets/publicidade/${arquivo}`, codigoBarras: codigo ? codigo[0] : null };
  }

  private lerEstadoSalvo(): boolean {
    try {
      return localStorage.getItem(CHAVE_LOCALSTORAGE) === 'true';
    } catch {
      return false;
    }
  }
}
