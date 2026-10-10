import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

// Números de uma oferta no período (ver RelatorioOfertaDTO no back): exibições e localizar contam
// aparições/toques; alcance, favoritos, desfavoritos e pré-lista contam APARELHOS distintos.
export interface RelatorioOfertaDTO {
  codigoBarras: string;
  descricao?: string;
  exibicoes: number;
  exibicoesAnuncio: number;
  exibicoesTela: number;
  alcance: number;
  favoritos: number;
  desfavoritos: number;
  localizar: number;
  localizarAnuncio: number;
  localizarTela: number;
  preLista: number;
  preListaAnuncio: number;
  preListaTela: number;
}

export interface EventoRecenteDTO {
  registradoEm: string;
  tipo: 'EXIBICAO' | 'FAVORITAR' | 'DESFAVORITAR' | 'LOCALIZAR' | 'PRE_LISTA';
  origem: 'ANUNCIO' | 'TELA_OFERTAS';
  codigoBarras: string;
  descricao?: string;
}

export interface RelatorioMidiasDTO {
  periodo: string;
  de: string;
  ate: string;
  // Aparelhos distintos com algum evento no período.
  aparelhos: number;
  totais: RelatorioOfertaDTO;
  ofertas: RelatorioOfertaDTO[];
  recentes: EventoRecenteDTO[];
  // Aparelhos que instalaram o app no período (ver RelatorioInstalacoesDTO no back).
  instalacoes: RelatorioInstalacoesDTO;
  // Família: ligações feitas e listas trocadas no período (ver RelatorioFamiliaDTO no back).
  // Só com a chave geral (a Família não tem loja — multi-loja, regra 6d).
  familia: RelatorioFamiliaDTO | null;
}

export interface RelatorioFamiliaDTO {
  ligacoes: number;
  listasEnviadas: number;
  listasAceitas: number;
  listasRecusadas: number;
  itensEnviados: number;
}

export interface RelatorioInstalacoesDTO {
  total: number;
  botao: number;
  navegador: number;
  android: number;
  ios: number;
  outras: number;
}

export interface LojaRelatorioDTO {
  id: number;
  nome: string;
  redeId: number;
}

export interface AcessoRelatorioDTO {
  acesso: 'LOJA' | 'REDE' | 'GERAL';
  lojas: LojaRelatorioDTO[];
}

// Card "Lojas e integrações" (só chave geral): GET /admin/lojas/situacao.
export interface CargaResumoDTO {
  id: number;
  tipo: 'COMPLETA' | 'PARCIAL' | null;
  situacao: 'RECEBIDA' | 'PROCESSANDO' | 'CONCLUIDA' | 'RETIDA' | 'ERRO' | 'IGNORADA' | string;
  recebidaEm: string;
  mensagem: string | null;
}

export interface SituacaoLojaDTO {
  id: number;
  nome: string;
  ativa: boolean;
  tipoOrigem: 'PRICETAB' | 'API';
  formato: string | null;
  agenteRegistrado: boolean;
  ultimoSinalEm: string | null;
  limiteSemSinalMin: number | null;
  fotoEmDia: boolean;
  divergenteDesde: string | null;
  alerta: string | null;
  cargaLiberada: boolean;
  completaPedida: boolean;
  ultimaCompletaEm: string | null;
  produtosAtivos: number;
  ultimaCarga?: CargaResumoDTO;
}

export type AcaoLoja = 'pedir-completa' | 'liberar-carga' | 'liberar-agente';

@Injectable({
  providedIn: 'root'
})
export class RelatorioApiService {

  constructor(private http: HttpClient) {}

  situacaoLojas(chave: string): Observable<SituacaoLojaDTO[]> {
    return this.http.get<SituacaoLojaDTO[]>(`${environment.apiUrl}/admin/lojas/situacao`, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
    });
  }

  acaoLoja(chave: string, lojaId: number, acao: AcaoLoja): Observable<unknown> {
    return this.http.post(`${environment.apiUrl}/admin/lojas/${lojaId}/${acao}`, null, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
    });
  }

  // Que lojas a chave enxerga (multi-loja, regra 6): LOJA = só ela; REDE = as da rede; GERAL = todas.
  lojas(chave: string): Observable<AcessoRelatorioDTO> {
    return this.http.get<AcessoRelatorioDTO>(`${environment.apiUrl}/relatorios/lojas`, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
    });
  }

  // chave = chave de relatório (cabeçalho X-Chave-Relatorio); sem ela a API responde 401.
  // loja = filtro (chave de rede ou geral); sem ele, o consolidado de todas as lojas da chave.
  midias(chave: string, periodo: string, loja: number | null = null): Observable<RelatorioMidiasDTO> {
    let params = new HttpParams().set('periodo', periodo);
    if (loja != null) {
      params = params.set('loja', loja);
    }
    return this.http.get<RelatorioMidiasDTO>(`${environment.apiUrl}/relatorios/midias`, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
      params,
    });
  }

  // Fase de testes: apaga todos os eventos de UMA loja (todos os períodos). Chave de rede ou geral:
  // a loja precisa ser escolhida.
  limparMidias(chave: string, loja: number | null = null): Observable<{ apagados: number }> {
    return this.http.delete<{ apagados: number }>(`${environment.apiUrl}/relatorios/midias`, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
      params: loja != null ? new HttpParams().set('loja', loja) : new HttpParams(),
    });
  }
}
