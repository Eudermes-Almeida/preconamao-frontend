import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from '../../services/produto-api.service';
import { CarrinhoService } from '../../services/carrinho.service';
import { ReconhecimentoVozService } from '../../services/reconhecimento-voz.service';
import { CarrinhoComponent } from '../carrinho/carrinho.component';
import { formatarCentavos } from '../../utils/formatar-moeda';

export type ModoSelecao = 'codigo' | 'voz';

@Component({
  selector: 'app-scanner-produto',
  standalone: true,
  imports: [CarrinhoComponent],
  templateUrl: './scanner-produto.component.html',
  styleUrl: './scanner-produto.component.css'
})
export class ScannerProdutoComponent implements AfterViewInit, OnDestroy {

  @ViewChild('campoCodigo') campoCodigoEl?: ElementRef<HTMLInputElement>;

  modo: ModoSelecao = 'codigo';
  produto: ProdutoDTO | null = null;
  candidatos: ProdutoDTO[] = [];
  textoOuvido = '';
  ouvindo = false;
  mensagemErro: string | null = null;
  carregando = false;

  private buscaEmAndamento?: Subscription;

  constructor(
    private produtoApiService: ProdutoApiService,
    private carrinho: CarrinhoService,
    private voz: ReconhecimentoVozService,
  ) {}

  get vozSuportada(): boolean {
    return this.voz.suportado;
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

  ngAfterViewInit(): void {
    this.focarCampo();
  }

  // O leitor USB emula um teclado: digita o código e finaliza com Enter. Se o campo perder
  // o foco, a próxima bipagem se perde — por isso o foco é sempre devolvido ao campo.
  focarCampo(): void {
    this.campoCodigoEl?.nativeElement.focus();
  }

  // Chamado no blur: adia um tick para não brigar com o clique que causou a perda de foco.
  // Só vale no modo código de barras; no modo voz o campo nem existe.
  devolverFoco(): void {
    setTimeout(() => {
      if (this.modo === 'codigo') {
        this.focarCampo();
      }
    }, 0);
  }

  selecionarModo(modo: ModoSelecao): void {
    if (modo === this.modo) {
      return;
    }

    this.voz.cancelar();
    this.buscaEmAndamento?.unsubscribe();
    this.ouvindo = false;
    this.textoOuvido = '';
    this.limparResultado();
    this.carregando = false;
    this.modo = modo;

    // O campo do leitor é recriado ao voltar para o modo código de barras; espera ele existir.
    if (modo === 'codigo') {
      setTimeout(() => this.focarCampo(), 0);
    }
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

  // Impede que o botão roube o foco do campo do leitor, o que faria perder dígitos (ver CarrinhoComponent).
  manterFocoNoCampo(evento: MouseEvent): void {
    evento.preventDefault();
  }

  lerCodigo(campo: HTMLInputElement): void {
    const codigoBarras = campo.value.trim();
    campo.value = '';

    if (!codigoBarras) {
      return;
    }

    this.buscarProduto(codigoBarras);
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
    this.voz.cancelar();
    this.buscaEmAndamento?.unsubscribe();
  }
}
