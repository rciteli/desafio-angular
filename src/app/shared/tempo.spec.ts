import { describe, expect, it } from 'vitest';
import { tempoRestante } from './tempo';

describe('tempoRestante', () => {
  it('calcula prazo futuro e ultrapassado usando a referência do servidor', () => {
    const agoraServidor = Date.parse('2026-09-11T14:22:31-03:00');
    expect(tempoRestante('2026-09-11T14:27:31-03:00', agoraServidor)).toBe(300_000);
    expect(tempoRestante('2026-09-11T14:20:31-03:00', agoraServidor)).toBe(-120_000);
  });
});
