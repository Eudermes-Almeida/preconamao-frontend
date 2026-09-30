import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { OFERTAS, OfertasService } from '../../services/ofertas.service';
import { EventoRecenteDTO, RelatorioApiService, RelatorioMidiasDTO, RelatorioOfertaDTO } from '../../services/relatorio-api.service';
import { VERSAO_APP } from '../../versao';
import { ModalConfirmacaoComponent } from '../modal-confirmacao/modal-confirmacao.component';

export type Periodo = 'hoje' | '7dias' | '30dias';

// Uma linha da tabela: a oferta com os números do período (zerados quando não houve evento).
export interface LinhaOferta {
  imagem: string | null;
  dados: RelatorioOfertaDTO;
}

// A chave fica só neste navegador; "Trocar chave" apaga.
const CHAVE_STORAGE = 'preconamao.admin.chaveRelatorio';

const ROTULO_TIPO: Record<EventoRecenteDTO['tipo'], string> = {
  EXIBICAO: 'Exibição',
  FAVORITAR: 'Favoritou',
  DESFAVORITAR: 'Desfavoritou',
  LOCALIZAR: 'Localizar produto',
  PRE_LISTA: 'Incluiu na pré-lista',
};

// Aba administrativa (relatório de mídias). Só abre em /admin num computador (ver AppComponent);
// sem login: a API exige a chave de relatório da loja, pedida uma vez e lembrada neste navegador.
@Component({
  selector: 'app-painel-admin',
  standalone: true,
  imports: [DatePipe, ModalConfirmacaoComponent],
  templateUrl: './painel-admin.component.html',
  styleUrl: './painel-admin.component.css'
})
export class PainelAdminComponent implements OnInit {

  readonly versaoApp = VERSAO_APP;
  readonly ofertasLista = OFERTAS;

  readonly periodos: readonly { id: Periodo; rotulo: string }[] = [
    { id: 'hoje', rotulo: 'Hoje' },
    { id: '7dias', rotulo: 'Últimos 7 dias' },
    { id: '30dias', rotulo: 'Últimos 30 dias' },
  ];
  readonly periodo = signal<Periodo>('7dias');
  // '' = todas as ofertas.
  readonly filtroOferta = signal<string>('');

  readonly chave = signal<string>(this.lerChave());
  readonly relatorio = signal<RelatorioMidiasDTO | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly atualizadoEm = signal<Date | null>(null);
  readonly confirmandoLimpeza = signal(false);

  // Todas as ofertas da loja (mesmo sem evento) + qualquer código com evento que não esteja mais
  // na lista de ofertas.
  readonly linhas = computed<LinhaOferta[]>(() => {
    const porCodigo = new Map((this.relatorio()?.ofertas ?? []).map(dados => [dados.codigoBarras, dados]));
    const linhas: LinhaOferta[] = OFERTAS.map(oferta => ({
      imagem: oferta.imagem,
      dados: porCodigo.get(oferta.codigoBarras) ?? this.zerada(oferta.codigoBarras),
    }));
    const naLista = new Set(OFERTAS.map(oferta => oferta.codigoBarras));
    porCodigo.forEach((dados, codigo) => {
      if (!naLista.has(codigo)) {
        linhas.push({ imagem: null, dados });
      }
    });
    const filtro = this.filtroOferta();
    return filtro ? linhas.filter(linha => linha.dados.codigoBarras === filtro) : linhas;
  });

  // Números dos cartões: o total do período, ou só da oferta escolhida no filtro.
  readonly resumo = computed<RelatorioOfertaDTO>(() => {
    const filtro = this.filtroOferta();
    if (filtro) {
      return this.linhas()[0]?.dados ?? this.zerada(filtro);
    }
    return this.relatorio()?.totais ?? this.zerada('');
  });

  // Aparelhos distintos: com uma oferta escolhida, os que a viram (alcance).
  readonly instalacoes = computed(() => this.relatorio()?.instalacoes
    ?? { total: 0, botao: 0, navegador: 0, android: 0, ios: 0, outras: 0 });

