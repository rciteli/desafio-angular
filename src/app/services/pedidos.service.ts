import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, catchError, expand, forkJoin, map, of, reduce, switchMap, tap, throwError } from 'rxjs';
import { FiltrosPedidos, PaginaPedidos, Pedido, RespostaTransicao, TransicaoPedido } from '../models/pedido';
import { corpoErro } from '../shared/erro-api';
import { STATUS_ATIVOS } from '../shared/regras-pedido';
import { API_BASE_URL } from './api.config';
import { RelogioService } from './relogio.service';

@Injectable({ providedIn: 'root' })
export class PedidosService {
  private readonly http = inject(HttpClient);
  private readonly relogio = inject(RelogioService);

  listar(filtros: FiltrosPedidos): Observable<PaginaPedidos> {
    let params = new HttpParams().set('page', filtros.page).set('size', filtros.size)
      .set('ordenarPor', filtros.ordenarPor).set('ordem', filtros.ordem);
    if (filtros.status) params = params.set('status', filtros.status);
    if (filtros.busca) params = params.set('busca', filtros.busca);
    return this.http.get<PaginaPedidos>(`${API_BASE_URL}/pedidos`, { params }).pipe(
      tap(resposta => this.relogio.sincronizar(resposta.servidorEm)),
      catchError((erro: unknown) => this.tratarErro(erro)),
    );
  }

  listarAtivos(): Observable<Pedido[]> {
    // O contrato aceita um status por chamada; cada grupo também é paginado.
    return forkJoin(STATUS_ATIVOS.map(status => {
      const filtros: FiltrosPedidos = { page: 1, size: 20, status, ordenarPor: 'criadoEm', ordem: 'asc' };
      return this.listar(filtros).pipe(
        expand(pagina => pagina.pagina < pagina.totalPaginas
          ? this.listar({ ...filtros, page: pagina.pagina + 1 }) : EMPTY),
        reduce((pedidos, pagina) => [...pedidos, ...pagina.conteudo], [] as Pedido[]),
      );
    })).pipe(map(grupos => grupos.flat()));
  }

  buscarPedido(id: number, page = 1): Observable<Pedido | null> {
    // Não há GET /pedidos/{id}. Esta varredura fica restrita à recuperação após 409.
    return this.listar({ page, size: 20, ordenarPor: 'criadoEm', ordem: 'asc' }).pipe(
      switchMap(pagina => {
        const pedido = pagina.conteudo.find(item => item.id === id);
        if (pedido) return of(pedido);
        return pagina.pagina < pagina.totalPaginas ? this.buscarPedido(id, page + 1) : of(null);
      }),
    );
  }

  transicionar(id: number, transicao: TransicaoPedido): Observable<RespostaTransicao> {
    return this.http.post<RespostaTransicao>(`${API_BASE_URL}/pedidos/${id}/transicoes`, transicao).pipe(
      tap(resposta => this.relogio.sincronizar(resposta.servidorEm)),
      catchError((erro: unknown) => this.tratarErro(erro)),
    );
  }

  private tratarErro(erro: unknown): Observable<never> {
    const servidorEm = corpoErro(erro)?.servidorEm;
    if (servidorEm) this.relogio.sincronizar(servidorEm);
    return throwError(() => erro);
  }
}
