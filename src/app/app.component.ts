import { Component } from '@angular/core';
import { ScannerProdutoComponent } from './componentes/scanner-produto/scanner-produto.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [ScannerProdutoComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css'
})
export class AppComponent {}
