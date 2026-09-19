import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { API_BASE_URL } from './api.config';
import { PedidosService } from './pedidos.service';
import { RelogioService } from './relogio.service';

describe('PedidosService: contrato HTTP', () => {
  let api: PedidosService;
  let http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    api = TestBed.inject(PedidosService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('envia filtros/paginação e sincroniza somente depois de receber servidorEm', () => {
    const relogio = TestBed.inject(RelogioService);
    expect(relogio.agora()).toBeNull();
    api.listar({ page: 2, size: 20, status: 'PRONTO', busca: 'Maria Silva', ordenarPor: 'criadoEm', ordem: 'desc' }).subscribe();
    const req = http.expectOne(r => r.url === `${API_BASE_URL}/pedidos`);
    expect(req.request.method).toBe('GET');
    expect(Object.fromEntries(req.request.params.keys().map(key => [key, req.request.params.get(key)]))).toEqual({
      page: '2', size: '20', status: 'PRONTO', busca: 'Maria Silva', ordenarPor: 'criadoEm', ordem: 'desc',
    });
    const servidorEm = '2026-09-11T14:22:31-03:00';
    req.flush({ servidorEm, conteudo: [], pagina: 2, tamanho: 20, total: 0, totalPaginas: 0 });
    expect(relogio.agora()).toBe(Date.parse(servidorEm));
  });

  it('envia a transição na URL e no payload documentados', () => {
    api.transicionar(812, { para: 'CANCELADO', motivo: 'Cliente desistiu do pedido' }).subscribe();
    const req = http.expectOne(`${API_BASE_URL}/pedidos/812/transicoes`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ para: 'CANCELADO', motivo: 'Cliente desistiu do pedido' });
    req.flush({
      id: 812, codigo: 'PED-0812', clienteNome: 'Maria Silva', enderecoResumo: 'Rua das Acácias, 210',
      status: 'CANCELADO', versao: 4, valorTotal: 87.4,
      criadoEm: '2026-09-11T14:02:00-03:00', prometidoPara: '2026-09-11T14:47:00-03:00',
      servidorEm: '2026-09-11T14:22:31-03:00',
    });
  });
});
