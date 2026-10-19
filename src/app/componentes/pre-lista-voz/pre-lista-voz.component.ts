import { Component, OnDestroy, computed, signal } from '@angular/core';
import { PreListaService } from '../../services/pre-lista.service';
import { PreListaItemDTO } from '../../services/produto-api.service';
import { ReconhecimentoVozService } from '../../services/reconhecimento-voz.service';
import { FalaInterpretada, interpretarFala, itensDaFala, lembreteDaFala } from '../../utils/fala-pre-lista';
import { EditarLembreteComponent } from '../editar-lembrete/editar-lembrete.component';

// O que acabou de entrar na lista: o cartão "✓" com − / + mexe direto na pré-lista.
interface Adicionado {
  id: number;
  nome: string;
}

// Visão "Falar Lista" da pré-lista: UM item por vez, igual à busca de preço por voz. O cliente
// fala ("arroz codil 5 quilos"), o texto aparece enquanto fala, e ao parar vêm as opções: os
// MESMOS itens das outras visões (Buscar, De A a Z, Por categoria). Não consulta produtos nem
// preços da loja — a lista é feita em casa, sem loja escolhida (decisão do usuário, 16/10). A
// marca e a medida faladas viram o lembrete da linha ("Codil - 5 kg"). O toque numa opção já põe
// na lista (somando com o que havia); "Falar mais um item da lista" abre o microfone para o próximo.
// O cartão "✓" também tem "Inserir lembrete" (mesma janela do ✏️ das outras visões), para quem
// falou só o produto não precisar ir a "Minha lista" depois (pedido do usuário, 19/10).
@Component({
  selector: 'app-pre-lista-voz',
  standalone: true,
  imports: [EditarLembreteComponent],
  templateUrl: './pre-lista-voz.component.html',
  styleUrl: './pre-lista-voz.component.css'
})
export class PreListaVozComponent implements OnDestroy {

  readonly ouvindo = signal(false);
  readonly textoOuvido = signal('');
  readonly mensagemErro = signal<string | null>(null);
  readonly fala = signal<FalaInterpretada | null>(null);
  readonly opcoes = signal<PreListaItemDTO[]>([]);
  readonly adicionado = signal<Adicionado | null>(null);
  readonly editandoLembrete = signal(false);

  // Lembrete do item mais provável, mostrado acima das opções.
  readonly lembreteFalado = computed(() => {
    const fala = this.fala();
    const [primeiro] = this.opcoes();
    return fala && primeiro ? lembreteDaFala(fala, primeiro) : null;
  });

  // Quantidade e lembrete da linha que acabou de entrar (já somados ao que havia na lista).
  readonly linhaAdicionada = computed(() => {
    const adicionado = this.adicionado();
    if (!adicionado) {
      return null;
    }
    return {
      ...adicionado,
      quantidade: this.preLista.situacao(adicionado.id).planejado,
      lembrete: this.preLista.lembrete(adicionado.id),
    };
  });

  constructor(
    public preLista: PreListaService,
    private voz: ReconhecimentoVozService,
  ) {}

  get vozSuportada(): boolean {
    return this.voz.suportado;
  }

  ngOnDestroy(): void {
    this.voz.cancelar();
  }

  // Um toque começa a escutar; outro toque, durante a escuta, encerra e busca o que já foi dito.
  alternarMicrofone(): void {
    if (this.ouvindo()) {
      this.voz.parar();
      return;
    }
    this.limpar();
    this.ouvindo.set(true);
    this.voz.iniciar({
      aoOuvir: (texto) => this.textoOuvido.set(texto),
      aoTerminar: (texto, erro) => this.aoTerminarEscuta(texto, erro),
    });
  }

  escolher(item: PreListaItemDTO): void {
    const fala = this.fala();
    this.preLista.adicionarFalado(item.id, fala?.quantidade ?? 1, fala ? lembreteDaFala(fala, item) : null);
    this.opcoes.set([]);
    this.adicionado.set({ id: item.id, nome: item.nome });
  }

  incrementar(id: number): void {
    this.preLista.incrementar(id);
  }

  decrementar(id: number): void {
    this.preLista.decrementar(id);
  }

  salvarLembrete(id: number, texto: string): void {
    this.preLista.definirLembrete(id, texto);
    this.editandoLembrete.set(false);
  }

  // "Falar mais um item da lista": já abre o microfone (um toque só, como pedido).
  falarMais(): void {
    this.alternarMicrofone();
  }

  private limpar(): void {
    this.textoOuvido.set('');
    this.mensagemErro.set(null);
    this.fala.set(null);
    this.opcoes.set([]);
    this.adicionado.set(null);
    this.editandoLembrete.set(false);
  }

  // Mesmas mensagens da busca de preço por voz.
  private aoTerminarEscuta(texto: string, erro: string | null): void {
    this.ouvindo.set(false);
    if (erro) {
      this.mensagemErro.set(erro);
    } else if (!texto) {
      this.mensagemErro.set('Não ouvi nada. Toque no microfone e fale de novo.');
    } else {
      this.textoOuvido.set(texto);
      this.buscar(interpretarFala(texto));
    }
  }

  private buscar(fala: FalaInterpretada): void {
    this.fala.set(fala);
    const itens = (this.preLista.catalogo() ?? []).flatMap(categoria => categoria.itens);
    const opcoes = itensDaFala(fala.produto, itens);
    this.opcoes.set(opcoes);
    if (opcoes.length === 0) {
      // Só a marca ("comfort", "coca-cola") não diz qual item é.
      this.mensagemErro.set(`Não encontrei "${fala.produto}" na pré-lista. Fale também o tipo do produto `
        + '(ex.: amaciante comfort). Toque no microfone e tente de novo.');
    }
  }
}
