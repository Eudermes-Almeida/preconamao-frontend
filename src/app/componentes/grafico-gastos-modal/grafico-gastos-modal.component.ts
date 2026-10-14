import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, computed, signal } from '@angular/core';
import { FatiaGasto } from '../../services/carrinho.service';
import { formatarCentavos } from '../../utils/formatar-moeda';

// Rosca da fatia, em unidades de pathLength (a volta inteira = 100).
interface ArcoGasto {
  fatia: FatiaGasto;
  comprimento: number;
  inicio: number;
}

// Gráfico de gastos do carrinho (botão ao lado do "Valor Total"): rosca PLANA com o total no meio
// e a lista grupo / valor / % embaixo (3D distorce as proporções). Tocar numa fatia ou numa linha
// da lista destaca o grupo e mostra o valor dele no meio; tocar de novo volta ao total.
@Component({
  selector: 'app-grafico-gastos-modal',
  standalone: true,
  templateUrl: './grafico-gastos-modal.component.html',
  styleUrl: './grafico-gastos-modal.component.css'
})
export class GraficoGastosModalComponent implements AfterViewInit, OnDestroy {

  readonly formatar = formatarCentavos;

  private readonly fatiasState = signal<FatiaGasto[]>([]);
  @Input({ required: true }) set fatias(valor: FatiaGasto[]) {
    this.fatiasState.set(valor);
  }
  @Input() totalCentavos = 0;
  // Itens sem preço ou que a loja não tem: fora do gráfico, como no Valor Total.
  @Input() itensForaDaSoma = 0;
  // Pesáveis "pesar no caixa" ficam fora; com peso/quantidade entram estimados (≈ no total).
  @Input() itensAPesar = 0;
  @Input() estimado = false;

  @Output() fechar = new EventEmitter<void>();

  @ViewChild('botaoFechar') botaoFechar!: ElementRef<HTMLButtonElement>;

  readonly selecionado = signal<string | null>(null);

  // Folga entre fatias (o branco que separa uma cor da outra), em unidades de pathLength.
  private readonly folga = 0.8;

  readonly arcos = computed<ArcoGasto[]>(() => {
    const fatias = this.fatiasState();
    const total = fatias.reduce((soma, fatia) => soma + fatia.centavos, 0);
    if (total <= 0) {
      return [];
    }
    const folga = fatias.length > 1 ? this.folga : 0;
    let inicio = 0;
    return fatias.map(fatia => {
      const tamanho = fatia.centavos * 100 / total;
      const arco = { fatia, inicio, comprimento: Math.max(tamanho - folga, 0.3) };
      inicio += tamanho;
      return arco;
    });
  });

  // Lista do maior gasto para o menor (a cor continua a do grupo).
  readonly lista = computed(() => [...this.fatiasState()].sort((a, b) => b.centavos - a.centavos));

  readonly fatiaSelecionada = computed(() =>
    this.fatiasState().find(fatia => fatia.grupo.id === this.selecionado()) ?? null);

  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  alternar(id: string): void {
    this.selecionado.update(atual => atual === id ? null : id);
  }

  textoPercentual(fatia: FatiaGasto): string {
    return fatia.menosDeUm && fatia.percentual === 0 ? '<1%' : `${fatia.percentual}%`;
  }

  ngAfterViewInit(): void {
    this.botaoFechar.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }
}
