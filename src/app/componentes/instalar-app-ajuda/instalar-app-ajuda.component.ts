import { AfterViewInit, Component, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { AjudaInstalacao, ENDERECO_OFICIAL } from '../../services/instalacao-app.service';

// Passo a passo do botão "Instalar o app" quando o navegador não abre a janela de instalação
// sozinho (ver InstalacaoAppService.instalar). O guia ilustrado do iPhone vem depois de validar o
// Android (decisão do usuário); por enquanto o iPhone recebe os passos em texto.
@Component({
  selector: 'app-instalar-app-ajuda',
  standalone: true,
  templateUrl: './instalar-app-ajuda.component.html',
  styleUrl: './instalar-app-ajuda.component.css'
})
export class InstalarAppAjudaComponent implements AfterViewInit, OnDestroy {

  @Input({ required: true }) ajuda!: AjudaInstalacao;
  @Input() computador = false;

  @Output() fechar = new EventEmitter<void>();

  @ViewChild('botaoFechar') botaoFechar!: ElementRef<HTMLButtonElement>;

  readonly enderecoOficial = ENDERECO_OFICIAL;
  enderecoCopiado = false;

  private readonly focoAnterior = document.activeElement as HTMLElement | null;

  ngAfterViewInit(): void {
    this.botaoFechar.nativeElement.focus();
  }

  ngOnDestroy(): void {
    this.focoAnterior?.focus?.();
  }

  @HostListener('keydown.escape')
  aoPressionarEsc(): void {
    this.fechar.emit();
  }

  copiarEndereco(): void {
    navigator.clipboard?.writeText(location.href.split('#')[0])
      .then(() => this.enderecoCopiado = true)
      .catch(() => this.enderecoCopiado = false);
  }
}
