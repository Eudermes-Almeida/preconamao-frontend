import { Component, OnInit, computed, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { OfertasService } from '../../services/ofertas.service';
import { AcaoLoja, AcessoRelatorioDTO, EventoRecenteDTO, RelatorioApiService, RelatorioMidiasDTO, RelatorioOfertaDTO, SituacaoLojaDTO } from '../../services/relatorio-api.service';
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

// Semáforo de cada loja no card "Lojas e integrações".
export type EstadoLoja = 'ok' | 'atencao' | 'problema' | 'inativa';

// Ação de loja aguardando confirmação no modal.
interface AcaoPendente {
  loja: SituacaoLojaDTO;
  acao: AcaoLoja;
  titulo: string;
  mensagem: string;
  textoConfirmar: string;
}

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
  // Com o código desta loja (ver OfertasService.disponiveis).
  get ofertasLista() {
    return this.ofertas.disponiveis();
  }

  readonly periodos: readonly { id: Periodo; rotulo: string }[] = [
    { id: 'hoje', rotulo: 'Hoje' },
    { id: '7dias', rotulo: 'Últimos 7 dias' },
    { id: '30dias', rotulo: 'Últimos 30 dias' },
  ];
  readonly periodo = signal<Periodo>('7dias');
  // '' = todas as ofertas.
  readonly filtroOferta = signal<string>('');

  // Multi-loja (regra 6): o que a chave enxerga e o filtro de loja (chave de rede ou geral).
  readonly acesso = signal<AcessoRelatorioDTO | null>(null);
  readonly filtroLoja = signal<number | null>(null);
  readonly variasLojas = computed(() => (this.acesso()?.acesso ?? 'LOJA') !== 'LOJA');

  readonly chave = signal<string>(this.lerChave());
  readonly relatorio = signal<RelatorioMidiasDTO | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly atualizadoEm = signal<Date | null>(null);
  readonly confirmandoLimpeza = signal(false);

  // Card "Lojas e integrações": só a chave geral (quem opera o sistema) vê e age.
  readonly ehGeral = computed(() => this.acesso()?.acesso === 'GERAL');
  readonly situacaoLojas = signal<SituacaoLojaDTO[] | null>(null);
  readonly acaoPendente = signal<AcaoPendente | null>(null);
  readonly avisoLoja = signal<string | null>(null);

  // Todas as ofertas da loja (mesmo sem evento) + qualquer código com evento que não esteja mais
  // na lista de ofertas.
  readonly linhas = computed<LinhaOferta[]>(() => {
    const porCodigo = new Map((this.relatorio()?.ofertas ?? []).map(dados => [dados.codigoBarras, dados]));
    const ofertas = this.ofertas.disponiveis();
    const linhas: LinhaOferta[] = ofertas.map(oferta => ({
      imagem: oferta.imagem,
      dados: porCodigo.get(oferta.codigoBarras) ?? this.zerada(oferta.codigoBarras),
    }));
    const naLista = new Set(ofertas.map(oferta => oferta.codigoBarras));
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

  readonly familia = computed(() => this.relatorio()?.familia
    ?? { ligacoes: 0, listasEnviadas: 0, listasAceitas: 0, listasRecusadas: 0, itensEnviados: 0 });
  // A Família não tem loja: só a chave geral vê (regra 6d).
  readonly mostraFamilia = computed(() => !!this.relatorio()?.familia);

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
    this.acesso.set(null);
    this.filtroLoja.set(null);
    this.situacaoLojas.set(null);
    this.avisoLoja.set(null);
  }

  escolherLoja(valor: string): void {
    this.filtroLoja.set(valor ? Number(valor) : null);
    this.carregar();
  }

  escolherPeriodo(periodo: Periodo): void {
    this.periodo.set(periodo);
    this.carregar();
  }

  carregar(): void {
    this.carregando.set(true);
    this.erro.set(null);
    if (!this.acesso()) {
      this.api.lojas(this.chave()).subscribe({
        next: acesso => {
          this.acesso.set(acesso);
          this.carregarSituacaoLojas();
        },
        error: () => undefined,
      });
    } else {
      this.carregarSituacaoLojas();
    }
    this.api.midias(this.chave(), this.periodo(), this.filtroLoja()).subscribe({
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
    this.api.limparMidias(this.chave(), this.filtroLoja()).subscribe({
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

  carregarSituacaoLojas(): void {
    if (!this.ehGeral()) {
      this.situacaoLojas.set(null);
      return;
    }
    this.api.situacaoLojas(this.chave()).subscribe({
      next: lojas => this.situacaoLojas.set(lojas),
      error: () => this.avisoLoja.set('Não foi possível carregar a situação das lojas.'),
    });
  }

  // Minutos desde o último sinal da loja (null = nunca mandou).
  minutosSemSinal(loja: SituacaoLojaDTO): number | null {
    return loja.ultimoSinalEm ? Math.max(0, Math.floor((Date.now() - new Date(loja.ultimoSinalEm).getTime()) / 60000)) : null;
  }

  // Verde: sinal recente, foto aplicada e última carga sem problema. Amarelo: carga retida ou foto
  // ainda não aplicada. Vermelho: sem sinal além do limite da loja (o app esconde os preços) ou erro.
  estadoLoja(loja: SituacaoLojaDTO): EstadoLoja {
    if (!loja.ativa) {
      return 'inativa';
    }
    if (this.semSinal(loja) || loja.ultimaCarga?.situacao === 'ERRO') {
      return 'problema';
    }
    if (loja.ultimaCarga?.situacao === 'RETIDA' || !loja.fotoEmDia) {
      return 'atencao';
    }
    return 'ok';
  }

  rotuloEstado(loja: SituacaoLojaDTO): string {
    switch (this.estadoLoja(loja)) {
      case 'inativa': return 'Fora do app';
      case 'problema': return loja.ultimaCarga?.situacao === 'ERRO' && !this.semSinal(loja) ? 'Erro na carga' : 'Sem sinal';
      case 'atencao': return loja.ultimaCarga?.situacao === 'RETIDA' ? 'Carga retida' : 'Aguardando carga';
      default: return 'Em dia';
    }
  }

  textoSinal(loja: SituacaoLojaDTO): string {
    const minutos = this.minutosSemSinal(loja);
    if (minutos == null) {
      return 'nunca recebido';
    }
    if (minutos < 1) {
      return 'agora há pouco';
    }
    if (minutos < 120) {
      return `há ${minutos} min`;
    }
    return minutos < 2880 ? `há ${Math.floor(minutos / 60)} h` : `há ${Math.floor(minutos / 1440)} dias`;
  }

  pedirAcao(loja: SituacaoLojaDTO, acao: AcaoLoja): void {
    const textos: Record<AcaoLoja, Omit<AcaoPendente, 'loja' | 'acao'>> = {
      'pedir-completa': {
        titulo: `Pedir uma carga completa à loja ${loja.nome}?`,
        mensagem: 'No próximo sinal (em até 1 minuto), o agente da loja lê todos os preços de novo e envia. Nada muda se os preços forem os mesmos.',
        textoConfirmar: 'Pedir carga completa',
      },
      'liberar-carga': {
        titulo: `Liberar a carga retida da loja ${loja.nome}?`,
        mensagem: 'A próxima carga desta loja passa pelas travas de segurança uma única vez (produtos tirados do app e quedas de preço em massa). '
          + 'Libere só depois de confirmar com a loja que a mudança é real (ex.: troca de sistema). Fica registrado na carga.',
        textoConfirmar: 'Liberar a carga',
      },
      'liberar-agente': {
        titulo: `Liberar o agente da loja ${loja.nome}?`,
        mensagem: 'Use quando a loja trocar o computador do agente: o próximo agente que se conectar com a chave da loja passa a ser o registrado. '
          + 'Até lá, o atual continua funcionando.',
        textoConfirmar: 'Liberar o agente',
      },
    };
    this.acaoPendente.set({ loja, acao, ...textos[acao] });
  }

  confirmarAcao(): void {
    const pendente = this.acaoPendente();
    this.acaoPendente.set(null);
    if (!pendente) {
      return;
    }
    this.avisoLoja.set(null);
    this.api.acaoLoja(this.chave(), pendente.loja.id, pendente.acao).subscribe({
      next: () => {
        const feitos: Record<AcaoLoja, string> = {
          'pedir-completa': 'Carga completa pedida',
          'liberar-carga': 'Carga liberada',
          'liberar-agente': 'Agente liberado',
        };
        this.avisoLoja.set(`${feitos[pendente.acao]}: ${pendente.loja.nome}.`);
        this.carregarSituacaoLojas();
      },
      error: () => this.avisoLoja.set(`Não foi possível concluir a ação na loja ${pendente.loja.nome}. Tente de novo.`),
    });
  }

  private semSinal(loja: SituacaoLojaDTO): boolean {
    const minutos = this.minutosSemSinal(loja);
    return loja.limiteSemSinalMin != null && (minutos == null || minutos > loja.limiteSemSinalMin);
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
