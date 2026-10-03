import { Injectable, computed, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { SwPush } from '@angular/service-worker';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ConteudoLista, PreListaService } from './pre-lista.service';
import { EventosMidiaService } from './eventos-midia.service';

// "Família": um celular manda itens da pré-lista para outro (a esposa em casa, o marido no
// mercado), sem cadastro. Ver scripts/020_familia.sql e FamiliaResource no back.
//
// - O aparelho gera uma chave secreta (localStorage) na primeira vez que usa a Família; a API só
//   conhece o hash. Quem nunca usou não manda nada à API.
// - Conexão por convite (link do WhatsApp ou código), de mão dupla: aceito, os dois enviam.
// - Quem envia acompanha cada lista (aguardando / juntou / recusou) em "Listas enviadas".
// - Sem cadastro, apagar o app (ou os dados) cria uma pessoa nova. Ao conectar de novo, se já
//   existe uma conexão com alguém de mesmo nome, o app pergunta se é a mesma pessoa e oferece
//   substituir a conexão antiga, que não funciona mais.
// - Enviar tira os itens da própria lista; quem recebe decide "Juntar" (soma) ou "Recusar".
// - Com a chave criada, o app confere a cada 30 s (só com a tela visível) se chegou lista.
// - Avisos no celular (Web Push, opcional): "Ativar avisos" inscreve este navegador no serviço de
//   push dele; o back avisa quando chega lista ou quando aceitam o convite, mesmo com o app fechado.
//   O próprio service worker do Angular mostra a notificação e, no toque, abre o app.

export interface ContatoFamilia {
  id: number;
  apelido: string;
  nome: string | null;
  // O serviço de push confirmou que o app do celular dessa pessoa foi removido (some sozinho
  // quando ela volta a usar o app).
  parouDeReceber?: boolean;
}

export interface ListaRecebida {
  id: number;
  contatoId: number;
  apelido: string;
  nome: string | null;
  conteudo: ConteudoLista;
  quantidadeItens: number;
  enviadaEm: string;
}

export type SituacaoListaEnviada = 'PENDENTE' | 'ACEITA' | 'RECUSADA';

export interface ListaEnviada {
  id: number;
  paraId: number;
  apelido: string;
  quantidadeItens: number;
  situacao: SituacaoListaEnviada;
  enviadaEm: string;
  resolvidaEm: string | null;
}

// Conexão nova com alguém que tem o mesmo nome de uma conexão que já existia.
export interface Substituicao {
  novo: ContatoFamilia;
  antigos: ContatoFamilia[];
}

export type SituacaoConvite = 'VALIDO' | 'USADO' | 'VENCIDO' | 'PROPRIO';

// INDISPONIVEL = navegador sem push (ou modo dev, sem service worker); IPHONE_INSTALAR = iPhone no
// Safari: lá o aviso só existe com o app instalado na tela de início (iOS 16.4+).
export type SituacaoAvisos = 'VERIFICANDO' | 'INDISPONIVEL' | 'IPHONE_INSTALAR' | 'BLOQUEADO' | 'DESATIVADO' | 'ATIVO';

export interface Convite {
  codigo: string;
  deNome: string | null;
  situacao: SituacaoConvite;
  expiraEm: string;
}

interface EstadoFamilia {
  nome: string | null;
  contatos: ContatoFamilia[];
  recebidas: ListaRecebida[];
  enviadas: ListaEnviada[];
}

const CHAVE_APARELHO = 'preconamao.familia.chave';
const CHAVE_NOME = 'preconamao.familia.nome';
// Contatos já vistos por este aparelho: um id novo = "Marido aceitou seu convite".
const CHAVE_CONHECIDOS = 'preconamao.familia.conhecidos';
// "Não, é outra pessoa": não perguntar de novo sobre esta conexão.
const CHAVE_DUPLICADOS_IGNORADOS = 'preconamao.familia.duplicadosIgnorados';
const INTERVALO_CONSULTA_MS = 30_000;
const DURACAO_AVISO_MS = 6_000;

@Injectable({
  providedIn: 'root'
})
export class FamiliaService {

  readonly nome = signal<string | null>(this.ler(CHAVE_NOME));
  readonly contatos = signal<ContatoFamilia[]>([]);
  readonly recebidas = signal<ListaRecebida[]>([]);
  readonly enviadas = signal<ListaEnviada[]>([]);
  // Pergunta "É a mesma pessoa?" (SubstituirContatoComponent).
  readonly substituicao = signal<Substituicao | null>(null);
  // A primeira lista pendente é a que aparece no modal "Maria enviou 6 itens".
  readonly listaParaResponder = computed(() => this.recebidas()[0] ?? null);

