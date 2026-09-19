import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { EstadoConexao, HorarioServidor, PedidoCriado, PedidoTransicionado } from '../models/pedido';
import { API_BASE_URL } from './api.config';
import { RelogioService } from './relogio.service';

@Injectable()
export class OperacaoStreamService {
  private readonly relogio = inject(RelogioService);
  private source?: EventSource;
  readonly conexao = signal<EstadoConexao>('conectando');

  constructor() {
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
    source.addEventListener('heartbeat', (evento: MessageEvent<string>) => this.ler<HorarioServidor>(evento));
  }

  private ler<T extends HorarioServidor>(evento: MessageEvent<string>): T | null {
    try {
      const dados = JSON.parse(evento.data) as T;
      this.relogio.sincronizar(dados.servidorEm);
      return dados;
    } catch {
      return null;
    }
  }
}
