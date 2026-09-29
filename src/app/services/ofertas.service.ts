import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from './produto-api.service';

// Ofertas da loja: imagens em src/assets/publicidade/, geradas pela skill gerar-ofertas (pasta
// OFERTAS na raiz do projeto). O código de barras do produto vem do próprio nome do arquivo
// (oferta-<codigo>.png). A mesma lista alimenta a tela "Ofertas" e o sorteio da publicidade.
const ARQUIVOS: readonly string[] = [
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

export interface Oferta {
  imagem: string;
  codigoBarras: string;
}

export const OFERTAS: readonly Oferta[] = ARQUIVOS.map(arquivo => ({
  imagem: `assets/publicidade/${arquivo}`,
  codigoBarras: arquivo.match(/\d{8,14}/)![0],
}));

const CHAVE_FAVORITAS = 'preconamao.ofertas.favoritas';
const VALIDADE_PRECOS_MS = 60_000;
const CHAVE_FILTRO = 'preconamao.ofertas.somenteFavoritas';

// Favoritas e o filtro "Só favoritas" ficam no aparelho (como a pré-lista). O "Limpar tudo" do
// header não apaga: favoritar é preferência do cliente, não parte de uma compra.
@Injectable({
  providedIn: 'root'
})
export class OfertasService {

  private readonly favoritasState = signal<string[]>(this.carregarFavoritas());
  readonly favoritas = this.favoritasState.asReadonly();
  readonly totalFavoritas = computed(() => this.favoritasState().length);

  readonly somenteFavoritas = signal<boolean>(this.carregarFiltro());

  // Produto de cada oferta vindo da API: descrição (vai para a pré-lista) e PREÇO ATUAL (desenhado
  // sobre a imagem, que não traz preço). null = ainda não carregou; código ausente do mapa =
  // produto não encontrado ou inativo (a oferta some do sorteio e da tela).
  readonly produtos = signal<Record<string, ProdutoDTO> | null>(null);
  private carregandoProdutos = false;
  private carregadoEm = 0;

  // Ofertas cujo produto existe e está ativo; antes da primeira resposta, todas.
  readonly disponiveis = computed<readonly Oferta[]>(() => {
    const produtos = this.produtos();
    return produtos ? OFERTAS.filter(oferta => produtos[oferta.codigoBarras]) : OFERTAS;
  });

  constructor(private api: ProdutoApiService) {
    effect(() => this.gravar(CHAVE_FAVORITAS, JSON.stringify(this.favoritasState())));
    effect(() => this.gravar(CHAVE_FILTRO, String(this.somenteFavoritas())));
  }

  // Uma chamada em lote para as 10 ofertas. O preço muda com o PRICETAB, então não é "uma vez por
  // sessão": recarrega se a última resposta tiver mais de VALIDADE_PRECOS_MS (a cada anúncio e a
  // cada abertura da tela Ofertas). Sem rede, fica com a última resposta.
  carregarProdutos(): void {
    if (this.carregandoProdutos || (this.produtos() && Date.now() - this.carregadoEm < VALIDADE_PRECOS_MS)) {
      return;
    }
    this.carregandoProdutos = true;
    this.api.buscarLote(OFERTAS.map(oferta => oferta.codigoBarras))
      .pipe(catchError(() => of(null)))
      .subscribe(resultado => {
        this.carregandoProdutos = false;
        if (resultado) {
          this.carregadoEm = Date.now();
          this.produtos.set(Object.fromEntries(resultado.map(produto => [produto.codigoBarras, produto])));
        }
      });
  }

  ehFavorita(codigoBarras: string): boolean {
    return this.favoritasState().includes(codigoBarras);
  }

  alternarFavorita(codigoBarras: string): void {
    this.favoritasState.update(favoritas => favoritas.includes(codigoBarras)
      ? favoritas.filter(codigo => codigo !== codigoBarras)
      : [...favoritas, codigoBarras]);
  }

  alternarSomenteFavoritas(): void {
    this.somenteFavoritas.update(valor => !valor);
  }

  private carregarFavoritas(): string[] {
    try {
      const dados: unknown = JSON.parse(localStorage.getItem(CHAVE_FAVORITAS) ?? '[]');
      return Array.isArray(dados) ? dados.filter((codigo): codigo is string => typeof codigo === 'string') : [];
    } catch {
      return [];
    }
  }

  private carregarFiltro(): boolean {
    try {
      return localStorage.getItem(CHAVE_FILTRO) === 'true';
    } catch {
      return false;
    }
  }

  private gravar(chave: string, valor: string): void {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      // sem storage as favoritas continuam valendo só nesta sessão
    }
  }
}
