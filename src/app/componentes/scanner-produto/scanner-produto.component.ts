import { AfterViewChecked, Component, ElementRef, HostListener, Input, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from '../../services/produto-api.service';
import { CarrinhoService } from '../../services/carrinho.service';
import { ReconhecimentoVozService } from '../../services/reconhecimento-voz.service';
import { LeitorCameraService } from '../../services/leitor-camera.service';
import { CarrinhoComponent } from '../carrinho/carrinho.component';
import { formatarCentavos } from '../../utils/formatar-moeda';

export type ModoSelecao = 'codigo' | 'voz' | 'camera';

// Um leitor digita o código inteiro em poucos milissegundos; teclas soltas que sobrarem no buffer
// (ex.: leitura interrompida) são descartadas depois deste intervalo para não contaminar a próxima.
const TEMPO_MAX_ENTRE_TECLAS_MS = 1000;

@Component({
  selector: 'app-scanner-produto',
  standalone: true,
  imports: [CarrinhoComponent],
  templateUrl: './scanner-produto.component.html',
  styleUrl: './scanner-produto.component.css'
})
export class ScannerProdutoComponent implements OnDestroy, AfterViewChecked {

  @ViewChild('videoCamera') videoCamera?: ElementRef<HTMLVideoElement>;

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

  private abrindoCamera = false;
  private buscaEmAndamento?: Subscription;
  private limpezaDoBuffer?: ReturnType<typeof setTimeout>;

  constructor(
    private produtoApiService: ProdutoApiService,
    private carrinho: CarrinhoService,
    private voz: ReconhecimentoVozService,
    private camera: LeitorCameraService,
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
    if (this.leitorPausado || this.modo !== 'codigo' || evento.ctrlKey || evento.altKey || evento.metaKey || this.emCampoDeTexto(evento)) {
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
      this.buscarProduto(codigoBarras);
    }
  }

  selecionarModo(modo: ModoSelecao): void {
    if (modo === this.modo) {
      return;
    }

    this.zerarBusca();
    this.modo = modo;
    if (modo === 'camera') {
      // Toda entrada no modo câmera é uma tentativa nova: descarta erro de permissão anterior.
      this.cameraErro = null;
    }
  }

  // A câmera só pode ser aberta depois que o <video> existe no DOM (ver template), então a
  // abertura é tentada a cada verificação da view em vez de junto com selecionarModo().
  ngAfterViewChecked(): void {
    if (
      this.modo !== 'camera' ||
      this.leitorPausado ||
      this.cameraAtiva ||
      this.abrindoCamera ||
      this.cameraErro ||
      !this.cameraSuportada ||
      this.carregando ||
      this.produto ||
      this.candidatos.length > 0
    ) {
      return;
    }

    const video = this.videoCamera?.nativeElement;
    if (!video) {
      return;
    }

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
  }

  // Descarta tudo o que pertence à consulta atual (leitura, voz, resultado), sem tocar no carrinho.
  private zerarBusca(): void {
    this.voz.cancelar();
    this.pararCamera();
    this.buscaEmAndamento?.unsubscribe();
    this.ouvindo = false;
    this.textoOuvido = '';
    this.limparResultado();
    this.carregando = false;
    clearTimeout(this.limpezaDoBuffer);
    this.codigoLido = '';
  }

  // Um toque começa a escutar; outro toque, durante a escuta, encerra e busca o que já foi dito.
  alternarMicrofone(): void {
    if (this.ouvindo) {
      this.voz.parar();
      return;
    }

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

  // Ao adicionar, o produto passa a viver na lista do carrinho: o card de preço some e a
  // lista fica sozinha na tela, pronta para a próxima bipagem.
  adicionarAoCarrinho(): void {
    if (this.produto) {
      this.carrinho.adicionar(this.produto);
      this.produto = null;
    }
  }

  private buscarProduto(codigoBarras: string): void {
    // Uma bipagem nova sempre vence a anterior, mesmo que a resposta antiga ainda não tenha chegado.
    this.buscaEmAndamento?.unsubscribe();

    this.carregando = true;
    this.limparResultado();

    this.buscaEmAndamento = this.produtoApiService.buscarPorCodigoBarras(codigoBarras).subscribe({
      next: (produto) => {
        this.produto = produto;
        this.carregando = false;
      },
      error: (err) => {
        this.mensagemErro = err.status === 404
          ? `Produto não encontrado para o código ${codigoBarras}.`
          : 'Não foi possível consultar o preço. Tente novamente.';
        this.carregando = false;
        if (err.status !== 404) {
          console.error('Erro ao buscar produto:', err);
        }
      },
    });
  }

  private buscarPorDescricao(descricao: string): void {
    this.buscaEmAndamento?.unsubscribe();

    this.carregando = true;
    this.limparResultado();

    this.buscaEmAndamento = this.produtoApiService.buscarPorDescricao(descricao).subscribe({
      next: (produtos) => {
        this.carregando = false;
        if (produtos.length === 0) {
          this.mensagemErro = `Nenhum produto encontrado para "${descricao}". Toque no microfone e tente de novo.`;
        } else if (produtos.length === 1) {
          this.produto = produtos[0];
        } else {
          this.candidatos = produtos;
        }
      },
      error: (err) => {
        this.mensagemErro = 'Não foi possível consultar o preço. Tente novamente.';
        this.carregando = false;
        console.error('Erro ao buscar produto por descrição:', err);
      },
    });
  }

  ngOnDestroy(): void {
    clearTimeout(this.limpezaDoBuffer);
    this.voz.cancelar();
    this.pararCamera();
    this.buscaEmAndamento?.unsubscribe();
  }
}
