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
}

@Injectable({
  providedIn: 'root'
})
export class RelatorioApiService {

  constructor(private http: HttpClient) {}

  // chave = chave de relatório da loja (cabeçalho X-Chave-Relatorio); sem ela a API responde 401.
  midias(chave: string, periodo: string): Observable<RelatorioMidiasDTO> {
    return this.http.get<RelatorioMidiasDTO>(`${environment.apiUrl}/relatorios/midias`, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
      params: new HttpParams().set('periodo', periodo),
    });
  }

  // Fase de testes: apaga todos os eventos da loja (todos os períodos).
  limparMidias(chave: string): Observable<{ apagados: number }> {
    return this.http.delete<{ apagados: number }>(`${environment.apiUrl}/relatorios/midias`, {
      headers: new HttpHeaders({ 'X-Chave-Relatorio': chave }),
    });
  }
}
