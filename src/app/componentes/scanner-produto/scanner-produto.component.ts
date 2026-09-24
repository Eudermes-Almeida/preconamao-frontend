import { Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ProdutoApiService, ProdutoDTO, LocalizacaoDTO } from '../../services/produto-api.service';
import { CarrinhoService } from '../../services/carrinho.service';
import { ReconhecimentoVozService } from '../../services/reconhecimento-voz.service';
import { LeitorCameraService } from '../../services/leitor-camera.service';
import { SomService } from '../../services/som.service';
import { PublicidadeService } from '../../services/publicidade.service';
import { AudioPrecoService } from '../../services/audio-preco.service';
import { CabecalhoComponent } from '../cabecalho/cabecalho.component';
import { CarrinhoComponent } from '../carrinho/carrinho.component';
import { MapaLojaComponent } from '../mapa-loja/mapa-loja.component';
import { AvisoConferenciaModalComponent } from '../aviso-conferencia-modal/aviso-conferencia-modal.component';
import { formatarCentavos } from '../../utils/formatar-moeda';

export type ModoSelecao = 'codigo' | 'voz' | 'localizador';

// Um leitor digita o código inteiro em poucos milissegundos; teclas soltas que sobrarem no buffer
// (ex.: leitura interrompida) são descartadas depois deste intervalo para não contaminar a próxima.
const TEMPO_MAX_ENTRE_TECLAS_MS = 1000;

// Duração fixa do "spinner fake" de publicidade entre a leitura e o resultado. Mantido igual à
// animação da barra em scanner-produto.component.css (animation: preencher-publicidade).
const DURACAO_PUBLICIDADE_MS = 4000;

@Component({
  selector: 'app-scanner-produto',
  standalone: true,
  imports: [CabecalhoComponent, CarrinhoComponent, MapaLojaComponent, AvisoConferenciaModalComponent],
  templateUrl: './scanner-produto.component.html',
  styleUrl: './scanner-produto.component.css'
})
export class ScannerProdutoComponent implements OnDestroy {

  @ViewChild('videoCamera') videoCamera?: ElementRef<HTMLVideoElement>;

  // Tela cheia do localizador (modo 3) tem seu próprio header (fica por cima de tudo, ver
  // .localizador-tela-cheia); repassa o toque em "Limpar" pro AppComponent, mesmo fluxo do header normal.
  @Output() limpar = new EventEmitter<void>();

  private _leitorPausado = false;

  // Enquanto um modal está aberto por cima, bipagens não podem consultar produtos por trás dele;
  // a câmera, pelo mesmo motivo, é desligada enquanto o modal estiver aberto.
  @Input()
  set leitorPausado(valor: boolean) {
    const estavaPausado = this._leitorPausado;
    this._leitorPausado = valor;
    if (valor && !estavaPausado) {
      this.pararCamera();
    }
  }

  get leitorPausado(): boolean {
    return this._leitorPausado;
  }

  modo: ModoSelecao = 'codigo';
  codigoLido = '';
  produto: ProdutoDTO | null = null;
  candidatos: ProdutoDTO[] = [];
  textoOuvido = '';
  ouvindo = false;
  mensagemErro: string | null = null;
  carregando = false;

  cameraAtiva = false;
  cameraErro: string | null = null;

  exibindoPublicidade = false;
  imagemPublicidade: string | null = null;
  // Código de barras do produto anunciado (tirado do nome do arquivo da propaganda).
  codigoPublicidade: string | null = null;
  // Pausa do anúncio (botão sobre a imagem): congela o tempo restante e a barra de progresso,
  // para o cliente olhar os detalhes da oferta; o play retoma de onde parou.
  publicidadePausada = false;
  private fimPublicidadeEm = 0;
  private restantePublicidadeMs = 0;

  abrindoCamera = false;
  private buscaEmAndamento?: Subscription;
  private limpezaDoBuffer?: ReturnType<typeof setTimeout>;
  private timeoutPublicidade?: ReturnType<typeof setTimeout>;
  // Resultado já chegado da API, mas represado até a publicidade completar os 4 segundos.
  private resultadoPendente: (() => void) | null = null;

