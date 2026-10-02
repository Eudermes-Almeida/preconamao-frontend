import { Component, EventEmitter, Output } from '@angular/core';
import { VERSAO_APP } from '../../versao';
import { LojaService } from '../../services/loja.service';

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

  constructor(public loja: LojaService) {}
}
