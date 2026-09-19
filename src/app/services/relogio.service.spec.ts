import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RelogioService } from './relogio.service';

describe('RelogioService', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  it('calcula o offset somente na primeira sincronização válida', () => {
    const agoraLocal = vi.spyOn(Date, 'now').mockReturnValue(1_000);
    const relogio = TestBed.inject(RelogioService);

    relogio.sincronizar(new Date(5_000).toISOString());
    expect(relogio.agora()).toBe(5_000);

    agoraLocal.mockReturnValue(2_000);
    relogio.sincronizar(new Date(9_000).toISOString());
    expect(relogio.agora()).toBe(5_000);
  });
});
