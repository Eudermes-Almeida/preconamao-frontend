import { Component, EventEmitter, HostListener, Output, signal } from '@angular/core';
import { Convite, ContatoFamilia, ErroFamilia, FamiliaService } from '../../services/familia.service';
import { AvisosFamiliaComponent } from './avisos-familia.component';

// Botão "Família" da pré-lista: o nome deste celular, as pessoas ligadas a ele (com "Remover"),
// "Avisos no celular", "Convidar alguém da família" (convite pelo WhatsApp) e "Tenho um convite"
// (código digitado).
@Component({
  selector: 'app-familia-painel',
  standalone: true,
  imports: [AvisosFamiliaComponent],
  templateUrl: './familia-painel.component.html',
  styleUrl: './familia.css'
})
export class FamiliaPainelComponent {

  @Output() fechar = new EventEmitter<void>();

  readonly editandoNome = signal(false);
  readonly convite = signal<Convite | null>(null);
  readonly removendoId = signal<number | null>(null);
  readonly ocupado = signal(false);
  readonly erro = signal<string | null>(null);
  readonly conviteCopiado = signal(false);

  // Consulta na hora, pelo mesmo motivo da janela "Enviar lista".
  constructor(public familia: FamiliaService) {
    this.familia.atualizar();
  }

  async salvarNome(nome: string): Promise<void> {
    if (!nome.trim()) {
      this.erro.set('Digite o seu nome.');
      return;
    }
    await this.executar(async () => {
      await this.familia.definirNome(nome);
      this.editandoNome.set(false);
    });
  }

  async criarConvite(apelido: string): Promise<void> {
    if (!apelido.trim()) {
      this.erro.set('Digite como quer chamar quem vai receber o convite.');
      return;
    }
    await this.executar(async () => this.convite.set(await this.familia.criarConvite(apelido)));
  }

  // Link wa.me: abre o WhatsApp com a mensagem pronta, e a pessoa escolhe para quem mandar.
  linkWhatsapp(convite: Convite): string {
    return `https://wa.me/?text=${encodeURIComponent(this.familia.mensagemConvite(convite))}`;
  }

  copiarConvite(convite: Convite): void {
    navigator.clipboard?.writeText(this.familia.mensagemConvite(convite))
      .then(() => this.conviteCopiado.set(true))
      .catch(() => this.conviteCopiado.set(false));
  }

  codigoFormatado(convite: Convite): string {
    return `${convite.codigo.slice(0, 4)}-${convite.codigo.slice(4)}`;
  }

  // "Tenho um convite": a janela de aceitar (a mesma do link) assume daqui.
  usarCodigo(codigo: string): void {
    const limpo = codigo.toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (limpo.length !== 8) {
      this.erro.set('O código tem 8 letras e números (ex.: K7M2-Q9XP).');
      return;
    }
    this.fechar.emit();
    this.familia.convitePendente.set(limpo);
  }

  async remover(contato: ContatoFamilia): Promise<void> {
    await this.executar(async () => {
      await this.familia.removerContato(contato);
      this.removendoId.set(null);
    });
  }

  @HostListener('keydown.escape')
  aoPressionarEsc(): void {
    this.fechar.emit();
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
