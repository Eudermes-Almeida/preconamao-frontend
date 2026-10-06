import { Component, EventEmitter, Output } from '@angular/core';
import { VERSAO_APP } from '../../versao';
import { LojaService } from '../../services/loja.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-cabecalho',
  standalone: true,
  templateUrl: './cabecalho.component.html',
  styleUrl: './cabecalho.component.css'
})
export class CabecalhoComponent {

  // O header só avisa que o usuário quer limpar; quem confirma e reinicia a tela é o AppComponent.
  @Output() limpar = new EventEmitter<void>();

  readonly versaoApp = VERSAO_APP;

  // Laboratório multi-loja (só DES): seletor das 5 lojas de teste. Nunca existe em produção.
  readonly seletorLojaDes = environment.seletorLojaDes;

  escolherLoja(evento: Event): void {
    this.loja.escolherPeloSeletor(Number((evento.target as HTMLSelectElement).value));
  }

  constructor(public loja: LojaService) {}

  arredondar(valor: number): number {
    return Math.round(valor);
  }
}
