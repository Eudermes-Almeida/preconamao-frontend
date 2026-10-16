import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { LEMBRETE_MAXIMO } from '../../services/pre-lista.service';

// Janela do lembrete de uma linha da pré-lista ("Codil - 5 kg"), aberta pelo ✏️ da linha. É uma
// janela (como a do peso dos pesáveis) e não um campo na linha: com o teclado do iPhone aberto
// sobra pouca tela, e o cabeçalho fixo da pré-lista cobria o campo (teste do usuário, 16/10).
// Abre com o lembrete atual (inclusive o falado) e o teclado já aparece; para ditar, o cliente
// usa o microfone do próprio teclado. Salvar vazio = apagar.
@Component({
  selector: 'app-editar-lembrete',
  standalone: true,
  templateUrl: './editar-lembrete.component.html',
  styleUrl: './editar-lembrete.component.css'
})
export class EditarLembreteComponent implements AfterViewInit, OnDestroy {

  @Input() texto: string | null = null;
  @Input({ required: true }) nome!: string;
  @Output() salvar = new EventEmitter<string>();
  @Output() apagar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  @ViewChild('campo') private campo?: ElementRef<HTMLInputElement>;

  readonly maximo = LEMBRETE_MAXIMO;

  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    this.campo?.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }

  @HostListener('document:keydown.escape')
  aoEsc(): void {
    this.cancelar.emit();
  }

  confirmar(): void {
    this.salvar.emit(this.campo?.nativeElement.value ?? '');
  }
}
