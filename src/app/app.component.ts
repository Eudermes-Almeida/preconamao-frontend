import { Component, HostListener, OnInit, ViewChild, effect, untracked } from '@angular/core';
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
import { SubstituirContatoComponent } from './componentes/familia/substituir-contato.component';
import { AtualizacaoAppService } from './services/atualizacao-app.service';
import { LojaService, slugDoEndereco } from './services/loja.service';
import { EscolherLojaComponent } from './componentes/escolher-loja/escolher-loja.component';
import { RegistrarPosicaoComponent } from './componentes/registrar-posicao/registrar-posicao.component';

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

// /admin/posicao: "Registrar a posição desta loja". Abre também no celular — é de dentro da loja,
// com o GPS do celular, que a posição sai certa.
function abrirRegistroPosicao(): boolean {
  return location.pathname.replace(/\/+$/, '') === '/admin/posicao';
}

// QR code da loja: www.simplificacompras.app.br/<slug>. O endereço volta para "/" e a loja segue
// para a confirmação "Você está dentro do ...?".
function lerLojaDoEndereco(): string | null {
  const slug = slugDoEndereco(location.pathname);
  if (slug) {
    history.replaceState(null, '', '/');
  }
  return slug;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [PainelAdminComponent, CabecalhoComponent, ScannerProdutoComponent, ModalConfirmacaoComponent, AvisoLegalModalComponent,
    ListaCompletaModalComponent, InstalarAppAjudaComponent, ConviteFamiliaComponent, FamiliaPainelComponent, EnviarListaComponent,
    ListaRecebidaComponent, SubstituirContatoComponent, EscolherLojaComponent, RegistrarPosicaoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent implements OnInit {

  @ViewChild(ScannerProdutoComponent) scanner!: ScannerProdutoComponent;

  readonly modoPosicao = abrirRegistroPosicao();
  readonly modoAdmin = !this.modoPosicao && abrirPainelAdmin();

  confirmandoLimpeza = false;
  // Aparece toda vez que o app abre (sem persistir em localStorage — é o pedido do usuário).
  mostrandoAvisoLegal = !this.modoAdmin && !this.modoPosicao;

  constructor(public preLista: PreListaService, private carrinho: CarrinhoService, private ofertas: OfertasService,
              private eventosMidia: EventosMidiaService, public instalacaoApp: InstalacaoAppService,
              public familia: FamiliaService,
              public atualizacao: AtualizacaoAppService,
              public loja: LojaService) {
    // Loja escolhida (ou trocada): os preços do carrinho passam a ser os dela.
    effect(() => {
      if (this.loja.lojaValida()) {
        untracked(() => this.carrinho.revalidar());
      }
    });
  }

  // Alguma janela da Família aberta por cima: o leitor pausa, como nos outros modais. A lista
  // recebida só aparece com a tela livre (sem aviso legal nem outro modal na frente).
  get modalFamiliaAberto(): boolean {
    return !!this.familia.convitePendente() || this.familia.painelAberto() || this.familia.envioAberto()
      || this.mostrandoListaRecebida || this.mostrandoSubstituicao;
  }

  // A escolha da loja (QR do endereço) espera o aviso legal fechar, como o convite da Família.
  get mostrandoEscolhaLoja(): boolean {
    return !!this.loja.pedido() && !this.mostrandoAvisoLegal;
  }

  // "É a mesma pessoa?": depois que a janela do convite fecha (quem aceitou) ou por cima do que
  // estiver aberto (quem convidou, ao saber do aceite).
  get mostrandoSubstituicao(): boolean {
    return !!this.familia.substituicao() && !this.familia.convitePendente() && !this.mostrandoAvisoLegal;
  }

  get mostrandoListaRecebida(): boolean {
    return !!this.familia.listaParaResponder() && !this.mostrandoAvisoLegal && !this.confirmandoLimpeza
      && !this.familia.convitePendente() && !this.familia.painelAberto() && !this.familia.envioAberto();
  }

  // Preços podem ter mudado desde a última vez que o app ficou aberto: confere o carrinho salvo e
  // já deixa os preços das ofertas prontos para o primeiro anúncio.
  ngOnInit(): void {
    this.atualizacao.iniciar();
    if (this.modoAdmin || this.modoPosicao) {
      return;
    }
    const slug = lerLojaDoEndereco();
    if (slug) {
      this.loja.abrirEscolha({ tipo: 'qr', slug });
    }
    // Nome da loja no topo e nas ofertas; a falha aqui não atrapalha o resto do app.
    this.loja.carregar().catch(() => undefined);
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
    if (!this.modoAdmin && !this.modoPosicao && document.visibilityState === 'visible') {
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