  // Aviso de conferência: aparece só na primeira vez que a lista de candidatos surge na compra
  // (modos 1/2 — no localizador ninguém está comprando). Volta a valer depois do "Limpar tudo",
  // que é o começo de uma compra nova.
  mostrandoAvisoConferencia = false;
  private avisoConferenciaExibido = false;

  // Modal "Valor Total" do carrinho aberto (ver CarrinhoComponent.valorTotalAberto).
  valorTotalAberto = false;

  constructor(
    private produtoApiService: ProdutoApiService,
    private carrinho: CarrinhoService,
    private voz: ReconhecimentoVozService,
    private camera: LeitorCameraService,
    private som: SomService,
    public publicidade: PublicidadeService,
    public audioPreco: AudioPrecoService,
  ) {}

  get vozSuportada(): boolean {
    return this.voz.suportado;
  }

  get cameraSuportada(): boolean {
    return this.camera.suportado;
  }

  get precoFormatado(): string {
    return this.produto ? formatarCentavos(this.produto.precoCentavos) : '';
  }

  formatarPreco(centavos: number): string {
    return formatarCentavos(centavos);
  }

  get temItensNoCarrinho(): boolean {
    return this.carrinho.itens().length > 0;
  }

  get quantidadeNoCarrinho(): number {
    return this.produto ? this.carrinho.quantidadeDe(this.produto.codigoBarras) : 0;
  }

  // O leitor USB/Bluetooth emula um teclado: "digita" o código e finaliza com Enter. Em vez de
  // depender de um <input> focado (que abre o teclado virtual no celular e perde dígitos quando o
  // foco sai do campo), as teclas são capturadas no documento inteiro: não há campo nem foco a manter.
  @HostListener('document:keydown', ['$event'])
  aoPressionarTecla(evento: KeyboardEvent): void {
    if (this.leitorPausado || this.mostrandoAvisoConferencia || this.valorTotalAberto || this.modo !== 'codigo' || this.exibindoPublicidade || evento.ctrlKey || evento.altKey || evento.metaKey || this.emCampoDeTexto(evento)) {
      return;
    }

    if (evento.key === 'Enter') {
      if (this.codigoLido) {
        // Sem isto, um botão que esteja com foco seria "clicado" pelo Enter do leitor.
        evento.preventDefault();
        this.lerCodigo();
      }
    } else if (evento.key === 'Backspace') {
      this.codigoLido = this.codigoLido.slice(0, -1);
    } else if (evento.key.length === 1 && evento.key !== ' ') {
      evento.preventDefault();
      this.codigoLido += evento.key;
      this.reiniciarLimpezaDoBuffer();
    }
  }

  private emCampoDeTexto(evento: KeyboardEvent): boolean {
    const alvo = evento.target as HTMLElement | null;
    return !!alvo && (['INPUT', 'TEXTAREA', 'SELECT'].includes(alvo.tagName) || alvo.isContentEditable);
  }

  private reiniciarLimpezaDoBuffer(): void {
    clearTimeout(this.limpezaDoBuffer);
    this.limpezaDoBuffer = setTimeout(() => this.codigoLido = '', TEMPO_MAX_ENTRE_TECLAS_MS);
  }

  private lerCodigo(): void {
    const codigoBarras = this.codigoLido.trim();
    clearTimeout(this.limpezaDoBuffer);
    this.codigoLido = '';

    if (codigoBarras) {
      // A tecla Enter em si já é o gesto do usuário; libera o som antes do bipe em buscarProduto(),
      // e a fala do preço/localização (iPhone exige isto dentro do toque — ver AudioPrecoService).
      this.som.destravar();
      this.audioPreco.destravar();
      this.buscarProduto(codigoBarras);
    }
  }

  selecionarModo(modo: ModoSelecao): void {
    if (modo === this.modo) {
      return;
    }

    this.zerarBusca();
    this.modo = modo;
  }

