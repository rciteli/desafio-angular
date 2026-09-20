import { describe, expect, it } from 'vitest';
import { transicoesPermitidas } from './regras-pedido';

/// Testes unitários para a função transicoesPermitidas
describe('transicoesPermitidas', () => {
  it('oferece somente as transições do contrato, incluindo estados finais', () => {
    expect(transicoesPermitidas('RECEBIDO')).toEqual(['EM_PREPARO', 'CANCELADO']);
    expect(transicoesPermitidas('EM_PREPARO')).toEqual(['PRONTO', 'CANCELADO']);
    expect(transicoesPermitidas('PRONTO')).toEqual(['EM_ROTA']);
    expect(transicoesPermitidas('EM_ROTA')).toEqual(['ENTREGUE']);
    expect(transicoesPermitidas('ENTREGUE')).toEqual([]);
    expect(transicoesPermitidas('CANCELADO')).toEqual([]);
  });
});