  // Código vindo do link /familia/<código> (AppComponent) ou digitado em "Tenho um convite".
  readonly convitePendente = signal<string | null>(null);
  // Painel "Família" aberto (nome, pessoas ligadas, convidar, tenho um convite).
  readonly painelAberto = signal(false);
  // Janela "Enviar lista para...".
  readonly envioAberto = signal(false);
  // Faixa de aviso no rodapé ("6 itens enviados para Marido").
  readonly aviso = signal<string | null>(null);
  // Avisos no celular (seção do painel Família e convite aceito).
  readonly avisos = signal<SituacaoAvisos>('VERIFICANDO');

  private chave: string | null = this.ler(CHAVE_APARELHO);
  private consultando = false;
  // Situação de cada lista enviada na consulta anterior (null = ainda não consultou nesta sessão):
  // PENDENTE -> ACEITA/RECUSADA vira o aviso "Marido juntou sua lista ✓".
  private situacoesEnviadas: Map<number, SituacaoListaEnviada> | null = null;
  private iniciado = false;
  private timerAviso?: ReturnType<typeof setTimeout>;
  // Chave pública VAPID, buscada antes do toque em "Ativar avisos": no iPhone o pedido de permissão
  // precisa sair direto do toque, sem esperar a rede no meio.
  private chaveAvisos: string | null = null;

  constructor(private http: HttpClient, private preLista: PreListaService, private eventosMidia: EventosMidiaService,
              private swPush: SwPush) {}

  get usaFamilia(): boolean {
    return this.chave !== null;
  }

  // Chamado pelo AppComponent (só no app do cliente).
  iniciar(): void {
    if (this.iniciado) {
      return;
    }
    this.iniciado = true;
    setInterval(() => this.atualizar(), INTERVALO_CONSULTA_MS);
    document.addEventListener('visibilitychange', () => this.atualizar());
    this.atualizar();
    // Aviso chegando com o app aberto: busca a lista na hora, sem esperar os 30 s.
    if (this.swPush.isEnabled) {
      this.swPush.messages.subscribe(() => this.atualizar());
    }
    void this.verificarAvisos(true);
  }

  // Só com a Família em uso e a tela visível: celular no bolso não consulta a API.
  atualizar(): void {
    if (!this.chave || this.consultando || document.visibilityState !== 'visible') {
      return;
    }
    this.consultando = true;
    this.http.get<EstadoFamilia>(`${environment.apiUrl}/familia`, { headers: this.cabecalho() }).subscribe({
      next: (estado) => {
        this.consultando = false;
        this.aplicarEstado(estado);
      },
      error: () => {
        // Sem rede: tenta de novo no próximo ciclo.
        this.consultando = false;
      },
    });
  }

  private aplicarEstado(estado: EstadoFamilia): void {
    if (estado.nome) {
      this.guardarNome(estado.nome);
    }
    this.avisarContatosNovos(estado.contatos);
    this.contatos.set(estado.contatos);
    this.recebidas.set(estado.recebidas);
    this.avisarRespostas(estado.enviadas ?? []);
    this.enviadas.set(estado.enviadas ?? []);
    if (estado.recebidas.length > 0) {
      // Os nomes dos itens recebidos vêm do catálogo da pré-lista.
      this.preLista.carregarCatalogo();
    }
  }

  // Quem convidou fica sabendo, na próxima consulta, que o convite foi aceito.
  private avisarContatosNovos(contatos: ContatoFamilia[]): void {
    const salvos = this.ler(CHAVE_CONHECIDOS);
    const conhecidos = new Set<number>(salvos ? JSON.parse(salvos) : []);
    const novos = contatos.filter(contato => !conhecidos.has(contato.id));
    // Na primeira consulta deste aparelho não há o que avisar (ele mesmo acabou de aceitar).
    if (salvos && novos.length > 0) {
      this.mostrarAviso(`${novos.map(c => c.apelido).join(', ')} aceitou seu convite ✓`);
      novos.forEach(novo => this.verificarMesmaPessoa(novo, contatos));
    }
    this.gravar(CHAVE_CONHECIDOS, JSON.stringify(contatos.map(contato => contato.id)));
  }

  private avisarRespostas(enviadas: ListaEnviada[]): void {
    const anteriores = this.situacoesEnviadas;
    if (anteriores) {
      const respondida = enviadas.find(l => anteriores.get(l.id) === 'PENDENTE' && l.situacao !== 'PENDENTE');
      if (respondida) {
        this.mostrarAviso(respondida.situacao === 'ACEITA'
          ? `${respondida.apelido} juntou sua lista ✓`
          : `${respondida.apelido} recusou sua lista`);
      }
    }
    this.situacoesEnviadas = new Map(enviadas.map(l => [l.id, l.situacao]));
  }

