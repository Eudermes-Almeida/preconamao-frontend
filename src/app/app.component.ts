import { Component, ViewChild } from '@angular/core';
import { CabecalhoComponent } from './componentes/cabecalho/cabecalho.component';
import { ModalConfirmacaoComponent } from './componentes/modal-confirmacao/modal-confirmacao.component';
import { ScannerProdutoComponent } from './componentes/scanner-produto/scanner-produto.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CabecalhoComponent, ScannerProdutoComponent, ModalConfirmacaoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  @ViewChild(ScannerProdutoComponent) scanner!: ScannerProdutoComponent;

  confirmandoLimpeza = false;

  pedirConfirmacaoDeLimpeza(): void {
    this.confirmandoLimpeza = true;
  }

  cancelarLimpeza(): void {
    this.confirmandoLimpeza = false;
  }

  confirmarLimpeza(): void {
    this.scanner.reiniciar();
    this.confirmandoLimpeza = false;
  }
}
