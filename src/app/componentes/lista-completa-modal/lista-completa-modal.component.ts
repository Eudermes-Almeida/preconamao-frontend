import { AfterViewInit, Component, ElementRef, EventEmitter, OnDestroy, Output, ViewChild } from '@angular/core';

// Parabéns da pré-lista: aberto pelo PreListaService quando o último item marcado é riscado
// (ver AppComponent — fica acima de qualquer modo, já que o cliente está bipando no modo 1/2).
@Component({
  selector: 'app-lista-completa-modal',
  standalone: true,
  templateUrl: './lista-completa-modal.component.html',
  styleUrl: './lista-completa-modal.component.css'
})
export class ListaCompletaModalComponent implements AfterViewInit, OnDestroy {

  @Output() fechar = new EventEmitter<void>();

  @ViewChild('botaoFechar') botaoFechar!: ElementRef<HTMLButtonElement>;

  // Devolvido ao fechar, para o foco não se perder no <body> depois do modal.
  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    this.botaoFechar.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }
}