  // Conexão nova com o mesmo nome (sem acento/maiúscula) de outra já existente: provavelmente a
  // mesma pessoa, que apagou o app ou trocou de celular. Quem decide é o usuário.
  private verificarMesmaPessoa(novo: ContatoFamilia, contatos: ContatoFamilia[]): void {
    const ignorados: number[] = JSON.parse(this.ler(CHAVE_DUPLICADOS_IGNORADOS) ?? '[]');
    if (!novo.nome || ignorados.includes(novo.id)) {
      return;
    }
    const nome = normalizarNome(novo.nome);
    const antigos = contatos.filter(c => c.id !== novo.id && c.nome && normalizarNome(c.nome) === nome);
    if (antigos.length > 0) {
      this.substituicao.set({ novo, antigos });
    }
  }

  // "Sim, substituir": remove as conexões antigas (dos dois lados, como o "Remover").
  async substituirConexao(): Promise<void> {
    const pedido = this.substituicao();
    if (!pedido) {
      return;
    }
    for (const antigo of pedido.antigos) {
      try {
        await this.removerContato(antigo);
      } catch (erro) {
        // 404 = já tinha sido removida: segue.
        if (!(erro instanceof ErroFamilia && erro.status === 404)) {
          throw erro;
        }
      }
    }
    this.substituicao.set(null);
    this.eventosMidia.eventoGa4('familia_conexao_substituida', {});
    this.mostrarAviso(`Pronto! Agora só a conexão nova com ${pedido.novo.apelido} ✓`);
  }

  manterConexoes(): void {
    const pedido = this.substituicao();
    if (pedido) {
      const ignorados: number[] = JSON.parse(this.ler(CHAVE_DUPLICADOS_IGNORADOS) ?? '[]');
      this.gravar(CHAVE_DUPLICADOS_IGNORADOS, JSON.stringify([...ignorados, pedido.novo.id]));
    }
    this.substituicao.set(null);
  }

  async definirNome(nome: string): Promise<void> {
    const resposta = await this.pedir<{ nome: string }>('PUT', '/familia/eu', { nome });
    this.guardarNome(resposta.nome);
  }

  // O link vai no WhatsApp; o código serve para quem abre no iPhone (o link cai no Safari, que
  // não enxerga os dados do app instalado) e para digitar à mão.
  async criarConvite(apelido: string): Promise<Convite> {
    const convite = await this.pedir<Convite>('POST', '/familia/convites', { apelido });
    this.eventosMidia.eventoGa4('familia_convite_criado', {});
    // Referência para o aviso "aceitou seu convite", mesmo que o aceite chegue antes da 1ª consulta.
    if (!this.ler(CHAVE_CONHECIDOS)) {
      this.gravar(CHAVE_CONHECIDOS, JSON.stringify(this.contatos().map(contato => contato.id)));
    }
    return convite;
  }

  consultarConvite(codigo: string): Promise<Convite> {
    return this.pedir<Convite>('GET', `/familia/convites/${encodeURIComponent(codigo)}`);
  }

  async aceitarConvite(codigo: string, apelido: string): Promise<ContatoFamilia> {
    const contato = await this.pedir<ContatoFamilia>('POST', `/familia/convites/${encodeURIComponent(codigo)}/aceitar`, { apelido });
    this.eventosMidia.eventoGa4('familia_convite_aceito', {});
    this.contatos.update(contatos => [...contatos.filter(c => c.id !== contato.id), contato]);
    this.marcarConhecido(contato.id);
    this.verificarMesmaPessoa(contato, this.contatos());
    this.atualizar();
    return contato;
  }

  async removerContato(contato: ContatoFamilia): Promise<void> {
    await this.pedir('DELETE', `/familia/contatos/${contato.id}`);
    this.contatos.update(contatos => contatos.filter(c => c.id !== contato.id));
  }

