import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OperacaoStreamService } from './operacao-stream.service';

class EventSourceMock {
  static instances: EventSourceMock[] = [];
  onopen: ((event: Event) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  readonly listeners = new Map<string, Array<(event: MessageEvent<string>) => void>>();

  constructor(readonly url: string) {
    EventSourceMock.instances.push(this);
  }

  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  close(): void {}
}

describe('OperacaoStreamService: reconexão', () => {
  beforeEach(() => {
    EventSourceMock.instances = [];
    vi.stubGlobal('EventSource', EventSourceMock);
    TestBed.configureTestingModule({ providers: [OperacaoStreamService] });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    TestBed.resetTestingModule();
  });

  it('não ressincroniza no primeiro open e solicita um snapshot depois de erro + reconexão', () => {
    const service = TestBed.inject(OperacaoStreamService);
    const aoReconectar = vi.fn();

    service.conectar(vi.fn(), vi.fn(), aoReconectar);
    const source = EventSourceMock.instances[0];

    source.onopen?.(new Event('open'));
    expect(service.conexao()).toBe('conectado');
    expect(aoReconectar).not.toHaveBeenCalled();

    source.onerror?.(new Event('error'));
    source.onerror?.(new Event('error'));
    expect(service.conexao()).toBe('reconectando');

    source.onopen?.(new Event('open'));
    expect(service.conexao()).toBe('conectado');
    expect(aoReconectar).toHaveBeenCalledTimes(1);

    source.onopen?.(new Event('open'));
    expect(aoReconectar).toHaveBeenCalledTimes(1);
  });
});
