import { PedidoStatus } from '../models/pedido';

export const STATUS_LABELS: Record<PedidoStatus, string> = {
  RECEBIDO: 'Recebido', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto',
  EM_ROTA: 'Em rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
export const STATUS_PEDIDOS = Object.keys(STATUS_LABELS) as PedidoStatus[];
export const STATUS_ATIVOS: readonly PedidoStatus[] = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ROTA'];

const TRANSICOES: Record<PedidoStatus, readonly PedidoStatus[]> = {
  RECEBIDO: ['EM_PREPARO', 'CANCELADO'],
  EM_PREPARO: ['PRONTO', 'CANCELADO'],
  PRONTO: ['EM_ROTA'],
  EM_ROTA: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

export function transicoesPermitidas(status: PedidoStatus): readonly PedidoStatus[] {
  return TRANSICOES[status];
}