  // Um toque liga a câmera e ela procura sozinha até achar um código (ou até um novo toque
  // cancelar); ao achar, já se desliga e mostra o resultado — para ler outro código, o usuário
  // toca de novo. Mesmo padrão de alternarMicrofone(), só que a "escuta" aqui é visual.
  alternarCamera(): void {
    if (this.cameraAtiva) {
      this.pararCamera();
      return;
    }

    const video = this.videoCamera?.nativeElement;
    if (!video || this.abrindoCamera || this.exibindoPublicidade) {
      return;
    }

    // Precisa vir antes de qualquer coisa assíncrona (getUserMedia, requestAnimationFrame) para
    // valer como o gesto do usuário que libera o som no navegador — ver SomService.destravar().
    this.som.destravar();
    this.audioPreco.destravar();

    this.cameraErro = null;
    this.limparResultado();
    this.abrindoCamera = true;

    this.camera.iniciar(video, {
      aoIniciar: () => {
        this.abrindoCamera = false;
        this.cameraAtiva = true;
      },
      aoFalhar: (mensagem) => {
        this.abrindoCamera = false;
        this.cameraErro = mensagem;
      },
      aoLer: (codigoBarras) => {
        this.abrindoCamera = false;
        this.cameraAtiva = false;
        this.buscarProduto(codigoBarras);
      },
    });
  }

  private pararCamera(): void {
    this.camera.parar();
    this.cameraAtiva = false;
    this.abrindoCamera = false;
    if (this.videoCamera) {
      this.videoCamera.nativeElement.srcObject = null;
    }
  }

  // Volta a tela ao estado de quem acabou de abrir o app: carrinho vazio, modo código de barras,
  // sem produto, candidatos, erro nem escuta em andamento.
  reiniciar(): void {
    this.zerarBusca();
    this.modo = 'codigo';
    this.carrinho.limpar();
    this.avisoConferenciaExibido = false;
  }

  // Descarta tudo o que pertence à consulta atual (leitura, voz, resultado), sem tocar no carrinho.
  private zerarBusca(): void {
    this.voz.cancelar();
    this.pararCamera();
    this.buscaEmAndamento?.unsubscribe();
    this.audioPreco.cancelar();
    this.ouvindo = false;
    this.textoOuvido = '';
    this.limparResultado();
    this.carregando = false;
    clearTimeout(this.limpezaDoBuffer);
    this.codigoLido = '';
    clearTimeout(this.timeoutPublicidade);
    this.exibindoPublicidade = false;
    this.publicidadePausada = false;
    this.imagemPublicidade = null;
    this.codigoPublicidade = null;
    this.resultadoPendente = null;
    this.mostrandoAvisoConferencia = false;
  }

  // Um toque começa a escutar; outro toque, durante a escuta, encerra e busca o que já foi dito.
  alternarMicrofone(): void {
    if (this.ouvindo) {
      this.voz.parar();
      return;
    }

    if (this.exibindoPublicidade) {
      return;
    }

    // O resultado da busca por voz só chega bem depois deste toque (fala do usuário + resposta da
    // rede) — precisa destravar aqui, não lá na frente, senão o iPhone bloqueia a fala do preço.
    this.audioPreco.destravar();

    this.buscaEmAndamento?.unsubscribe();
    this.carregando = false;
    this.textoOuvido = '';
    this.limparResultado();
    this.ouvindo = true;

    this.voz.iniciar({
      aoOuvir: (texto) => this.textoOuvido = texto,
      aoTerminar: (texto, erro) => this.aoTerminarEscuta(texto, erro),
    });
  }

  escolherCandidato(candidato: ProdutoDTO): void {
    this.produto = candidato;
    this.candidatos = [];
    this.falarProdutoSeAtivo(candidato);
  }

  private exibirAvisoConferenciaNaPrimeiraVez(): void {
    if (this.avisoConferenciaExibido || this.modo === 'localizador') {
      return;
    }
    this.avisoConferenciaExibido = true;
    this.mostrandoAvisoConferencia = true;
  }

  fecharAvisoConferencia(): void {
    this.mostrandoAvisoConferencia = false;
  }

  // Toque no botão "Ativar emitir áudio do preço do produto". Também aproveita este toque para
  // destravar a fala no iPhone (ver AudioPrecoService.destravar) — é o gesto mais óbvio de todos
  // para isso, além dos outros pontos (câmera, leitor, microfone).
  alternarAudioPreco(): void {
    this.audioPreco.alternar();
    this.audioPreco.destravar();
  }

  // Fala nome e preço no card principal (modos 1 e 2); no localizador (modo 3), fala nome e
  // localização, acompanhando o que a tela cheia do localizador está exibindo.
  private falarProdutoSeAtivo(produto: ProdutoDTO): void {
    if (this.modo === 'localizador') {
      this.falarLocalizacaoSeAtiva(produto);
      return;
    }
    this.audioPreco.falar(produto.descricao, this.formatarPreco(produto.precoCentavos));
  }

