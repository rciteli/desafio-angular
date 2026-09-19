import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { EstadoConexao, HorarioServidor, PedidoCriado, PedidoTransicionado } from '../models/pedido';
import { API_BASE_URL } from './api.config';
import { RelogioService } from './relogio.service';

/**
 * Encapsula o EventSource da operação.
 * A reconexão é delegada ao navegador, sem implementar retry manual.
 */
@Injectable()
export class OperacaoStreamService {
  private readonly relogio = inject(RelogioService);
  private source?: EventSource;
  readonly conexao = signal<EstadoConexao>('conectando');

  constructor() {
    // O service é fornecido pela OperacaoPage e encerra o stream ao sair da rota.
    inject(DestroyRef).onDestroy(() => this.source?.close());
  }

  conectar(aoCriar: (evento: PedidoCriado) => void,
    aoTransicionar: (evento: PedidoTransicionado) => void): void {
    this.source?.close();
    const source = this.source = new EventSource(`${API_BASE_URL}/operacao/stream`);
    source.onopen = () => this.conexao.set('conectado');
    source.onerror = () => this.conexao.set('reconectando');
    source.addEventListener('pedido.criado', (evento: MessageEvent<string>) => {
      const dados = this.ler<PedidoCriado>(evento);
      if (dados) aoCriar(dados);
    });
    source.addEventListener('pedido.transicionado', (evento: MessageEvent<string>) => {
      const dados = this.ler<PedidoTransicionado>(evento);
      if (dados) aoTransicionar(dados);
    });
    // Heartbeat não altera pedidos, mas também pode fornecer o primeiro `servidorEm`.
    source.addEventListener('heartbeat', (evento: MessageEvent<string>) => this.ler<HorarioServidor>(evento));
  }

  private ler<T extends HorarioServidor>(evento: MessageEvent<string>): T | null {
    try {
      const dados = JSON.parse(evento.data) as T;
      this.relogio.sincronizar(dados.servidorEm);
      return dados;
    } catch {
      // Um evento malformado é ignorado sem derrubar a conexão SSE.
      return null;
    }
  }
}
