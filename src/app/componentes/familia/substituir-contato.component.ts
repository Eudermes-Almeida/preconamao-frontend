import { Component, Input, signal } from '@angular/core';
import { ErroFamilia, FamiliaService, Substituicao } from '../../services/familia.service';

// "É a mesma pessoa?": a conexão nova tem o mesmo nome de uma que já existia (a pessoa apagou o
// app ou trocou de celular, e virou outra pessoa para o servidor). Substituir remove a antiga.
@Component({
  selector: 'app-substituir-contato',
  standalone: true,
  templateUrl: './substituir-contato.component.html',
  styleUrl: './familia.css'
})
export class SubstituirContatoComponent {

  @Input({ required: true }) pedido!: Substituicao;

  readonly ocupado = signal(false);
  readonly erro = signal<string | null>(null);

  constructor(public familia: FamiliaService) {}

  // Como a pessoa aparece hoje na lista ("Esposa"), para ela reconhecer de quem se trata.
  get apelidosAntigos(): string {
    return this.pedido.antigos.map(c => `“${c.apelido}”`).join(' e ');
  }

  async substituir(): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      await this.familia.substituirConexao();
    } catch (erro) {
      this.erro.set(erro instanceof ErroFamilia ? erro.message : 'Algo deu errado. Tente de novo.');
    } finally {
      this.ocupado.set(false);
    }
  }
}
