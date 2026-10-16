import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild, signal } from '@angular/core';

// Mostra a chave nova do agente de uma loja (botão "Gerar nova chave" do painel). Ela aparece só
// aqui: o servidor guarda apenas o hash. Perdeu = gerar outra.
@Component({
  selector: 'app-chave-nova-modal',
  standalone: true,
  templateUrl: './chave-nova-modal.component.html',
  styleUrl: './chave-nova-modal.component.css'
})
export class ChaveNovaModalComponent implements AfterViewInit, OnDestroy {

  @Input({ required: true }) loja!: string;
  @Input({ required: true }) chave!: string;
  @Output() fechar = new EventEmitter<void>();

  @ViewChild('campo') private campo?: ElementRef<HTMLInputElement>;

  readonly copiada = signal(false);

  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    this.campo?.nativeElement.select();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }

  @HostListener('document:keydown.escape')
  aoEsc(): void {
    this.fechar.emit();
  }

  async copiar(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.chave);
      this.copiada.set(true);
    } catch {
      // Sem acesso à área de transferência: deixa a chave selecionada para Ctrl+C.
      this.campo?.nativeElement.select();
    }
  }
}
