import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { CabecalhoComponent } from './componentes/cabecalho/cabecalho.component';
import { ModalConfirmacaoComponent } from './componentes/modal-confirmacao/modal-confirmacao.component';
import { ScannerProdutoComponent } from './componentes/scanner-produto/scanner-produto.component';
import { AvisoLegalModalComponent } from './componentes/aviso-legal-modal/aviso-legal-modal.component';
import { ListaCompletaModalComponent } from './componentes/lista-completa-modal/lista-completa-modal.component';
import { PreListaService } from './services/pre-lista.service';
import { CarrinhoService } from './services/carrinho.service';
import { OfertasService } from './services/ofertas.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CabecalhoComponent, ScannerProdutoComponent, ModalConfirmacaoComponent, AvisoLegalModalComponent, ListaCompletaModalComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  @ViewChild(ScannerProdutoComponent) scanner!: ScannerProdutoComponent;

  confirmandoLimpeza = false;
  // Aparece toda vez que o app abre (sem persistir em localStorage — é o pedido do usuário).
  mostrandoAvisoLegal = true;

  constructor(public preLista: PreListaService, private carrinho: CarrinhoService, private ofertas: OfertasService) {}

  // Preços podem ter mudado desde a última vez que o app ficou aberto: confere o carrinho salvo e
  // já deixa os preços das ofertas prontos para o primeiro anúncio.
  ngOnInit(): void {
    this.carrinho.revalidar();
    this.ofertas.carregarProdutos();
  }

  // Voltou para o app (outra aba/app, tela desligada): mesma conferência.
  @HostListener('document:visibilitychange')
  aoVoltarParaOApp(): void {
    if (document.visibilityState === 'visible') {
      this.carrinho.revalidar();
    }
  }

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
