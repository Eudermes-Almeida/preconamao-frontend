import { Component, EventEmitter, HostListener, Input, OnInit, Output, signal } from '@angular/core';
import { ErroFamilia, FamiliaService } from '../../services/familia.service';
import { AvisosFamiliaComponent } from './avisos-familia.component';

// Aceitar um convite da Família: aberto pelo link /familia/<código> ou por "Tenho um convite".
// Pergunta o nome da pessoa (só na primeira vez) e como ela quer chamar quem convidou; no "Pronto!",
// oferece ativar os avisos no celular.
@Component({
  selector: 'app-convite-familia',
  standalone: true,
  imports: [AvisosFamiliaComponent],
  templateUrl: './convite-familia.component.html',
  styleUrl: './familia.css'
})
export class ConviteFamiliaComponent implements OnInit {

  @Input({ required: true }) codigo!: string;
  @Output() fechar = new EventEmitter<void>();

  readonly etapa = signal<'carregando' | 'aceitar' | 'feito' | 'erro'>('carregando');
  readonly deNome = signal('');
  readonly erro = signal<string | null>(null);
  readonly enviando = signal(false);

  constructor(public familia: FamiliaService) {}

  async ngOnInit(): Promise<void> {
    try {
      const convite = await this.familia.consultarConvite(this.codigo);
      this.deNome.set(convite.deNome ?? 'Alguém');
      switch (convite.situacao) {
        case 'VALIDO':
          this.etapa.set('aceitar');
          break;
        case 'USADO':
          this.falhar('Este convite já foi usado. Peça um novo para quem enviou.');
          break;
        case 'VENCIDO':
          this.falhar('Este convite venceu. Peça um novo para quem enviou.');
          break;
        default:
          this.falhar('Este convite foi criado neste celular. Envie o link para a outra pessoa abrir no celular dela.');
      }
    } catch (erro) {
      this.falhar(erro instanceof ErroFamilia ? erro.message : 'Não foi possível abrir o convite.');
    }
  }

  async confirmar(form: HTMLFormElement): Promise<void> {
    const campo = (nome: string) => (form.elements.namedItem(nome) as HTMLInputElement | null)?.value ?? '';
    const nome = campo('nome');
    const apelido = campo('apelido');
    if (!this.familia.nome() && !nome.trim()) {
      this.erro.set('Digite o seu nome.');
      return;
    }
    if (!apelido.trim()) {
      this.erro.set(`Digite como quer chamar ${this.deNome()}.`);
      return;
    }
    this.enviando.set(true);
    this.erro.set(null);
    try {
      if (!this.familia.nome()) {
        await this.familia.definirNome(nome);
      }
      await this.familia.aceitarConvite(this.codigo, apelido);
      this.etapa.set('feito');
    } catch (erro) {
      this.erro.set(erro instanceof ErroFamilia ? erro.message : 'Algo deu errado. Tente de novo.');
    } finally {
      this.enviando.set(false);
    }
  }

  @HostListener('keydown.escape')
  aoPressionarEsc(): void {
    this.fechar.emit();
  }

  private falhar(mensagem: string): void {
    this.erro.set(mensagem);
    this.etapa.set('erro');
  }
}