  // Envia os itens escolhidos na janela "Enviar lista" e tira-os desta lista. Devolve o aviso para
  // quem enviou (a janela mostra depois do banner do envio, para não sumir por trás dele).
  // Uma cópia da lista para cada pessoa escolhida (no iPhone, o app instalado e o Safari são duas
  // pessoas na Família: mandando para as duas, a lista chega onde ela estiver). Os itens saem desta
  // lista se pelo menos uma recebeu (quem falhou entra no aviso); se ninguém recebeu, ErroFamilia.
  async enviarLista(contatos: ContatoFamilia[], conteudo: ConteudoLista): Promise<string> {
    const quantidade = Object.keys(conteudo.itens).length + Object.keys(conteudo.produtos).length;
    const enviados: ContatoFamilia[] = [];
    const falhas: { apelido: string; motivo: string }[] = [];
    for (const contato of contatos) {
      try {
        await this.pedir('POST', '/familia/listas', { paraId: contato.id, conteudo });
        enviados.push(contato);
      } catch (erro) {
        falhas.push({ apelido: contato.apelido, motivo: erro instanceof ErroFamilia ? erro.message : 'Algo deu errado. Tente de novo.' });
      }
    }
    const descreverFalhas = () => falhas.map(f => `${f.apelido}: ${f.motivo}`).join(' ');
    if (enviados.length > 0) {
      this.preLista.removerEnviados(conteudo);
      this.eventosMidia.eventoGa4('familia_lista_enviada', { itens: String(quantidade), pessoas: String(enviados.length) });
      // Já aparece em "Listas enviadas" como aguardando.
      this.atualizar();
      const naoChegou = falhas.length > 0 ? ` Não foi para ${descreverFalhas()}` : '';
      return `${quantidade} ${quantidade === 1 ? 'item enviado' : 'itens enviados'} para ${juntarNomes(enviados.map(c => c.apelido))}. ${quantidade === 1 ? 'Ele saiu' : 'Eles saíram'} da sua lista.${naoChegou}`;
    }
    throw new ErroFamilia(0, falhas.length === 1 ? falhas[0].motivo : `Não foi possível enviar. ${descreverFalhas()}`);
  }

  // "Juntar": primeiro a API (para a lista não voltar), depois a soma na pré-lista.
  async responderLista(lista: ListaRecebida, juntar: boolean): Promise<void> {
    try {
      await this.pedir('POST', `/familia/listas/${lista.id}/${juntar ? 'aceitar' : 'recusar'}`);
    } catch (erro) {
      // 409 = já respondida (ex.: dois toques): segue como se tivesse dado certo.
      if (!(erro instanceof ErroFamilia && erro.status === 409)) {
        throw erro;
      }
    }
    if (juntar) {
      this.preLista.juntar(lista.conteudo);
      this.mostrarAviso(`Itens de ${lista.apelido} juntados à sua pré-lista ✓`);
    }
    this.eventosMidia.eventoGa4(juntar ? 'familia_lista_aceita' : 'familia_lista_recusada', { itens: String(lista.quantidadeItens) });
    this.recebidas.update(recebidas => recebidas.filter(r => r.id !== lista.id));
  }

  // ------------------------------------------------------------------------------------------
  // Avisos no celular
  // ------------------------------------------------------------------------------------------

  // Descobre a situação dos avisos neste navegador. renovar = reenviar a inscrição ao back (ao
  // abrir o app): o navegador pode trocá-la, e assim ela fica sempre ligada a este membro.
  async verificarAvisos(renovar = false): Promise<void> {
    const ehIphone = /iPhone|iPad|iPod/.test(navigator.userAgent)
      || (navigator.userAgent.includes('Macintosh') && navigator.maxTouchPoints > 1);
    const instalado = matchMedia('(display-mode: standalone)').matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (ehIphone && !instalado) {
      this.avisos.set('IPHONE_INSTALAR');
      return;
    }
    if (!this.swPush.isEnabled || !('PushManager' in window) || !('Notification' in window)) {
      this.avisos.set('INDISPONIVEL');
      return;
    }
    if (Notification.permission === 'denied') {
      this.avisos.set('BLOQUEADO');
      return;
    }
    const inscricao = await firstValueFrom(this.swPush.subscription);
    this.avisos.set(inscricao ? 'ATIVO' : 'DESATIVADO');
    if (inscricao && renovar && this.chave) {
      this.pedir('PUT', '/familia/avisos', inscricao.toJSON()).catch(() => undefined);
    }
  }

  // Chamado ao abrir o painel Família / o "Pronto!" do convite, antes de a pessoa tocar no botão.
  prepararAvisos(): void {
    void this.verificarAvisos();
    if (this.chaveAvisos === null && this.swPush.isEnabled) {
      this.pedir<{ chavePublica: string | null }>('GET', '/familia/avisos/chave')
        .then(resposta => this.chaveAvisos = resposta.chavePublica)
        .catch(() => undefined);
    }
  }

