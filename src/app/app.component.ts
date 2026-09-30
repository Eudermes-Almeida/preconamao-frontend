import { Component, HostListener, OnInit, ViewChild } from '@angular/core';
import { CabecalhoComponent } from './componentes/cabecalho/cabecalho.component';
import { ModalConfirmacaoComponent } from './componentes/modal-confirmacao/modal-confirmacao.component';
import { ScannerProdutoComponent } from './componentes/scanner-produto/scanner-produto.component';
import { AvisoLegalModalComponent } from './componentes/aviso-legal-modal/aviso-legal-modal.component';
import { ListaCompletaModalComponent } from './componentes/lista-completa-modal/lista-completa-modal.component';
import { PreListaService } from './services/pre-lista.service';
import { CarrinhoService } from './services/carrinho.service';
import { OfertasService } from './services/ofertas.service';
import { EventosMidiaService } from './services/eventos-midia.service';
import { PainelAdminComponent } from './componentes/painel-admin/painel-admin.component';
import { InstalarAppAjudaComponent } from './componentes/instalar-app-ajuda/instalar-app-ajuda.component';
import { InstalacaoAppService } from './services/instalacao-app.service';
import { FamiliaService } from './services/familia.service';
import { ConviteFamiliaComponent } from './componentes/familia/convite-familia.component';
import { FamiliaPainelComponent } from './componentes/familia/familia-painel.component';
import { EnviarListaComponent } from './componentes/familia/enviar-lista.component';
import { ListaRecebidaComponent } from './componentes/familia/lista-recebida.component';

// Aba administrativa: endereço /admin, só em computador (tela larga e mouse). No celular o endereço
// abre o app normal e volta para "/", sem nenhum sinal de que o painel existe. Sem login por enquanto.
function abrirPainelAdmin(): boolean {
  if (location.pathname.replace(/\/+$/, '') !== '/admin') {
    return false;
  }
  if (matchMedia('(min-width: 1024px) and (pointer: fine)').matches) {
    return true;
  }
  history.replaceState(null, '', '/');
  return false;
}

// Convite da Família vindo do WhatsApp: /familia/<código>. O endereço volta para "/" (recarregar
// não reabre o convite) e o código segue para a janela de aceitar.
function lerConviteDoEndereco(): string | null {
  const achado = location.pathname.match(/^\/familia\/([A-Za-z0-9-]{8,9})\/?$/);
  if (!achado) {
    return null;
  }
  history.replaceState(null, '', '/');
  return achado[1].toUpperCase().replace(/-/g, '');
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PainelAdminComponent, CabecalhoComponent, ScannerProdutoComponent, ModalConfirmacaoComponent, AvisoLegalModalComponent,
    ListaCompletaModalComponent, InstalarAppAjudaComponent, ConviteFamiliaComponent, FamiliaPainelComponent, EnviarListaComponent,
    ListaRecebidaComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  @ViewChild(ScannerProdutoComponent) scanner!: ScannerProdutoComponent;

  readonly modoAdmin = abrirPainelAdmin();

  confirmandoLimpeza = false;
  // Aparece toda vez que o app abre (sem persistir em localStorage — é o pedido do usuário).
  mostrandoAvisoLegal = !this.modoAdmin;

  constructor(public preLista: PreListaService, private carrinho: CarrinhoService, private ofertas: OfertasService,
              private eventosMidia: EventosMidiaService, public instalacaoApp: InstalacaoAppService,
              public familia: FamiliaService) {}

  // Alguma janela da Família aberta por cima: o leitor pausa, como nos outros modais. A lista
  // recebida só aparece com a tela livre (sem aviso legal nem outro modal na frente).
  get modalFamiliaAberto(): boolean {
    return !!this.familia.convitePendente() || this.familia.painelAberto() || this.familia.envioAberto()
      || this.mostrandoListaRecebida;
  }

  get mostrandoListaRecebida(): boolean {
    return !!this.familia.listaParaResponder() && !this.mostrandoAvisoLegal && !this.confirmandoLimpeza
      && !this.familia.convitePendente() && !this.familia.painelAberto() && !this.familia.envioAberto();
  }

  // Preços podem ter mudado desde a última vez que o app ficou aberto: confere o carrinho salvo e
  // já deixa os preços das ofertas prontos para o primeiro anúncio.
  ngOnInit(): void {
    if (this.modoAdmin) {
      return;
    }
    this.carrinho.revalidar();
    this.ofertas.carregarProdutos();
    this.eventosMidia.iniciar();
    this.instalacaoApp.iniciar();
    this.familia.convitePendente.set(lerConviteDoEndereco());
    this.familia.iniciar();
  }

  // Voltou para o app (outra aba/app, tela desligada): mesma conferência.
  @HostListener('document:visibilitychange')
  aoVoltarParaOApp(): void {
    if (!this.modoAdmin && document.visibilityState === 'visible') {
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
