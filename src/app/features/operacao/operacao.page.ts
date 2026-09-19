import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { EMPTY, Subject, catchError, exhaustMap, finalize, switchMap } from 'rxjs';
import { Pedido, PedidoStatus, PedidoTransicionado } from '../../models/pedido';
import { PedidosService } from '../../services/pedidos.service';
import { OperacaoStreamService } from '../../services/operacao-stream.service';
import { RelogioService } from '../../services/relogio.service';
import { mensagemErro } from '../../shared/erro-api';
import { STATUS_ATIVOS, STATUS_LABELS, transicoesPermitidas } from '../../shared/regras-pedido';
import { formatarRestante, horarioSaoPaulo, tempoRestante } from '../../shared/tempo';

/** Painel em tempo real: concilia snapshot HTTP e eventos SSE usando `versao`. */
@Component({
  selector: 'app-operacao', standalone: true,
  templateUrl: './operacao.page.html', styleUrl: './operacao.page.scss',
  providers: [OperacaoStreamService],
})
export class OperacaoPage {
  private readonly api = inject(PedidosService);
  private readonly destroyRef = inject(DestroyRef);
  readonly stream = inject(OperacaoStreamService);
  readonly relogio = inject(RelogioService);
  /** Map por ID evita duplicação e simplifica a conciliação de snapshots e eventos. */
  private readonly pedidos = signal(new Map<number, Pedido>());
  /** Transições recebidas antes do payload completo ficam pendentes para conciliação posterior. */
  private readonly eventosPendentes = new Map<number, PedidoTransicionado>();
  private readonly consultas = new Set<number>();
  private readonly carga = new Subject<void>();
  private readonly ressincronizacao = new Subject<void>();
  readonly processando = signal(new Set<number>());
  readonly desatualizados = signal(new Set<number>());
  readonly carregando = signal(false);
  readonly erro = signal('');
  readonly mensagem = signal('');
  readonly cancelamento = signal<{ id: number; motivo: string } | null>(null);
  readonly labels = STATUS_LABELS;
  readonly horario = horarioSaoPaulo;
  readonly acoes = transicoesPermitidas;
  readonly labelsAcoes: Partial<Record<PedidoStatus, string>> = {
    EM_PREPARO: 'Iniciar preparo', PRONTO: 'Marcar pronto', EM_ROTA: 'Saiu para entrega',
    ENTREGUE: 'Confirmar entrega', CANCELADO: 'Cancelar',
  };
  readonly cards = computed(() => {
    const agora = this.relogio.agora();
    return [...this.pedidos().values()].filter(p => STATUS_ATIVOS.includes(p.status)).map(pedido => {
      const restante = agora === null ? null : tempoRestante(pedido.prometidoPara, agora);
      return { pedido, restante, texto: restante === null ? 'Aguardando horário do servidor' : formatarRestante(restante) };
    });
  });