  async ativarAvisos(): Promise<void> {
    const chave = this.chaveAvisos
      ?? (await this.pedir<{ chavePublica: string | null }>('GET', '/familia/avisos/chave')).chavePublica;
    if (!chave) {
      throw new ErroFamilia(503, 'Os avisos estão indisponíveis no momento.');
    }
    this.chaveAvisos = chave;
    let inscricao: PushSubscription;
    try {
      inscricao = await this.swPush.requestSubscription({ serverPublicKey: chave });
    } catch {
      if (Notification.permission === 'denied') {
        this.avisos.set('BLOQUEADO');
        return;
      }
      throw new ErroFamilia(0, 'Não foi possível ativar os avisos neste navegador. Tente de novo.');
    }
    await this.pedir('PUT', '/familia/avisos', inscricao.toJSON());
    this.avisos.set('ATIVO');
    this.eventosMidia.eventoGa4('familia_avisos_ativados', {});
  }

  async desativarAvisos(): Promise<void> {
    const inscricao = await firstValueFrom(this.swPush.subscription);
    if (inscricao) {
      await this.pedir('POST', '/familia/avisos/cancelar', { endpoint: inscricao.endpoint });
      await this.swPush.unsubscribe().catch(() => undefined);
    }
    this.avisos.set('DESATIVADO');
    this.eventosMidia.eventoGa4('familia_avisos_desativados', {});
  }

  // Texto pronto para o WhatsApp: o link, e o código para quem usa o app instalado no iPhone.
  mensagemConvite(convite: Convite): string {
    const codigo = `${convite.codigo.slice(0, 4)}-${convite.codigo.slice(4)}`;
    return `${convite.deNome ?? 'Alguém'} quer trocar listas de compras com você no Simplifica Compras.\n`
      + `Toque no link para aceitar (vale por 7 dias):\n${location.origin}/familia/${convite.codigo}\n\n`
      + `Ou no app: Pré-lista → Família → Tenho um convite → código ${codigo}`;
  }

  mostrarAviso(texto: string): void {
    clearTimeout(this.timerAviso);
    this.aviso.set(texto);
    this.timerAviso = setTimeout(() => this.aviso.set(null), DURACAO_AVISO_MS);
  }

  // ------------------------------------------------------------------------------------------

  private async pedir<T = unknown>(metodo: 'GET' | 'PUT' | 'POST' | 'DELETE', caminho: string, corpo?: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.http.request<T>(metodo, `${environment.apiUrl}${caminho}`, {
        headers: this.cabecalho(),
        body: corpo,
      }));
    } catch (erro) {
      if (erro instanceof HttpErrorResponse) {
        const mensagem = erro.status === 0
          ? 'Sem conexão. Verifique a internet e tente de novo.'
          : (erro.error?.mensagem ?? 'Algo deu errado. Tente de novo.');
        throw new ErroFamilia(erro.status, mensagem);
      }
      throw erro;
    }
  }

  // A chave nasce aqui, na primeira ação da pessoa na Família.
  private cabecalho(): HttpHeaders {
    if (!this.chave) {
      const bytes = crypto.getRandomValues(new Uint8Array(32));
      this.chave = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      this.gravar(CHAVE_APARELHO, this.chave);
    }
    return new HttpHeaders({ 'X-Chave-Familia': this.chave });
  }

  private guardarNome(nome: string): void {
    this.nome.set(nome);
    this.gravar(CHAVE_NOME, nome);
  }

  private marcarConhecido(id: number): void {
    const salvos = this.ler(CHAVE_CONHECIDOS);
    const conhecidos: number[] = salvos ? JSON.parse(salvos) : [];
    if (!conhecidos.includes(id)) {
      this.gravar(CHAVE_CONHECIDOS, JSON.stringify([...conhecidos, id]));
    }
  }

  private ler(chave: string): string | null {
    try {
      return localStorage.getItem(chave);
    } catch {
      return null;
    }
  }

  private gravar(chave: string, valor: string): void {
    try {
      localStorage.setItem(chave, valor);
    } catch {
      // Sem storage: a Família funciona só nesta sessão.
    }
  }
}

function normalizarNome(nome: string): string {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

// Erro com a mensagem pronta para mostrar ao cliente (vinda da API ou de falta de rede).
// "Esposa", "Esposa e Filho", "Esposa, Filho e Mãe".
export function juntarNomes(nomes: string[]): string {
  return nomes.length <= 1 ? (nomes[0] ?? '') : `${nomes.slice(0, -1).join(', ')} e ${nomes[nomes.length - 1]}`;
}

export class ErroFamilia extends Error {
  constructor(readonly status: number, mensagem: string) {
    super(mensagem);
  }
}
