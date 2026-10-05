import { Injectable, computed, effect, signal } from '@angular/core';
import { catchError, of } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from './produto-api.service';

// Ofertas da loja: imagens em src/assets/publicidade/, geradas pela skill gerar-ofertas (pasta
// OFERTAS na raiz do projeto). A arte traz o nome do produto mas não o preço: o preço é desenhado
// por cima, na hora, a partir do produto da loja. O código do nome do arquivo (oferta-<codigo>.png)
// é o da loja onde a arte foi feita; o MESMO produto pode ter outro código em outra rede (código
// auxiliar do ERP, outra embalagem/fornecedor), então cada arte aceita uma lista de códigos e vale
// o primeiro que existir no arquivo de preços da loja. Só entra código do produto exato da foto
// (ex.: Elseve "Longo dos Sonhos" não é o "Cachos Longo dos Sonhos"). A mesma lista alimenta a
// tela "Ofertas" e o sorteio da publicidade.
interface ArteOferta {
  arquivo: string;
  // Códigos do mesmo produto em outras redes, além do código do nome do arquivo.
  outrosCodigos?: readonly string[];
}

const ARTES: readonly ArteOferta[] = [
  { arquivo: 'oferta-7891095012596.png' },
  { arquivo: 'oferta-7891150027749.png' },
  { arquivo: 'oferta-7891150107533.png' },
  // PRICE2 (2026-10-05): AGUA MIN CRYSTAL 500ml.
  { arquivo: 'oferta-7894900011524.png', outrosCodigos: ['7894900530001', '7896371000045', '0000000402828'] },
  { arquivo: 'oferta-7896004003901.png' },
  // PRICE2: RACAO CAO PEDIGREE 100G CARNE RACA PEQ (a arte é o sachê Raças Pequenas, carne).
  { arquivo: 'oferta-7896022204557.png', outrosCodigos: ['7896029022245'] },
  { arquivo: 'oferta-7896022204571.png' },
  { arquivo: 'oferta-7896051111024.png' },
  { arquivo: 'oferta-7896051114024.png' },
  // PRICE2: LIMP M USO VEJA 500ml TRAD.
  { arquivo: 'oferta-7898255671617.png', outrosCodigos: ['7891035210006', '7891035210013', '7891035210105', '7891035210259'] },
  // Artes feitas com os produtos do PRICE2 (2026-10-05, fotos do usuário, skill gerar-ofertas).
  { arquivo: 'oferta-0606529442514.png' },  // tomate grape Rancho do Tinho 300g
  { arquivo: 'oferta-7500435154383.png' },  // aparelho de barbear Prestobarba Ultragrip
  { arquivo: 'oferta-7891150027800.png' },  // maionese Hellmann's squeeze 335g
  { arquivo: 'oferta-7891150044906.png' },  // sabão líquido Omo puro cuidado 3L
  { arquivo: 'oferta-7892840822408.png' },  // Doritos queijo nacho 37g
  { arquivo: 'oferta-7894321811253.png' },  // sardinha Coqueiro molho de tomate 125g
  { arquivo: 'oferta-7894900011715.png' },  // Coca-Cola 1L
  { arquivo: 'oferta-7896051145219.png' },  // doce de leite Itambé lata 800g
  { arquivo: 'oferta-7898347310486.png' },  // sorvete Ygloo flocos 1,5L
  { arquivo: 'oferta-7899706187343.png' },  // shampoo Elseve Hialurônico 200ml
  { arquivo: 'oferta-9002490247379.png' },  // energético Red Bull melancia 250ml
];

// codigoBarras = o código que vale NESTA loja (o que o cliente bipa, o da pré-lista e dos
// eventos). Antes da resposta da API, o do nome do arquivo.
export interface Oferta {
  imagem: string;
  codigoBarras: string;
}

const codigosDaArte = (arte: ArteOferta): string[] =>
  [arte.arquivo.match(/\d{8,14}/)![0], ...(arte.outrosCodigos ?? [])];

export const OFERTAS: readonly Oferta[] = ARTES.map(arte => ({
  imagem: `assets/publicidade/${arte.arquivo}`,
  codigoBarras: codigosDaArte(arte)[0],
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

  // Ofertas cujo produto existe e está ativo nesta loja, já com o código da loja; antes da
  // primeira resposta, todas.
  readonly disponiveis = computed<readonly Oferta[]>(() => {
    const produtos = this.produtos();
    if (!produtos) {
      return OFERTAS;
    }
    return ARTES.flatMap((arte, i) => {
      const codigo = codigosDaArte(arte).find(c => produtos[c]);
      return codigo ? [{ imagem: OFERTAS[i].imagem, codigoBarras: codigo }] : [];
    });
  });

  constructor(private api: ProdutoApiService) {
    effect(() => this.gravar(CHAVE_FAVORITAS, JSON.stringify(this.favoritasState())));
    effect(() => this.gravar(CHAVE_FILTRO, String(this.somenteFavoritas())));
  }

  // Uma chamada em lote com todos os códigos de todas as artes (máx. 100). O preço muda com o PRICETAB, então não é "uma vez por
  // sessão": recarrega se a última resposta tiver mais de VALIDADE_PRECOS_MS (a cada anúncio e a
  // cada abertura da tela Ofertas). Sem rede, fica com a última resposta.
  carregarProdutos(): void {
    if (this.carregandoProdutos || (this.produtos() && Date.now() - this.carregadoEm < VALIDADE_PRECOS_MS)) {
      return;
    }
    this.carregandoProdutos = true;
    this.api.buscarLote(ARTES.flatMap(codigosDaArte))
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
