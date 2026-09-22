import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LocalizacaoDTO {
  nomeSetor: string;
  rua: number;
  quarteirao: number;
  lado: 'ESQUERDA' | 'DIREITA' | 'CENTRO';
}

export interface ProdutoDTO {
  codigoBarras: string;
  descricao: string;
  precoCentavos: number;
  // Ausente quando o produto ainda não tem posição mapeada no layout da loja.
  localizacao?: LocalizacaoDTO;
}

@Injectable({
  providedIn: 'root'
})
export class ProdutoApiService {

  constructor(private http: HttpClient) {}

  buscarPorCodigoBarras(codigoBarras: string): Observable<ProdutoDTO> {
    return this.http.get<ProdutoDTO>(`${environment.apiUrl}/produtos/${encodeURIComponent(codigoBarras)}`);
  }

  // Até 5 candidatos, do mais para o menos parecido com o texto falado.
  buscarPorDescricao(descricao: string): Observable<ProdutoDTO[]> {
    const params = new HttpParams().set('descricao', descricao);
    return this.http.get<ProdutoDTO[]>(`${environment.apiUrl}/produtos`, { params });
  }
}
