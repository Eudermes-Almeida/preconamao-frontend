import { Injectable } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, from, map, switchMap } from 'rxjs';
import { environment } from '../../environments/environment';
import { LojaService } from './loja.service';

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
  // Com as abreviações do PRICETAB por extenso ("IOGURTE BATAVO 170G MORANGO"). Na loja de
  // descrição cortada (PRICETAB de 16 posições) termina com "…".
  descricao: string;
  // Como veio do PRICETAB ("IOG BATAVO 170G MOR"), só quando é diferente: aparece pequena embaixo,
  // para o cliente conferir com a etiqueta da gôndola.
  descricaoOriginal?: string | null;
  // Descrição cortada pela origem: o "ouvir preço" não fala a última palavra (pode estar pela metade).
  descricaoCortada?: boolean;
  // Com promoção válida, já é o preço promocional (e é o que o carrinho soma).
  precoCentavos: number;
  // Ausente quando o produto ainda não tem posição mapeada no layout da loja.
  localizacao?: LocalizacaoDTO;
  // Item da pré-lista que este produto risca ao entrar no carrinho; ausente se não atende nenhum.
  preListaItemId?: number;
  // Produto de balança. Sem etiqueta (achado pela voz ou no localizador), precoCentavos é o preço
  // do quilo e não dá para pôr no carrinho sem pesar.
  vendidoPorKg?: boolean;
  precoKgCentavos?: number;
  // Produto interno de loja que não informa a unidade: "preço de balança (por kg ou unidade)".
  precoBalancaIndefinido?: boolean;
  // Lido da etiqueta da balança: codigoBarras é o da etiqueta e precoCentavos é o total dela.
  etiquetaBalanca?: boolean;
  // false = o app não exibe o preço ("Consulte o preço no terminal de consulta da loja"). Ausente
  // em API antiga = true. O motivo: ZERO (preço 0,00 na loja), CONFLITO (código repetido com
  // preços diferentes) ou PROTECAO (loja sem sinal / dados não aplicados).
  precoConfiavel?: boolean;
  motivoSemPreco?: 'ZERO' | 'CONFLITO' | 'PROTECAO' | null;
  // Quando o preço foi conferido com a loja pela última vez (ISO-8601).
  precoConferidoEm?: string;
  // Promoção da loja (vem da origem): "de R$ precoNormal por R$ preco, até promocaoAte".
  precoNormalCentavos?: number | null;
  promocaoAte?: string | null;
  // Informativos (o app não faz conta): preço a partir de N unidades e condição em texto.
  atacadoCentavos?: number | null;
  atacadoQuantidade?: number | null;
  condicao?: string | null;
}

export interface PreListaItemDTO {
  id: number;
  nome: string;
  // A loja atual tem algum produto ativo deste item (ausente em API antiga = true). O app esconde
  // o que a loja não tem, a não ser que já esteja marcado na lista ("Não encontrado nesta loja").
  disponivel?: boolean;
}

// Uma categoria = um accordion da tela da pré-lista.
export interface PreListaCategoriaDTO {
  id: number;
  nome: string;
  itens: PreListaItemDTO[];
}

// Campanha de mídia (oferta da vitrine) válida na loja, com o produto e o preço DESTA loja.
export interface CampanhaDTO {
  id: number;
  nome: string;
  imagem: string;
  codigoBarras: string;
  produto: ProdutoDTO;
}

@Injectable({
  providedIn: 'root'
})
export class ProdutoApiService {

  constructor(private http: HttpClient, private loja: LojaService) {}

  // Toda consulta leva a loja (?loja=, multi-loja): espera a lista de lojas carregar (para saber a
  // loja padrão quando nada foi escolhido) e usa a loja atual. Sem lista (sem rede), segue sem
  // loja — em produção o servidor usa a loja padrão.
  private comLoja(params: HttpParams = new HttpParams()): Observable<HttpParams> {
    return from(this.loja.carregar().catch(() => [])).pipe(map(() => {
      const id = this.loja.lojaConsultaId();
      return id != null ? params.set('loja', id) : params;
    }));
  }

  buscarPorCodigoBarras(codigoBarras: string): Observable<ProdutoDTO> {
    return this.comLoja().pipe(switchMap(params =>
      this.http.get<ProdutoDTO>(`${environment.apiUrl}/produtos/${encodeURIComponent(codigoBarras)}`, { params })));
  }

  // Até 10 candidatos, do mais para o menos parecido com o texto falado. total = quantos produtos
  // tão parecidos quanto o melhor existem ao todo (cabeçalho X-Total-Encontrados; sem ele, o
  // tamanho da lista).
  // destaques = códigos das ofertas da vitrine: vêm primeiro quando estão entre os mais parecidos.
  buscarPorDescricao(descricao: string, destaques: readonly string[] = []): Observable<ResultadoBuscaDescricao> {
    let params = new HttpParams().set('descricao', descricao);
    if (destaques.length > 0) {
      params = params.set('destaques', destaques.join(','));
    }
    return this.comLoja(params).pipe(
      switchMap(comLoja => this.http.get<ProdutoDTO[]>(`${environment.apiUrl}/produtos`, { params: comLoja, observe: 'response' })),
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
    return this.comLoja(new HttpParams().set('codigos', codigos.join(','))).pipe(switchMap(params =>
      this.http.get<ProdutoDTO[]>(`${environment.apiUrl}/produtos/lote`, { params })));
  }

  buscarPreLista(): Observable<PreListaCategoriaDTO[]> {
    return this.comLoja().pipe(switchMap(params =>
      this.http.get<PreListaCategoriaDTO[]>(`${environment.apiUrl}/pre-lista`, { params })));
  }

  buscarCampanhas(): Observable<CampanhaDTO[]> {
    return this.comLoja().pipe(switchMap(params =>
      this.http.get<CampanhaDTO[]>(`${environment.apiUrl}/campanhas`, { params })));
  }
}
