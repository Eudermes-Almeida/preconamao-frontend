import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LocalizacaoDTO {
  nomeSetor: string;
  rua: number;
  // Letra (A a C), não número.
  quarteirao: string;
  lado: 'ESQUERDA' | 'DIREITA' | 'CENTRO';
}

export interface ProdutoDTO {
  codigoBarras: string;
  descricao: string;
  precoCentavos: number;
  // Ausente quando o produto ainda não tem posição mapeada no layout da loja.
  localizacao?: LocalizacaoDTO;
  // Item da pré-lista que este produto risca ao entrar no carrinho; ausente se não atende nenhum.
  preListaItemId?: number;
}

export interface PreListaItemDTO {
  id: number;
  nome: string;
}

// Uma categoria = um accordion da tela da pré-lista.
export interface PreListaCategoriaDTO {
  id: number;
  nome: string;
  itens: PreListaItemDTO[];
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

  buscarPreLista(): Observable<PreListaCategoriaDTO[]> {
    return this.http.get<PreListaCategoriaDTO[]>(`${environment.apiUrl}/pre-lista`);
  }
}