  readonly aparelhos = computed(() => this.filtroOferta() ? this.resumo().alcance : this.relatorio()?.aparelhos ?? 0);

  readonly recentes = computed(() => {
    const filtro = this.filtroOferta();
    const recentes = this.relatorio()?.recentes ?? [];
    return filtro ? recentes.filter(evento => evento.codigoBarras === filtro) : recentes;
  });

  constructor(public ofertas: OfertasService, private api: RelatorioApiService) {}

  ngOnInit(): void {
    document.title = 'Administração - Simplifica Compras';
    this.ofertas.carregarProdutos();
    if (this.chave()) {
      this.carregar();
    }
  }

  entrar(chave: string): void {
    const limpa = chave.trim();
    if (!limpa) {
      return;
    }
    this.chave.set(limpa);
    this.carregar();
  }

  trocarChave(): void {
    this.gravarChave(null);
    this.chave.set('');
    this.relatorio.set(null);
    this.erro.set(null);
  }

  escolherPeriodo(periodo: Periodo): void {
    this.periodo.set(periodo);
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    this.api.midias(this.chave(), this.periodo()).subscribe({
      next: relatorio => {
        this.carregando.set(false);
        this.gravarChave(this.chave());
        this.relatorio.set(relatorio);
        this.atualizadoEm.set(new Date());
      },
      error: err => {
        this.carregando.set(false);
        if (err.status === 401) {
          this.trocarChave();
          this.erro.set('Chave inválida. Confira e tente de novo.');
          return;
        }
        this.erro.set('Não foi possível carregar o relatório. Tente atualizar.');
      },
    });
  }

  descricao(dados: RelatorioOfertaDTO): string {
    return dados.descricao
      ?? this.ofertas.produtos()?.[dados.codigoBarras]?.descricao
      ?? 'Produto ' + dados.codigoBarras;
  }

  descricaoEvento(evento: EventoRecenteDTO): string {
    return evento.descricao ?? this.ofertas.produtos()?.[evento.codigoBarras]?.descricao ?? evento.codigoBarras;
  }

  rotuloTipo(evento: EventoRecenteDTO): string {
    return ROTULO_TIPO[evento.tipo];
  }

  rotuloOrigem(evento: EventoRecenteDTO): string {
    return evento.origem === 'ANUNCIO' ? 'Anúncio' : 'Tela Ofertas';
  }

  // Botão "Limpar dados" (fase de testes): o modal de confirmação chama esta.
  limparDados(): void {
    this.confirmandoLimpeza.set(false);
    this.carregando.set(true);
    this.erro.set(null);
    this.api.limparMidias(this.chave()).subscribe({
      next: () => this.carregar(),
      error: err => {
        this.carregando.set(false);
        if (err.status === 401) {
          this.trocarChave();
          this.erro.set('Chave inválida. Confira e tente de novo.');
          return;
        }
        this.erro.set('Não foi possível limpar os dados. Tente novamente.');
      },
    });
  }

  private zerada(codigoBarras: string): RelatorioOfertaDTO {
    return {
      codigoBarras, exibicoes: 0, exibicoesAnuncio: 0, exibicoesTela: 0, alcance: 0, favoritos: 0,
      desfavoritos: 0, localizar: 0, localizarAnuncio: 0, localizarTela: 0, preLista: 0,
      preListaAnuncio: 0, preListaTela: 0,
    };
  }

  private lerChave(): string {
    try {
      return localStorage.getItem(CHAVE_STORAGE) ?? '';
    } catch {
      return '';
    }
  }

  private gravarChave(chave: string | null): void {
    try {
      if (chave) {
        localStorage.setItem(CHAVE_STORAGE, chave);
      } else {
        localStorage.removeItem(CHAVE_STORAGE);
      }
    } catch {
      // sem storage a chave vale só enquanto a página estiver aberta
    }
  }
}
