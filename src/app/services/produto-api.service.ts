import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { environment } from '../../environments/environment';

export interface LocalizacaoDTO {
  nomeSetor: string;
  rua: number;
  // Letra (A a C), não número.
  quarteirao: string;
  lado: 'ESQUERDA' | 'DIREITA' | 'CENTRO';
}

export interface ResultadoBuscaDescricao {
  produtos: ProdutoDTO[];
  total: number;
}

export interface ProdutoDTO {
  codigoBarras: string;
  // Com as abreviações do PRICETAB por extenso ("IOGURTE BATAVO 170G MORANGO").
  descricao: string;
  // Como veio do PRICETAB ("IOG BATAVO 170G MOR"), só quando é diferente: aparece pequena embaixo,
  // para o cliente conferir com a etiqueta da gôndola.
  descricaoOriginal?: string | null;
  precoCentavos: number;
  // Ausente quando o produto ainda não tem posição mapeada no layout da loja.
  localizacao?: LocalizacaoDTO;
  // Item da pré-lista que este produto risca ao entrar no carrinho; ausente se não atende nenhum.
  preListaItemId?: number;
  // Produto de balança. Sem etiqueta (achado pela voz ou no localizador), precoCentavos é o preço
  // do quilo e não dá para pôr no carrinho sem pesar.
  vendidoPorKg?: boolean;
  precoKgCentavos?: number;
  // Lido da etiqueta da balança: codigoBarras é o da etiqueta e precoCentavos é o total dela.
  etiquetaBalanca?: boolean;
  // false = o app não pode garantir que o preço está atualizado (agente da loja sem sinal): o
  // preço fica escondido ("Consulte o preço no terminal da loja"). Ausente em API antiga = true.
  precoConfiavel?: boolean;
  // Quando o preço foi conferido com a loja pela última vez (ISO-8601).
  precoConferidoEm?: string;
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

  // Até 10 candidatos, do mais para o menos parecido com o texto falado. total = quantos produtos
  // tão parecidos quanto o melhor existem ao todo (cabeçalho X-Total-Encontrados; sem ele, o
  // tamanho da lista).
  buscarPorDescricao(descricao: string): Observable<ResultadoBuscaDescricao> {
    const params = new HttpParams().set('descricao', descricao);
    return this.http.get<ProdutoDTO[]>(`${environment.apiUrl}/produtos`, { params, observe: 'response' }).pipe(
      map(resposta => {
        const produtos = resposta.body ?? [];
        const total = Number(resposta.headers.get('X-Total-Encontrados'));
        return { produtos, total: Number.isFinite(total) && total > 0 ? total : produtos.length };
      }),
    );
  }

  // Preço atual de vários produtos numa chamada (ofertas, revalidação do carrinho). Os códigos
  // não encontrados ou inativos simplesmente não voltam.
  buscarLote(codigos: string[]): Observable<ProdutoDTO[]> {
    const params = new HttpParams().set('codigos', codigos.join(','));
    return this.http.get<ProdutoDTO[]>(`${environment.apiUrl}/produtos/lote`, { params });
  }

  buscarPreLista(): Observable<PreListaCategoriaDTO[]> {
    return this.http.get<PreListaCategoriaDTO[]>(`${environment.apiUrl}/pre-lista`);
  }
}
