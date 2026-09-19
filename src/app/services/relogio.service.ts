import { DestroyRef, Injectable, computed, inject, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class RelogioService {
  private readonly offset = signal<number | null>(null);
  private readonly local = signal(Date.now());
  readonly agora = computed(() => {
    const offset = this.offset();
    return offset === null ? null : this.local() + offset;
  });

  constructor() {
    const timer = setInterval(() => this.local.set(Date.now()), 1000);
    inject(DestroyRef).onDestroy(() => clearInterval(timer));
  }

  sincronizar(servidorEm: string): void {
    if (this.offset() !== null) return;
    const servidor = Date.parse(servidorEm);
    if (!Number.isFinite(servidor)) return;
    const local = Date.now();
    this.local.set(local);
    this.offset.set(servidor - local);
  }
}
