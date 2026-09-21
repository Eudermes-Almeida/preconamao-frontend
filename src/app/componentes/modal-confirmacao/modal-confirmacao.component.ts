import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';

@Component({
  selector: 'app-modal-confirmacao',
  standalone: true,
  templateUrl: './modal-confirmacao.component.html',
  styleUrl: './modal-confirmacao.component.css'
})
export class ModalConfirmacaoComponent implements AfterViewInit, OnDestroy {

  @Input({ required: true }) titulo!: string;
  @Input({ required: true }) mensagem!: string;
  @Input() textoConfirmar = 'Confirmar';

  @Output() confirmar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();

  @ViewChild('botaoCancelar') botaoCancelar!: ElementRef<HTMLButtonElement>;

  // Devolvido ao fechar, para o foco não se perder no <body> depois do modal.
  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  constructor(private host: ElementRef<HTMLElement>) {}

  // O foco inicial fica em "Cancelar": numa ação destrutiva, um Enter acidental não deve confirmar.
  ngAfterViewInit(): void {
    this.botaoCancelar.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }

  @HostListener('keydown', ['$event'])
  aoPressionarTecla(evento: KeyboardEvent): void {
    if (evento.key === 'Escape') {
      this.cancelar.emit();
      return;
    }

    // Mantém o Tab dentro do modal (só há dois botões).
    if (evento.key === 'Tab') {
      const botoes = Array.from(this.host.nativeElement.querySelectorAll('button'));
      const primeiro = botoes[0];
      const ultimo = botoes[botoes.length - 1];

      if (evento.shiftKey && document.activeElement === primeiro) {
        evento.preventDefault();
        ultimo.focus();
      } else if (!evento.shiftKey && document.activeElement === ultimo) {
        evento.preventDefault();
        primeiro.focus();
      }
    }
  }
}
