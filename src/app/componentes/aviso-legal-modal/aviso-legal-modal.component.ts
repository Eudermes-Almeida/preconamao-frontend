import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, OnDestroy, Output, ViewChild } from '@angular/core';

// Tempo até fechar sozinho, se o usuário não tocar em "Fechar" antes (pedido do usuário: 15s).
const DURACAO_MS = 15000;

@Component({
  selector: 'app-aviso-legal-modal',
  standalone: true,
  templateUrl: './aviso-legal-modal.component.html',
  styleUrl: './aviso-legal-modal.component.css'
})
export class AvisoLegalModalComponent implements AfterViewInit, OnDestroy {

  @Output() fechar = new EventEmitter<void>();

  @ViewChild('botaoFechar') botaoFechar!: ElementRef<HTMLButtonElement>;

  // Devolvido ao fechar, para o foco não se perder no <body> depois do modal.
  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  private readonly temporizador = setTimeout(() => this.fechar.emit(), DURACAO_MS);

  ngAfterViewInit(): void {
    this.botaoFechar.nativeElement.focus();
  }

  ngOnDestroy(): void {
    clearTimeout(this.temporizador);
    this.focoAnterior?.focus?.();
  }

  @HostListener('keydown.escape')
  aoPressionarEscape(): void {
    this.fechar.emit();
  }
}
