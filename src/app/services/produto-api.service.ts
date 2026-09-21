import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface ProdutoDTO {
  codigoBarras: string;
  descricao: string;
  precoCentavos: number;
}

@Injectable({
  providedIn: 'root'
})
export class ProdutoApiService {

  constructor(private http: HttpClient) {}

  buscarPorCodigoBarras(codigoBarras: string): Observable<ProdutoDTO> {
    return this.http.get<ProdutoDTO>(`${environment.apiUrl}/produtos/${encodeURIComponent(codigoBarras)}`);
  }
}
