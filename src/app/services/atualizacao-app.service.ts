import { Injectable, signal } from '@angular/core';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';

// Atualização automática de versão. O service worker guarda o app para abrir rápido e offline,
// mas por isso continua servindo a versão antiga até o app ser fechado de vez (no iPhone isso
// pode levar dias). Aqui:
// - logo ao abrir (primeiros segundos), versão nova pronta = recarrega sozinho, antes de a pessoa
//   começar a usar;
// - depois disso, só mostra a faixa "Nova versão disponível — Atualizar" (não interrompe a compra);
// - confere ao voltar para o app e a cada 30 min com a tela visível.
// Carrinho, pré-lista e Família ficam no localStorage: recarregar não perde nada.

const JANELA_INICIO_MS = 20_000;
const INTERVALO_VERIFICACAO_MS = 30 * 60_000;

@Injectable({
  providedIn: 'root'
})
export class AtualizacaoAppService {

  readonly novaVersao = signal(false);

  private readonly inicio = Date.now();
  private iniciado = false;

  constructor(private swUpdate: SwUpdate) {}

  iniciar(): void {
    if (this.iniciado || !this.swUpdate.isEnabled) {
      return;
    }
    this.iniciado = true;
    this.swUpdate.versionUpdates
      .pipe(filter(evento => evento.type === 'VERSION_READY'))
      .subscribe(() => {
        if (Date.now() - this.inicio < JANELA_INICIO_MS) {
          void this.atualizarAgora();
        } else {
          this.novaVersao.set(true);
        }
      });
    // Cache do service worker corrompido (raro): só recarregando.
    this.swUpdate.unrecoverable.subscribe(() => location.reload());
    this.verificar();
    document.addEventListener('visibilitychange', () => this.verificar());
    setInterval(() => this.verificar(), INTERVALO_VERIFICACAO_MS);
  }

  async atualizarAgora(): Promise<void> {
    try {
      await this.swUpdate.activateUpdate();
    } catch {
      // Sem versão para ativar: o reload abaixo já resolve.
    }
    location.reload();
  }

  private verificar(): void {
    if (document.visibilityState === 'visible') {
      this.swUpdate.checkForUpdate().catch(() => undefined);
    }
  }
}
