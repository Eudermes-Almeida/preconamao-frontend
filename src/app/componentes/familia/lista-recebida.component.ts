import { Component, Input, computed, signal } from '@angular/core';
import { ErroFamilia, FamiliaService, ListaRecebida } from '../../services/familia.service';
import { PreListaService } from '../../services/pre-lista.service';

interface LinhaRecebida {
  nome: string;
  quantidade: number;
}

// "Maria enviou 6 itens. Juntar à sua pré-lista?" — aparece em qualquer tela do app quando chega
// uma lista (FamiliaService consulta a cada 30 s). Juntar soma as quantidades.
@Component({
  selector: 'app-lista-recebida',
  standalone: true,
  templateUrl: './lista-recebida.component.html',
  styleUrl: './familia.css'
})
export class ListaRecebidaComponent {

  private readonly listaState = signal<ListaRecebida | null>(null);

  @Input({ required: true })
  set lista(valor: ListaRecebida) {
    this.listaState.set(valor);
    this.erro.set(null);
  }

  get lista(): ListaRecebida {
    return this.listaState()!;
  }

  readonly enviando = signal(false);
  readonly erro = signal<string | null>(null);

  // Nomes dos itens genéricos vêm do catálogo da pré-lista; recalcula quando ele chega.
  readonly linhas = computed<LinhaRecebida[]>(() => {
    const lista = this.listaState();
    if (!lista) {
      return [];
    }
    const itens = Object.entries(lista.conteudo.itens ?? {}).map(([id, quantidade]) => ({
      nome: this.preLista.nomeDoItem(Number(id)) ?? 'Item da pré-lista',
      quantidade,
    }));
    const produtos = Object.values(lista.conteudo.produtos ?? {}).map(produto => ({
      nome: produto.descricao,
      quantidade: produto.quantidade,
    }));
    return [...itens, ...produtos].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  });

  constructor(private familia: FamiliaService, private preLista: PreListaService) {}

  async responder(juntar: boolean): Promise<void> {
    this.enviando.set(true);
    this.erro.set(null);
    try {
      await this.familia.responderLista(this.lista, juntar);
    } catch (erro) {
      this.erro.set(erro instanceof ErroFamilia ? erro.message : 'Algo deu errado. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }
}
