import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

/**
 * Mantém o horário oficial da interface a partir do primeiro `servidorEm` válido.
 * O offset é calculado uma única vez e reutilizado em todos os cálculos de prazo.
 */
@Injectable({ providedIn: 'root' })
export class RelogioService {
  private readonly offset = signal<number | null>(null);
  private readonly local = signal(Date.now());
  readonly agora = computed(() => {
    const offset = this.offset();
    return offset === null ? null : this.local() + offset;
  });

  constructor() {
    // Um único timer compartilhado atualiza todos os cards; não existe intervalo por pedido.
    const timer = setInterval(() => this.local.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  sincronizar(servidorEm: string): void {
    // O desafio pede que a diferença entre relógio local e servidor seja capturada uma única vez.
    if (this.offset() !== null) return;
    const servidor = Date.parse(servidorEm);
    if (!Number.isFinite(servidor)) return;
    const local = Date.now();
    this.local.set(local);
    this.offset.set(servidor - local);
  }
}
