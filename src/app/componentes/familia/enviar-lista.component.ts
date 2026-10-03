import { Component, EventEmitter, HostListener, Output, computed, signal } from '@angular/core';
import { ContatoFamilia, ErroFamilia, FamiliaService, juntarNomes } from '../../services/familia.service';
import { ConteudoLista, PreListaService } from '../../services/pre-lista.service';
import { BANNER_ENVIO_LISTA, BannerTelaCheiaComponent } from '../banner-tela-cheia/banner-tela-cheia.component';

interface LinhaEnvio {
  // "i:<id>" = item genérico; "p:<código>" = produto de oferta.
  chave: string;
  nome: string;
  quantidade: number;
}

// "Enviar lista" da pré-lista: os itens ainda não riscados aparecem marcados (dá para desmarcar o
// que não deve ir) e escolhe-se para quem — todas as pessoas já vêm marcadas (decisão do usuário:
// no iPhone o app e o Safari são duas pessoas, e a lista deve chegar nas duas). Os itens que forem
// saem desta lista (decisão do usuário).
@Component({
  selector: 'app-enviar-lista',
  standalone: true,
  imports: [BannerTelaCheiaComponent],
  templateUrl: './enviar-lista.component.html',
  styleUrl: './familia.css'
})
export class EnviarListaComponent {

  @Output() fechar = new EventEmitter<void>();

  readonly enviando = signal(false);
  // Banner do envio (espaço publicitário): a lista vai de verdade enquanto a barra enche; o
  // resultado (aviso ou erro) só aparece quando o banner fecha.
  readonly bannerEnvio = BANNER_ENVIO_LISTA;
  readonly mostrandoBanner = signal(false);
  private fimDoBanner?: () => void;
  readonly erro = signal<string | null>(null);

  readonly linhas = computed<LinhaEnvio[]>(() => {
    const { itens, produtos } = this.preLista.paraEnviar();
    return [
      ...Object.entries(itens).map(([id, quantidade]) => ({
        chave: `i:${id}`,
        nome: this.preLista.nomeDoItem(Number(id)) ?? 'Item da pré-lista',
        quantidade,
      })),
      ...Object.entries(produtos).map(([codigo, produto]) => ({
        chave: `p:${codigo}`,
        nome: produto.descricao,
        quantidade: produto.quantidade,
      })),
    ].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  // Desmarcados pelo cliente (o padrão é enviar tudo).
  readonly desmarcados = signal<Set<string>>(new Set());

  readonly totalEscolhidos = computed(() =>
    this.linhas().filter(linha => !this.desmarcados().has(linha.chave)).length);

  // Pessoas desmarcadas (o padrão é enviar para todas).
  readonly pessoasDesmarcadas = signal<Set<number>>(new Set());

  readonly destinatarios = computed<ContatoFamilia[]>(() =>
    this.familia.contatos().filter(contato => !this.pessoasDesmarcadas().has(contato.id)));

  readonly nomesDestinatarios = computed(() => juntarNomes(this.destinatarios().map(contato => contato.apelido)));

  // Consulta na hora: quem acabou de ter o convite aceito não espera o ciclo de 30 s para ver a pessoa.
  constructor(public familia: FamiliaService, public preLista: PreListaService) {
    this.familia.atualizar();
  }

  alternar(chave: string): void {
    this.desmarcados.update(desmarcados => {
      const novo = new Set(desmarcados);
      if (!novo.delete(chave)) {
        novo.add(chave);
      }
      return novo;
    });
  }

  alternarPessoa(id: number): void {
    this.pessoasDesmarcadas.update(desmarcadas => {
      const novo = new Set(desmarcadas);
      if (!novo.delete(id)) {
        novo.add(id);
      }
      return novo;
    });
  }

  async enviar(): Promise<void> {
    this.enviando.set(true);
    this.erro.set(null);
    this.mostrandoBanner.set(true);
    const banner = new Promise<void>(fim => this.fimDoBanner = fim);
    const envio = this.familia.enviarLista(this.destinatarios(), this.escolhidos());
    // Evita "unhandled rejection" enquanto o banner ainda está na tela.
    envio.catch(() => undefined);
    await banner;
    this.mostrandoBanner.set(false);
    try {
      this.familia.mostrarAviso(await envio);
      this.fechar.emit();
    } catch (erro) {
      this.erro.set(erro instanceof ErroFamilia ? erro.message : 'Algo deu errado. Tente de novo.');
      // Ligação desfeita pelo outro lado: some da lista na próxima consulta.
      this.familia.atualizar();
    } finally {
      this.enviando.set(false);
    }
  }

  aoTerminarBanner(): void {
    this.fimDoBanner?.();
  }

  convidar(): void {
    this.fechar.emit();
    this.familia.painelAberto.set(true);
  }

  @HostListener('keydown.escape')
  aoPressionarEsc(): void {
    if (!this.mostrandoBanner()) {
      this.fechar.emit();
    }
  }

  private escolhidos(): ConteudoLista {
    const { itens, produtos } = this.preLista.paraEnviar();
    const desmarcados = this.desmarcados();
    return {
      itens: Object.fromEntries(Object.entries(itens).filter(([id]) => !desmarcados.has(`i:${id}`))),
      produtos: Object.fromEntries(Object.entries(produtos).filter(([codigo]) => !desmarcados.has(`p:${codigo}`))),
    };
  }
}
