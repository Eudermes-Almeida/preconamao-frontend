import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { Subscription } from 'rxjs';
import { ProdutoApiService, ProdutoDTO } from '../../services/produto-api.service';
import { CarrinhoService } from '../../services/carrinho.service';
import { CarrinhoComponent } from '../carrinho/carrinho.component';
import { formatarCentavos } from '../../utils/formatar-moeda';

@Component({
  selector: 'app-scanner-produto',
  standalone: true,
  imports: [CarrinhoComponent],
  templateUrl: './scanner-produto.component.html',
  styleUrl: './scanner-produto.component.css'
})
export class ScannerProdutoComponent implements AfterViewInit, OnDestroy {

  @ViewChild('campoCodigo') campoCodigoEl?: ElementRef<HTMLInputElement>;

  produto: ProdutoDTO | null = null;
  mensagemErro: string | null = null;
  carregando = false;

  private buscaEmAndamento?: Subscription;

  constructor(
    private produtoApiService: ProdutoApiService,
    private carrinho: CarrinhoService,
  ) {}

  get precoFormatado(): string {
    return this.produto ? formatarCentavos(this.produto.precoCentavos) : '';
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
  devolverFoco(): void {
    setTimeout(() => this.focarCampo(), 0);
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
    this.produto = null;
    this.mensagemErro = null;

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

  ngOnDestroy(): void {
    this.buscaEmAndamento?.unsubscribe();
  }
}
