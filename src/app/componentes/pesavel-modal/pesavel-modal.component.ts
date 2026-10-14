import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, OnInit, Output } from '@angular/core';
import { Pesagem } from '../../services/carrinho.service';
import { formatarCentavos } from '../../utils/formatar-moeda';
import { PesoMedio, formatarGramas, pesoMedioDe } from '../../utils/peso-medio';

// Pesável é "contado" até este limite (evita 50 kg digitados por engano num celular).
const GRAMAS_MAX = 30000;
const UNIDADES_MAX = 99;

// Produto vendido por kg sem etiqueta (hortifrúti, padaria — só o caixa etiqueta): o cliente diz
// como quer pôr no carrinho. Peso = digitado (g ou kg) com atalhos; Quantidade = unidades × peso
// médio da tabela (só aparece para produto que está nela); Pesar no caixa = entra sem valor.
// Peso e quantidade são sempre "≈": o valor final é o da balança do caixa.
@Component({
  selector: 'app-pesavel-modal',
  standalone: true,
  templateUrl: './pesavel-modal.component.html',
  styleUrl: './pesavel-modal.component.css'
})
export class PesavelModalComponent implements OnInit, AfterViewInit, OnDestroy {

  @Input({ required: true }) descricao!: string;
  @Input({ required: true }) precoKgCentavos!: number;
  // Pesagem já no carrinho (edição): abre nela.
  @Input() inicial?: Pesagem;
  // "Salvar" na edição pelo carrinho; "Adicionar ao carrinho" no card de preço.
  @Input() textoConfirmar = 'Adicionar ao carrinho';
  // false = loja sem preço garantido para este produto: não mostra valor estimado.
  @Input() comPreco = true;

  @Output() confirmar = new EventEmitter<Pesagem>();
  @Output() cancelar = new EventEmitter<void>();

  readonly formatar = formatarCentavos;

  pesoMedio: PesoMedio | null = null;
  modo: Pesagem['modo'] = 'PESO';

  // Peso: o que está no campo, na unidade escolhida (vírgula aceita).
  emKg = false;
  textoPeso = '';
  unidades = 1;

  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnInit(): void {
    this.pesoMedio = pesoMedioDe(this.descricao);
    const inicial = this.inicial;
    if (inicial?.modo === 'PESO' && inicial.gramas) {
      this.modo = 'PESO';
      this.definirGramas(inicial.gramas);
    } else if (inicial?.modo === 'QUANTIDADE' && inicial.unidades && this.pesoMedio) {
      this.modo = 'QUANTIDADE';
      this.unidades = inicial.unidades;
    } else if (inicial?.modo === 'CAIXA') {
      this.modo = 'CAIXA';
    } else {
      // Sem balança na seção, o comum é contar: abre em Quantidade quando o produto está na tabela.
      this.modo = this.pesoMedio ? 'QUANTIDADE' : 'PESO';
    }
  }

  ngAfterViewInit(): void {
    this.host.nativeElement.querySelector<HTMLElement>('.aba-ativa')?.focus();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }

  // Gramas do campo de peso (0 se vazio ou inválido).
  get gramasDigitadas(): number {
    const numero = Number(this.textoPeso.replace(',', '.'));
    if (!Number.isFinite(numero) || numero <= 0) {
      return 0;
    }
    return Math.round(this.emKg ? numero * 1000 : numero);
  }

  get gramas(): number {
    if (this.modo === 'PESO') {
      return this.gramasDigitadas;
    }
    if (this.modo === 'QUANTIDADE' && this.pesoMedio) {
      return this.unidades * this.pesoMedio.gramas;
    }
    return 0;
  }

  get pesoExcedido(): boolean {
    return this.modo === 'PESO' && this.gramasDigitadas > GRAMAS_MAX;
  }

  get podeConfirmar(): boolean {
    if (this.modo === 'CAIXA') {
      return true;
    }
    return this.gramas > 0 && !this.pesoExcedido;
  }

  get valorEstimado(): number {
    return Math.round(this.precoKgCentavos * this.gramas / 1000);
  }

  // "720 g" / "1,25 kg".
  formatarPeso(gramas: number): string {
    return formatarGramas(gramas);
  }

  get nomeUnidade(): string {
    const unidade = this.pesoMedio?.unidade ?? 'unidade';
    return this.unidades === 1 ? unidade : plural(unidade);
  }

  escolherModo(modo: Pesagem['modo']): void {
    this.modo = modo;
  }

  aoDigitarPeso(evento: Event): void {
    this.textoPeso = (evento.target as HTMLInputElement).value;
  }

  // Troca g <-> kg mantendo o peso (500 g vira 0,5 kg).
  trocarUnidade(emKg: boolean): void {
    if (emKg === this.emKg) {
      return;
    }
    const gramas = this.gramasDigitadas;
    this.emKg = emKg;
    this.textoPeso = gramas > 0 ? numeroNaUnidade(gramas, emKg) : '';
  }

  somarGramas(gramas: number): void {
    this.definirGramas(Math.min(this.gramasDigitadas + gramas, GRAMAS_MAX));
  }

  zerarPeso(): void {
    this.textoPeso = '';
  }

  mudarUnidades(delta: number): void {
    this.unidades = Math.min(UNIDADES_MAX, Math.max(1, this.unidades + delta));
  }

  confirmarPesagem(): void {
    if (!this.podeConfirmar) {
      return;
    }
    if (this.modo === 'CAIXA') {
      this.confirmar.emit({ modo: 'CAIXA' });
    } else if (this.modo === 'QUANTIDADE') {
      this.confirmar.emit({ modo: 'QUANTIDADE', unidades: this.unidades, gramas: this.gramas });
    } else {
      this.confirmar.emit({ modo: 'PESO', gramas: this.gramas });
    }
  }

  private definirGramas(gramas: number): void {
    // Até 1 kg fica em gramas; acima, em kg (mais fácil de ler "1,25").
    this.emKg = gramas >= 1000;
    this.textoPeso = numeroNaUnidade(gramas, this.emKg);
  }

  @HostListener('keydown', ['$event'])
  aoPressionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.cancelar.emit();
    } else if (evento.key === 'Enter' && (evento.target as HTMLElement).tagName === 'INPUT') {
      evento.preventDefault();
      this.confirmarPesagem();
    }
  }
}

function numeroNaUnidade(gramas: number, emKg: boolean): string {
  return emKg ? String(gramas / 1000).replace('.', ',') : String(gramas);
}

// Todas as unidades da tabela fazem plural com "s" (cacho, cabeça, pedaço, espiga).
function plural(unidade: string): string {
  return unidade + 's';
}
