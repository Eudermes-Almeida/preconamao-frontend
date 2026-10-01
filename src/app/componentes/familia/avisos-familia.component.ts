import { Component, Input, OnInit, signal } from '@angular/core';
import { ErroFamilia, FamiliaService } from '../../services/familia.service';

// "Avisos no celular" da Família: ativar/desativar o aviso (Web Push) de lista recebida e de
// convite aceito. Aparece no painel Família e no "Pronto!" de quem acabou de aceitar um convite
// (compacto = só o convite para ativar; some se já estiver ativo ou se o navegador não tiver push).
@Component({
  selector: 'app-avisos-familia',
  standalone: true,
  templateUrl: './avisos-familia.component.html',
  styleUrl: './familia.css'
})
export class AvisosFamiliaComponent implements OnInit {

  @Input() compacto = false;

  readonly ocupado = signal(false);
  readonly erro = signal<string | null>(null);

  constructor(public familia: FamiliaService) {}

  ngOnInit(): void {
    this.familia.prepararAvisos();
  }

  async ativar(): Promise<void> {
    await this.executar(() => this.familia.ativarAvisos());
  }

  async desativar(): Promise<void> {
    await this.executar(() => this.familia.desativarAvisos());
  }

  private async executar(acao: () => Promise<void>): Promise<void> {
    this.ocupado.set(true);
    this.erro.set(null);
    try {
      await acao();
    } catch (erro) {
      this.erro.set(erro instanceof ErroFamilia ? erro.message : 'Algo deu errado. Tente de novo.');
    } finally {
      this.ocupado.set(false);
    }
  }
}