  constructor() {
    // Carga principal: switchMap cancela uma carga anterior se houver nova tentativa manual.
    this.carga.pipe(
      switchMap(() => {
        this.carregando.set(true);
        this.erro.set('');
        return this.api.listarAtivos().pipe(
          catchError((erro: unknown) => {
            this.erro.set(mensagemErro(erro, 'Não foi possível carregar os pedidos.'));
            return EMPTY;
          }),
          finalize(() => this.carregando.set(false)),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(pedidos => pedidos.forEach(pedido => this.aplicarPedido(pedido)));
    // Snapshots corretivos usam exhaustMap para impedir chamadas concorrentes durante replay do SSE.
    this.ressincronizacao.pipe(
      exhaustMap(() => this.api.listarAtivos().pipe(
        catchError((erro: unknown) => {
          this.erro.set(mensagemErro(erro, 'Não foi possível ressincronizar os pedidos.'));
          return EMPTY;
        }),
      )),
      takeUntilDestroyed(),
    ).subscribe(pedidos => pedidos.forEach(pedido => this.aplicarPedido(pedido)));
    // O stream abre em paralelo à carga inicial para reduzir a janela de perda de mudanças.
    this.stream.conectar(
      evento => this.aplicarPedido(evento.pedido),
      evento => this.aplicarTransicao(evento),
    );
    this.recarregar();
  }

  recarregar(): void {
    this.carga.next();
    this.desatualizados().forEach(id => this.consultarPedido(id));
  }

  /** A maior `versao` conhecida sempre vence, inclusive sobre respostas HTTP atrasadas. */
  private aplicarPedido(recebido: Pedido): void {
    const atual = this.pedidos().get(recebido.id);
    let pedido = atual && atual.versao >= recebido.versao ? atual : recebido;
    const evento = this.eventosPendentes.get(pedido.id);
    if (evento && evento.versao > pedido.versao) {
      pedido = { ...pedido, status: evento.para, versao: evento.versao };
    }
    this.eventosPendentes.delete(pedido.id);
    if (atual !== pedido) {
      this.pedidos.update(pedidos => new Map(pedidos).set(pedido.id, pedido));
      this.conferirCancelamento(pedido);
    }
  }

  private aplicarTransicao(evento: PedidoTransicionado): void {
    const atual = this.pedidos().get(evento.pedidoId);
    const versao = atual?.versao ?? this.eventosPendentes.get(evento.pedidoId)?.versao ?? -1;
    // Reconexões podem reenviar eventos já aplicados.
    if (evento.versao <= versao) return;
    if (atual) {
      this.aplicarPedido({ ...atual, status: evento.para, versao: evento.versao });
    } else {
      // Uma transição pode chegar antes do payload completo do pedido. Guardamos
      // a versão mais nova e pedimos um único snapshot dos pedidos ativos. O
      // exhaustMap impede snapshots paralelos durante replay/reconexão do SSE.
      this.eventosPendentes.set(evento.pedidoId, evento);
      if (STATUS_ATIVOS.includes(evento.para)) this.ressincronizacao.next();
    }
  }

  private consultarPedido(id: number): void {
    if (this.consultas.has(id)) return;
    this.consultas.add(id);
    this.api.buscarPedido(id).pipe(
      finalize(() => this.consultas.delete(id)),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe({
      next: pedido => this.receberConsulta(id, pedido),
      error: () => this.falhaConsulta(id),
    });
  }

  private receberConsulta(id: number, pedido: Pedido | null): void {
    if (!pedido) { this.falhaConsulta(id); return; }
    this.aplicarPedido(pedido);
    this.desatualizados.update(ids => { const copia = new Set(ids); copia.delete(id); return copia; });
  }

  private falhaConsulta(id: number): void {
    this.desatualizados.update(ids => new Set(ids).add(id));
    this.erro.set('Não foi possível sincronizar um pedido. Tente novamente para liberar suas ações.');
  }

  abrirCancelamento(pedido: Pedido): void {
    if (!this.acoes(pedido.status).includes('CANCELADO')) return;
    this.cancelamento.set({ id: pedido.id, motivo: '' });
  }

  editarMotivo(motivo: string): void {
    this.cancelamento.update(form => form ? { ...form, motivo } : null);
  }

  confirmarCancelamento(event: Event): void {
    event.preventDefault();
    const form = this.cancelamento();
    if (form) this.transicionar(form.id, 'CANCELADO', form.motivo.trim());
  }

  private conferirCancelamento(pedido: Pedido): void {
    if (this.cancelamento()?.id === pedido.id && !this.acoes(pedido.status).includes('CANCELADO')) {
      this.cancelamento.set(null);
      this.mensagem.set(`${pedido.codigo} está ${this.labels[pedido.status].toLowerCase()}. O formulário de cancelamento foi fechado.`);
    }
  }

  transicionar(id: number, para: PedidoStatus, motivo: string | null = null): void {
    const pedido = this.pedidos().get(id);
    if (!pedido || this.processando().has(id) || this.desatualizados().has(id)
      || !this.acoes(pedido.status).includes(para)) return;
    if (para === 'CANCELADO' && (!motivo || motivo.trim().length < 10)) return;
    this.processando.update(ids => new Set(ids).add(id));
    this.mensagem.set('');
    this.api.transicionar(id, { para, motivo }).pipe(
      catchError((erro: unknown) => {
        this.mensagem.set(mensagemErro(erro, 'Não foi possível alterar o pedido. Verifique a conexão.'));
        if (erro instanceof HttpErrorResponse && erro.status === 409) {
          // O estado local perdeu uma corrida; novas ações ficam bloqueadas até recuperar o servidor.
          this.desatualizados.update(ids => new Set(ids).add(id));
          return this.api.buscarPedido(id).pipe(
            catchError(() => { this.falhaConsulta(id); return EMPTY; }),
          );
        }
        return EMPTY;
      }),
      finalize(() => this.processando.update(ids => { const copia = new Set(ids); copia.delete(id); return copia; })),
      takeUntilDestroyed(this.destroyRef),
    ).subscribe(pedidoAtualizado => this.receberConsulta(id, pedidoAtualizado));
  }
}
