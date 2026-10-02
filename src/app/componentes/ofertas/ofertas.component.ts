import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, OnInit, Output, QueryList, ViewChildren, computed } from '@angular/core';
import { Oferta, OfertasService } from '../../services/ofertas.service';
import { OfertaImagemComponent } from '../oferta-imagem/oferta-imagem.component';
import { PreListaService } from '../../services/pre-lista.service';
import { EventosMidiaService } from '../../services/eventos-midia.service';
import { LojaService } from '../../services/loja.service';

// Relatório de mídias: um card conta como exibido quando fica com metade à mostra por 1 s
// (padrão de mercado para "impressão" de anúncio), uma vez por abertura da tela.
const FRACAO_VISIVEL = 0.5;
const TEMPO_VISIVEL_MS = 1000;

// Tela "Ofertas" (botão dourado abaixo dos modos): os cards das ofertas da loja, cada um com
// "Localizar" (abre o modo 3 com o produto), "Pôr na pré-lista" (o produto exato, não o item
// genérico) e o coração de favoritar, com o filtro "Só favoritas" no topo.
@Component({
  selector: 'app-ofertas',
  standalone: true,
  imports: [OfertaImagemComponent],
  templateUrl: './ofertas.component.html',
  styleUrl: './ofertas.component.css'
})
export class OfertasComponent implements OnInit, AfterViewInit, OnDestroy {

  // Código de barras da oferta: o ScannerProdutoComponent troca para o localizador.
  @Output() localizar = new EventEmitter<string>();
  // "X" do topo: sai das ofertas e mostra de novo os botões de função.
  @Output() fechar = new EventEmitter<void>();

  @ViewChildren('card') private cards!: QueryList<ElementRef<HTMLElement>>;

  // Filtro só vale com alguma favorita: senão a tela ficaria vazia (mesma regra da pré-lista).
  readonly somenteFavoritas = computed(() =>
    this.ofertas.somenteFavoritas() && this.ofertas.totalFavoritas() > 0);

  // Só ofertas de produto ativo (a que saiu do PRICETAB some da tela).
  readonly visiveis = computed<readonly Oferta[]>(() => this.somenteFavoritas()
    ? this.ofertas.disponiveis().filter(oferta => this.ofertas.favoritas().includes(oferta.codigoBarras))
    : this.ofertas.disponiveis());

  private observador?: IntersectionObserver;
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>();
  // Já contadas nesta abertura da tela (ligar/desligar o filtro recria os cards, mas não recontam).
  private readonly exibidas = new Set<string>();

  constructor(public ofertas: OfertasService, public preLista: PreListaService, private eventosMidia: EventosMidiaService,
              public loja: LojaService) {}

  ngOnInit(): void {
    this.ofertas.carregarProdutos();
  }

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') {
      return;
    }
    this.observador = new IntersectionObserver(entradas => {
      for (const entrada of entradas) {
        const codigo = (entrada.target as HTMLElement).dataset['codigo'];
        if (!codigo || this.exibidas.has(codigo)) {
          continue;
        }
        if (entrada.isIntersecting && entrada.intersectionRatio >= FRACAO_VISIVEL) {
          if (!this.timers.has(codigo)) {
            this.timers.set(codigo, setTimeout(() => this.contarExibicao(codigo), TEMPO_VISIVEL_MS));
          }
        } else {
          clearTimeout(this.timers.get(codigo));
          this.timers.delete(codigo);
        }
      }
    }, { threshold: [0, FRACAO_VISIVEL] });
    this.observarCards();
    this.cards.changes.subscribe(() => this.observarCards());
  }

  ngOnDestroy(): void {
    this.observador?.disconnect();
    this.timers.forEach(timer => clearTimeout(timer));
  }

  // Descrição do banco (ex.: "MAIONESE HELLMANNS 335ML"); null enquanto carrega ou se o produto
  // não existir — aí o botão da pré-lista fica desabilitado.
  descricao(oferta: Oferta): string | null {
    return this.ofertas.produtos()?.[oferta.codigoBarras]?.descricao ?? null;
  }

  alternarPreLista(oferta: Oferta): void {
    const descricao = this.descricao(oferta);
    if (descricao) {
      if (!this.preLista.temProduto(oferta.codigoBarras)) {
        this.eventosMidia.registrar('PRE_LISTA', 'TELA_OFERTAS', oferta.codigoBarras);
      }
      this.preLista.alternarProduto(oferta.codigoBarras, descricao);
    }
  }

  alternarFavorita(codigoBarras: string): void {
    this.eventosMidia.registrar(this.ofertas.ehFavorita(codigoBarras) ? 'DESFAVORITAR' : 'FAVORITAR', 'TELA_OFERTAS', codigoBarras);
    this.ofertas.alternarFavorita(codigoBarras);
  }

  localizarOferta(codigoBarras: string): void {
    this.eventosMidia.registrar('LOCALIZAR', 'TELA_OFERTAS', codigoBarras);
    this.localizar.emit(codigoBarras);
  }

  private observarCards(): void {
    this.observador?.disconnect();
    this.timers.forEach(timer => clearTimeout(timer));
    this.timers.clear();
    this.cards.forEach(card => this.observador?.observe(card.nativeElement));
  }

  private contarExibicao(codigo: string): void {
    this.timers.delete(codigo);
    if (document.visibilityState === 'visible' && !this.exibidas.has(codigo)) {
      this.exibidas.add(codigo);
      this.eventosMidia.registrar('EXIBICAO', 'TELA_OFERTAS', codigo);
    }
  }
}
