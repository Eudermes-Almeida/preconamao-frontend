import { Component, ViewChild } from '@angular/core';
import { CabecalhoComponent } from './componentes/cabecalho/cabecalho.component';
import { ModalConfirmacaoComponent } from './componentes/modal-confirmacao/modal-confirmacao.component';
import { ScannerProdutoComponent } from './componentes/scanner-produto/scanner-produto.component';
import { AvisoLegalModalComponent } from './componentes/aviso-legal-modal/aviso-legal-modal.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CabecalhoComponent, ScannerProdutoComponent, ModalConfirmacaoComponent, AvisoLegalModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {

  @ViewChild(ScannerProdutoComponent) scanner!: ScannerProdutoComponent;

  confirmandoLimpeza = false;
  // Aparece toda vez que o app abre (sem persistir em localStorage — é o pedido do usuário).
  mostrandoAvisoLegal = true;

  fecharAvisoLegal(): void {
    this.mostrandoAvisoLegal = false;
  }

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