  // Mesmo texto mostrado em .localizacao-texto no template, ou o aviso de "sem prateleira mapeada"
  // quando o produto ainda não tem localizacao.
  private falarLocalizacaoSeAtiva(produto: ProdutoDTO): void {
    if (!produto.localizacao) {
      this.audioPreco.falar(produto.descricao, 'Ainda não sei em qual prateleira este produto fica.');
      return;
    }
    this.audioPreco.falar(produto.descricao, this.textoLocalizacaoFalado(produto.localizacao));
  }

  private textoLocalizacaoFalado(localizacao: LocalizacaoDTO): string {
    if (localizacao.lado === 'CENTRO') {
      return `Setor ${localizacao.nomeSetor}`;
    }
    const lado = localizacao.lado === 'ESQUERDA' ? 'esquerdo' : 'direito';
    return `Setor ${localizacao.nomeSetor}, rua ${localizacao.rua}, quarteirão ${localizacao.quarteirao}, lado ${lado}`;
  }

  // Botão "Buscar outro produto" da tela cheia do localizador: volta ao microfone, sem sair
  // do modo nem tocar no carrinho.
  reiniciarLocalizador(): void {
    this.textoOuvido = '';
    this.limparResultado();
  }

  private aoTerminarEscuta(texto: string, erro: string | null): void {
    this.ouvindo = false;

    if (erro) {
      this.mensagemErro = erro;
    } else if (!texto) {
      this.mensagemErro = 'Não ouvi nada. Toque no microfone e fale de novo.';
    } else {
      this.textoOuvido = texto;
      this.buscarPorDescricao(texto);
    }
  }

  private limparResultado(): void {
    this.produto = null;
    this.candidatos = [];
    this.mensagemErro = null;
  }

  alternarPublicidade(): void {
    this.publicidade.alternar();
  }

  // Chamado ao disparar toda consulta (código ou voz): se a publicidade estiver ligada, abre o
  // "spinner fake" por 4 segundos com uma imagem sorteada, no lugar do "Consultando...".
  private iniciarPublicidadeSeAtiva(): void {
    if (!this.publicidade.ativa) {
      return;
    }

    // Uma bipagem nova sempre vence a anterior: descarta um resultado represado que não coube
    // a tempo do anúncio anterior (não deveria acontecer, já que os três gatilhos de leitura
    // ficam bloqueados enquanto a publicidade está em tela — ver os "if (this.exibindoPublicidade)".
    this.resultadoPendente = null;
    this.exibindoPublicidade = true;
    const propaganda = this.publicidade.sortear();
    this.imagemPublicidade = propaganda.imagem;
    this.codigoPublicidade = propaganda.codigoBarras;
    this.publicidadePausada = false;
    this.agendarFimPublicidade(DURACAO_PUBLICIDADE_MS);
  }

  private agendarFimPublicidade(ms: number): void {
    clearTimeout(this.timeoutPublicidade);
    this.fimPublicidadeEm = Date.now() + ms;
    this.timeoutPublicidade = setTimeout(() => this.finalizarPublicidade(), ms);
  }

  alternarPausaPublicidade(): void {
    if (this.publicidadePausada) {
      this.publicidadePausada = false;
      this.agendarFimPublicidade(this.restantePublicidadeMs);
      return;
    }
    clearTimeout(this.timeoutPublicidade);
    this.restantePublicidadeMs = Math.max(0, this.fimPublicidadeEm - Date.now());
    this.publicidadePausada = true;
  }

  // Usado nos dois `next`/`error` das buscas: aplica o resultado na hora se não houver publicidade
  // em andamento, ou represa até ela terminar — para o card não "furar" o anúncio.
  private revelarResultado(aplicar: () => void): void {
    this.carregando = false;
    if (this.exibindoPublicidade) {
      this.resultadoPendente = aplicar;
      return;
    }
    aplicar();
  }

  private finalizarPublicidade(): void {
    this.exibindoPublicidade = false;
    this.publicidadePausada = false;
    this.imagemPublicidade = null;
    this.codigoPublicidade = null;
    const aplicar = this.resultadoPendente;
    this.resultadoPendente = null;
    aplicar?.();
  }

