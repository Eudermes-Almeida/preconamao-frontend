import { Component, EventEmitter, Output } from '@angular/core';

@Component({
  selector: 'app-cabecalho',
  standalone: true,
  templateUrl: './cabecalho.component.html',
  styleUrl: './cabecalho.component.css'
})
export class CabecalhoComponent {

  // O header só avisa que o usuário quer limpar; quem confirma e reinicia a tela é o AppComponent.
  @Output() limpar = new EventEmitter<void>();
}
