import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { CampanhaDTO, ProdutoApiService, ProdutoDTO } from './produto-api.service';
import { LojaService } from './loja.service';

// Ofertas da loja = campanhas de mídia cadastradas no servidor (multi-loja, regra 4a; antes a lista
// de artes ficava aqui no código). O servidor devolve só as campanhas válidas NESTA loja (alcance,
// validade, produto ativo e com preço), cada uma com o código e o preço desta loja. As imagens
// continuam em src/assets/publicidade/ (skill gerar-ofertas): a arte traz o nome do produto mas
// não o preço, que é desenhado por cima, na hora. A mesma lista alimenta a tela "Ofertas" e o
// sorteio da publicidade.

// codigoBarras = o código que vale NESTA loja (o que o cliente bipa, o da pré-lista e dos eventos).
export interface Oferta {
  imagem: string;
  codigoBarras: string;
}

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

  // Produto de cada oferta (descrição para a pré-lista e PREÇO ATUAL desenhado sobre a imagem).
  // null = ainda não carregou.
  readonly produtos = signal<Record<string, ProdutoDTO> | null>(null);
  private readonly campanhas = signal<readonly CampanhaDTO[]>([]);
  private carregandoProdutos = false;
  private carregadoEm = 0;
  private carregadoParaLoja: number | null = null;

  // Ofertas válidas nesta loja, já com o código da loja; antes da primeira resposta, nenhuma.
  readonly disponiveis = computed<readonly Oferta[]>(() =>
    this.campanhas().map(campanha => ({ imagem: campanha.imagem, codigoBarras: campanha.codigoBarras })));

  constructor(private api: ProdutoApiService, private loja: LojaService) {
    effect(() => this.gravar(CHAVE_FAVORITAS, JSON.stringify(this.favoritasState())));
    effect(() => this.gravar(CHAVE_FILTRO, String(this.somenteFavoritas())));
    // Trocou de loja: as ofertas e os preços são outros.
    effect(() => {
      const loja = this.loja.lojaConsultaId();
      if (loja != null && this.carregadoParaLoja != null && loja !== this.carregadoParaLoja) {
        this.carregadoEm = 0;
        this.carregarProdutos();
      }
    });
  }

  // Campanhas da loja, com o produto e o preço. O preço muda com a carga da loja, então não é
  // "uma vez por sessão": recarrega se a última resposta tiver mais de VALIDADE_PRECOS_MS (a cada
  // anúncio e a cada abertura da tela Ofertas) ou se a loja mudou. Sem rede, fica com a última.
  carregarProdutos(): void {
    const loja = this.loja.lojaConsultaId();
    if (this.carregandoProdutos
        || (this.produtos() && loja === this.carregadoParaLoja && Date.now() - this.carregadoEm < VALIDADE_PRECOS_MS)) {
      return;
    }
    this.carregandoProdutos = true;
    this.api.buscarCampanhas()
      .pipe(catchError(() => of(null)))
      .subscribe(resultado => {
        this.carregandoProdutos = false;
        if (resultado) {
          this.carregadoEm = Date.now();
          this.carregadoParaLoja = this.loja.lojaConsultaId();
          this.campanhas.set(resultado);
          this.produtos.set(Object.fromEntries(resultado.map(campanha => [campanha.codigoBarras, campanha.produto])));
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
