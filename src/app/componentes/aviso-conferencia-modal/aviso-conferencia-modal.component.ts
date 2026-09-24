import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';

// Aviso mostrado na primeira vez que a lista "qual destes é o produto?" aparece na compra (ver
// ScannerProdutoComponent). Sem tempo para fechar sozinho nem fechamento por toque no fundo:
// só sai com "Compreendido", para o cliente de fato ler (pedido do usuário). Também é aberto pelo
// botão "Valor Total" do carrinho, que passa o total formatado para aparecer em destaque.
@Component({
  selector: 'app-aviso-conferencia-modal',
  standalone: true,
  templateUrl: './aviso-conferencia-modal.component.html',
  styleUrl: './aviso-conferencia-modal.component.css'
})
export class AvisoConferenciaModalComponent implements AfterViewInit, OnDestroy {

  // Ex.: "R$ 12,34"; sem valor, o modal mostra só o aviso.
  @Input() valorTotal: string | null = null;

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
