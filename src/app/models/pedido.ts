/** Estados aceitos pelo contrato da API. */
export type PedidoStatus = 'RECEBIDO' | 'EM_PREPARO' | 'PRONTO' | 'EM_ROTA' | 'ENTREGUE' | 'CANCELADO';

/** Payload completo de um pedido. */
export interface Pedido {
  id: number;
  codigo: string;
  clienteNome: string;
  enderecoResumo: string;
  status: PedidoStatus;
  valorTotal: number;
  criadoEm: string;
  prometidoPara: string;
  /** Versão monotônica usada para ignorar eventos SSE antigos ou repetidos. */
  versao: number;
}

export interface HorarioServidor { servidorEm: string; }

export interface PaginaPedidos extends HorarioServidor {
  conteudo: Pedido[];
  pagina: number;
  tamanho: number;
  total: number;
  totalPaginas: number;
}

/** Parâmetros enviados a GET /pedidos; o histórico não filtra registros no navegador. */
export interface FiltrosPedidos {
  page: number;
  size: number;
  status?: PedidoStatus;
  busca?: string;
  ordenarPor: 'prometidoPara' | 'criadoEm';
  ordem: 'asc' | 'desc';
}

export interface TransicaoPedido { para: PedidoStatus; motivo: string | null; }
// O enunciado diz "pedido atualizado" e servidorEm em toda resposta, sem envelope.
export type RespostaTransicao = Pedido & HorarioServidor;

export interface ErroApi {
  timestamp: string;
  status: number;
  error: string;
  message: string;
  path: string;
  // O exemplo do erro omite o campo, apesar da regra geral sobre toda resposta.
  servidorEm?: string;
}

export interface PedidoCriado extends HorarioServidor { pedido: Pedido; }
/** Evento SSE compacto: não contém os demais campos do pedido. */
export interface PedidoTransicionado extends HorarioServidor {
  pedidoId: number;
  para: PedidoStatus;
  versao: number;
}
export type EstadoConexao = 'conectando' | 'conectado' | 'reconectando';
