import { Component, OnDestroy, OnInit, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { LojaPublica, LojaService, Posicao } from '../../services/loja.service';
import { VERSAO_APP } from '../../versao';

// Mesma chave guardada pelo /admin (painel-admin): quem já entrou lá não digita de novo.
const CHAVE_STORAGE = 'preconamao.admin.chaveRelatorio';

// /admin/posicao — "Registrar a posição desta loja". Aberto no celular, de dentro da loja: o GPS
// vai refinando a medida (a margem de erro cai nos primeiros segundos) e a melhor leitura é gravada
// como a posição da loja da chave de relatório.
@Component({
  selector: 'app-registrar-posicao',
  standalone: true,
  templateUrl: './registrar-posicao.component.html',
  styleUrls: ['../familia/familia.css', './registrar-posicao.component.css']
})
export class RegistrarPosicaoComponent implements OnInit, OnDestroy {

  readonly versaoApp = VERSAO_APP;

  readonly chave = signal(this.lerChave());
  readonly lojaAtual = signal<LojaPublica | null>(null);
  readonly medindo = signal(false);
  // Melhor leitura (menor margem de erro) desde que tocou em "Medir".
  readonly melhor = signal<Posicao | null>(null);
  readonly leituras = signal(0);
  readonly gravando = signal(false);
  readonly gravada = signal<LojaPublica | null>(null);
  readonly erro = signal<string | null>(null);

  private vigia?: number;

  constructor(private loja: LojaService) {}

  ngOnInit(): void {
    // A loja da chave ainda não é conhecida aqui; mostra a primeira (piloto) como referência.
    this.loja.carregar().then(lojas => this.lojaAtual.set(lojas[0] ?? null)).catch(() => undefined);
  }

  medir(): void {
    if (!navigator.geolocation) {
      this.erro.set('Este navegador não informa a localização.');
      return;
    }
    this.pararMedicao();
    this.erro.set(null);
    this.gravada.set(null);
    this.melhor.set(null);
    this.leituras.set(0);
    this.medindo.set(true);
    this.vigia = navigator.geolocation.watchPosition(
      p => {
        this.leituras.update(n => n + 1);
        const atual = { latitude: p.coords.latitude, longitude: p.coords.longitude, precisao: p.coords.accuracy };
        if (!this.melhor() || atual.precisao < this.melhor()!.precisao) {
          this.melhor.set(atual);
        }
      },
      e => {
        this.pararMedicao();
        this.erro.set(e.code === 1
          ? 'A localização está bloqueada para este site. Libere nas configurações do navegador.'
          : 'Não foi possível obter a localização. Ligue o GPS e tente de novo.');
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 30_000 },
    );
  }

  pararMedicao(): void {
    if (this.vigia !== undefined) {
      navigator.geolocation.clearWatch(this.vigia);
      this.vigia = undefined;
    }
    this.medindo.set(false);
  }

  gravar(campoChave: string, campoRaio: string): void {
    const posicao = this.melhor();
    const chave = campoChave.trim();
    if (!posicao) {
      return;
    }
    if (!chave) {
      this.erro.set('Digite a chave de relatório da loja.');
      return;
    }
    const raio = campoRaio.trim() ? Number(campoRaio) : null;
    if (raio !== null && (!Number.isInteger(raio) || raio < 10 || raio > 2000)) {
      this.erro.set('O raio deve ser um número inteiro entre 10 e 2000 metros.');
      return;
    }
    this.pararMedicao();
    this.gravando.set(true);
    this.erro.set(null);
    this.loja.registrarPosicao(chave, posicao.latitude, posicao.longitude, raio).subscribe({
      next: loja => {
        this.gravando.set(false);
        this.gravada.set(loja);
        this.lojaAtual.set(loja);
        this.chave.set(chave);
        try {
          localStorage.setItem(CHAVE_STORAGE, chave);
        } catch {
          // Só não fica lembrada.
        }
      },
      error: (e: HttpErrorResponse) => {
        this.gravando.set(false);
        this.erro.set(e.status === 401 ? 'Chave de relatório inválida.'
          : e.error?.mensagem ?? 'Não foi possível gravar. Verifique a internet e tente de novo.');
      },
    });
  }

  arredondar(valor: number): number {
    return Math.round(valor);
  }

  private lerChave(): string {
    try {
      return localStorage.getItem(CHAVE_STORAGE) ?? '';
    } catch {
      return '';
    }
  }

  ngOnDestroy(): void {
    this.pararMedicao();
  }
}
