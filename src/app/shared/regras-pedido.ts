import { PedidoStatus } from '../models/pedido';

/** Labels de apresentação, separados dos valores usados no contrato HTTP. */
export const STATUS_LABELS: Record<PedidoStatus, string> = {
  RECEBIDO: 'Recebido', EM_PREPARO: 'Em preparo', PRONTO: 'Pronto',
  EM_ROTA: 'Em rota', ENTREGUE: 'Entregue', CANCELADO: 'Cancelado',
};
export const STATUS_PEDIDOS = Object.keys(STATUS_LABELS) as PedidoStatus[];
/** Estados exibidos na operação; ENTREGUE e CANCELADO são finais. */
export const STATUS_ATIVOS: readonly PedidoStatus[] = ['RECEBIDO', 'EM_PREPARO', 'PRONTO', 'EM_ROTA'];

/** Fonte única das regras de transição para evitar condicionais espalhadas pelos templates. */
const TRANSICOES: Record<PedidoStatus, readonly PedidoStatus[]> = {
  RECEBIDO: ['EM_PREPARO', 'CANCELADO'],
  EM_PREPARO: ['PRONTO', 'CANCELADO'],
  PRONTO: ['EM_ROTA'],
  EM_ROTA: ['ENTREGUE'],
  ENTREGUE: [],
  CANCELADO: [],
};

/* Retorna os status permitidos a partir do status atual, para habilitar/desabilitar botões de ação. */
export function transicoesPermitidas(status: PedidoStatus): readonly PedidoStatus[] {
  return TRANSICOES[status];
}