  // Ao adicionar, o produto passa a viver na lista do carrinho: o card de preço some e a
  // lista fica sozinha na tela, pronta para a próxima bipagem.
  adicionarAoCarrinho(): void {
    if (this.produto) {
      this.carrinho.adicionar(this.produto);
      this.produto = null;
    }
  }

  // "X" do card de preço: descarta a consulta sem adicionar ao carrinho (pedido do usuário —
  // antes o card só saía de cena adicionando o produto ou fazendo outra leitura).
  fecharCard(): void {
    this.audioPreco.cancelar();
    this.produto = null;
    this.textoOuvido = '';
  }

  // Botão "Localizar Oferta" do anúncio (funciona também com o anúncio pausado): abandona o que
  // estiver em andamento — consulta, anúncio, resultado represado, câmera/microfone — e abre o
  // localizador (modo 3) já com o produto anunciado, sem passar por outro anúncio.
  localizarProdutoDaPublicidade(): void {
    const codigoBarras = this.codigoPublicidade;
    if (!codigoBarras) {
      return;
    }

    // O toque no botão é o gesto que libera a fala da localização no iPhone (ver AudioPrecoService).
    this.audioPreco.destravar();

    this.zerarBusca();
    this.modo = 'localizador';
    this.carregando = true;

    this.buscaEmAndamento = this.produtoApiService.buscarPorCodigoBarras(codigoBarras).subscribe({
      next: (produto) => {
        this.carregando = false;
        this.produto = produto;
        this.falarLocalizacaoSeAtiva(produto);
      },
      error: (err) => {
        this.carregando = false;
        if (err.status !== 404) {
          console.error('Erro ao localizar produto da publicidade:', err);
        }
        this.mensagemErro = err.status === 404
          ? `Produto do anúncio não encontrado (código ${codigoBarras}).`
          : 'Não foi possível localizar o produto. Tente novamente.';
      },
    });
  }

  private buscarProduto(codigoBarras: string): void {
    // Uma bipagem nova sempre vence a anterior, mesmo que a resposta antiga ainda não tenha chegado.
    this.buscaEmAndamento?.unsubscribe();
    this.som.tocarBip();

    this.carregando = true;
    this.limparResultado();
    this.iniciarPublicidadeSeAtiva();

    this.buscaEmAndamento = this.produtoApiService.buscarPorCodigoBarras(codigoBarras).subscribe({
      next: (produto) => this.revelarResultado(() => {
        this.produto = produto;
        this.falarProdutoSeAtivo(produto);
      }),
      error: (err) => {
        const mensagem = err.status === 404
          ? `Produto não encontrado para o código ${codigoBarras}.`
          : 'Não foi possível consultar o preço. Tente novamente.';
        if (err.status !== 404) {
          console.error('Erro ao buscar produto:', err);
        }
        this.revelarResultado(() => {
          this.mensagemErro = mensagem;
        });
      },
    });
  }

  private buscarPorDescricao(descricao: string): void {
    this.buscaEmAndamento?.unsubscribe();

    this.carregando = true;
    this.limparResultado();
    this.iniciarPublicidadeSeAtiva();

    this.buscaEmAndamento = this.produtoApiService.buscarPorDescricao(descricao).subscribe({
      next: (produtos) => this.revelarResultado(() => {
        if (produtos.length === 0) {
          this.mensagemErro = `Nenhum produto encontrado para "${descricao}". Toque no microfone e tente de novo.`;
        } else if (produtos.length === 1) {
          this.produto = produtos[0];
          this.falarProdutoSeAtivo(produtos[0]);
        } else {
          this.candidatos = produtos;
          this.exibirAvisoConferenciaNaPrimeiraVez();
        }
      }),
      error: (err) => {
        console.error('Erro ao buscar produto por descrição:', err);
        this.revelarResultado(() => {
          this.mensagemErro = 'Não foi possível consultar o preço. Tente novamente.';
        });
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.limpezaDoBuffer);
    clearTimeout(this.timeoutPublicidade);
    this.voz.cancelar();
    this.pararCamera();
    this.audioPreco.cancelar();
    this.buscaEmAndamento?.unsubscribe();
  }
}
