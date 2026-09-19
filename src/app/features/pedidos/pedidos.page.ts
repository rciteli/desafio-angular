import { Component, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { EMPTY, Subject, catchError, combineLatest, finalize, map, startWith, switchMap, timer } from 'rxjs';
import { FiltrosPedidos, PaginaPedidos } from '../../models/pedido';
import { PedidosService } from '../../services/pedidos.service';
import { mensagemErro } from '../../shared/erro-api';
import { STATUS_LABELS, STATUS_PEDIDOS } from '../../shared/regras-pedido';
import { horarioSaoPaulo } from '../../shared/tempo';

/** Converte query params em filtros válidos e aplica defaults seguros. */
function lerFiltros(params: ParamMap): FiltrosPedidos {
  const page = Number(params.get('page') ?? 1);
  return {
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
    size: 20,
    status: STATUS_PEDIDOS.find(status => status === params.get('status')),
    busca: params.get('busca')?.trim() || undefined,
    ordenarPor: params.get('ordenarPor') === 'criadoEm' ? 'criadoEm' : 'prometidoPara',
    ordem: params.get('ordem') === 'desc' ? 'desc' : 'asc',
  };
}

/** Histórico paginado cuja URL representa o estado persistente da consulta. */
@Component({
  selector: 'app-pedidos', standalone: true,
  templateUrl: './pedidos.page.html', styleUrl: './pedidos.page.scss',
})
export class PedidosPage {
  private readonly api = inject(PedidosService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly buscaDigitada = new Subject<string | null>();
  readonly recarga = new Subject<void>();
  readonly filtros = signal(lerFiltros(this.route.snapshot.queryParamMap));
  readonly busca = signal(this.filtros().busca ?? '');
  readonly pagina = signal<PaginaPedidos | null>(null);
  readonly carregando = signal(false);
  readonly erro = signal('');
  readonly statuses = STATUS_PEDIDOS;
  readonly labels = STATUS_LABELS;
  readonly horario = horarioSaoPaulo;

  constructor() {
    // switchMap cancela o timer anterior: só há busca após 300 ms sem nova digitação.
    this.buscaDigitada.pipe(
      switchMap(texto => texto === null ? EMPTY : timer(300).pipe(map(() => texto))),
      takeUntilDestroyed(),
    ).subscribe(texto => {
      if (texto.trim() !== (this.filtros().busca ?? '')) this.alterar({ busca: texto.trim() });
    });

    // Query params são a fonte persistente; `recarga` permite repetir a mesma URL manualmente.
    combineLatest([this.route.queryParamMap, this.recarga.pipe(startWith(undefined))]).pipe(
      switchMap(([params]) => {
        const filtros = lerFiltros(params);
        this.buscaDigitada.next(null);
        this.filtros.set(filtros);
        this.busca.set(filtros.busca ?? '');
        this.carregando.set(true);
        this.erro.set('');
        this.pagina.set(null);
        return this.api.listar(filtros).pipe(
          catchError((erro: unknown) => {
            this.erro.set(mensagemErro(erro, 'Não foi possível carregar os pedidos.'));
            return EMPTY;
          }),
          finalize(() => this.carregando.set(false)),
        );
      }),
      takeUntilDestroyed(),
    ).subscribe(pagina => this.pagina.set(pagina));
  }

  pesquisar(texto: string): void {
    this.busca.set(texto);
    this.buscaDigitada.next(texto);
  }

  selecionarStatus(valor: string): void {
    this.alterar({ status: this.statuses.find(status => status === valor) });
  }

  ordenar(campo: string): void {
    this.alterar({ ordenarPor: campo === 'criadoEm' ? 'criadoEm' : 'prometidoPara' });
  }

  mudarOrdem(ordem: string): void {
    this.alterar({ ordem: ordem === 'desc' ? 'desc' : 'asc' });
  }

  /** Atualiza a URL; o fluxo de queryParamMap é quem dispara a consulta HTTP. */
  alterar(mudanca: Partial<FiltrosPedidos>): void {
    const filtros = { ...this.filtros(), busca: this.busca().trim(), page: 1, ...mudanca };
    this.buscaDigitada.next(null);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        page: filtros.page, status: filtros.status ?? null, busca: filtros.busca || null,
        ordenarPor: filtros.ordenarPor, ordem: filtros.ordem,
      },
    });
  }
}
