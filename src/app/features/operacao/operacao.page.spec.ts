import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { EstadoConexao, Pedido, PedidoCriado, PedidoTransicionado } from '../../models/pedido';
import { API_BASE_URL } from '../../services/api.config';
import { OperacaoStreamService } from '../../services/operacao-stream.service';
import { OperacaoPage } from './operacao.page';

const servidorEm = '2026-09-11T14:22:31-03:00';
const fixturePedido: Pedido = {
  id: 812, codigo: 'PED-0812', clienteNome: 'Maria Silva', enderecoResumo: 'Rua das Acácias, 210',
  status: 'RECEBIDO', valorTotal: 87.4, criadoEm: '2026-09-11T14:02:00-03:00',
  prometidoPara: '2026-09-11T14:47:00-03:00', versao: 1,
};

describe('OperacaoPage: concorrência local', () => {
  let http: HttpTestingController;
  let aoTransicionar: (evento: PedidoTransicionado) => void;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    TestBed.overrideComponent(OperacaoPage, { set: { providers: [{
      provide: OperacaoStreamService,
      useValue: {
        conexao: signal<EstadoConexao>('conectado'),
        conectar: (_criar: (evento: PedidoCriado) => void, transicionar: (evento: PedidoTransicionado) => void) => {
          aoTransicionar = transicionar;
        },
      },
    }] } });
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  function iniciar() {
    const fixture = TestBed.createComponent(OperacaoPage);
    for (const req of http.match(r => r.url === `${API_BASE_URL}/pedidos`)) {
      const conteudo = req.request.params.get('status') === 'RECEBIDO' ? [fixturePedido] : [];
      req.flush({ servidorEm, conteudo, pagina: 1, tamanho: 20, total: conteudo.length, totalPaginas: 1 });
    }
    fixture.detectChanges();
    return fixture;
  }

  function pageStatus(fixture: { componentInstance: OperacaoPage }, id: number) {
    return fixture.componentInstance.cards().find(card => card.pedido.id === id)?.pedido.status;
  }

  it('reavalia cancelamento, ignora versões antigas e bloqueia clique duplo', () => {
    const fixture = iniciar();
    const page = fixture.componentInstance;
    page.abrirCancelamento(fixturePedido);
    page.editarMotivo('Cliente desistiu do pedido');
    aoTransicionar({ servidorEm, pedidoId: 812, para: 'EM_PREPARO', versao: 2 });
    expect(page.cancelamento()?.motivo).toBe('Cliente desistiu do pedido');
    aoTransicionar({ servidorEm, pedidoId: 812, para: 'PRONTO', versao: 3 });
    aoTransicionar({ servidorEm, pedidoId: 812, para: 'EM_PREPARO', versao: 2 });
    expect(page.cancelamento()).toBeNull();
    expect(page.cards()[0].pedido.status).toBe('PRONTO');
    page.transicionar(812, 'EM_ROTA');
    page.transicionar(812, 'EM_ROTA');
    const post = http.expectOne(`${API_BASE_URL}/pedidos/812/transicoes`);
    expect(post.request.body).toEqual({ para: 'EM_ROTA', motivo: null });
    aoTransicionar({ servidorEm, pedidoId: 812, para: 'ENTREGUE', versao: 5 });
    post.flush({ ...fixturePedido, servidorEm, status: 'EM_ROTA', versao: 4 });
    expect(page.cards()).toEqual([]);
    expect(page.processando().size).toBe(0);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Nenhum pedido ativo');
  });

  it('ressincroniza pedidos ativos uma vez para transições SSE de IDs desconhecidos', () => {
    const fixture = iniciar();
    const desconhecido = { ...fixturePedido, id: 999, codigo: 'PED-0999', versao: 1 };

    aoTransicionar({ servidorEm, pedidoId: 999, para: 'EM_PREPARO', versao: 2 });
    aoTransicionar({ servidorEm, pedidoId: 1000, para: 'PRONTO', versao: 3 });

    const snapshot = http.match(r => r.url === `${API_BASE_URL}/pedidos`);
    expect(snapshot).toHaveLength(4);
    expect(snapshot.every(req => req.request.params.has('status'))).toBe(true);
    for (const req of snapshot) {
      const conteudo = req.request.params.get('status') === 'RECEBIDO' ? [desconhecido] : [];
      req.flush({ servidorEm, conteudo, pagina: 1, tamanho: 20, total: conteudo.length, totalPaginas: 1 });
    }

    expect(pageStatus(fixture, 999)).toBe('EM_PREPARO');
    http.expectNone(r => r.url === `${API_BASE_URL}/pedidos` && !r.params.has('status'));
    fixture.destroy();
  });

  it('recupera o estado completo depois de 409 e exibe a mensagem do 422', () => {
    const fixture = iniciar();
    const page = fixture.componentInstance;
    page.transicionar(812, 'EM_PREPARO');
    http.expectOne(`${API_BASE_URL}/pedidos/812/transicoes`).flush({
      timestamp: servidorEm, status: 409, error: 'Conflict', message: 'O pedido já está em EM_ROTA', path: '/pedidos/812/transicoes',
    }, { status: 409, statusText: 'Conflict' });
    expect(page.processando().has(812)).toBe(true);
    const consulta = http.expectOne(r => r.url === `${API_BASE_URL}/pedidos`);
    expect(consulta.request.params.has('status')).toBe(false);
    consulta.flush({ servidorEm, conteudo: [{ ...fixturePedido, status: 'EM_ROTA', versao: 4 }], pagina: 1, tamanho: 20, total: 1, totalPaginas: 1 });
    expect(page.cards()[0].pedido.status).toBe('EM_ROTA');
    expect(page.desatualizados().size).toBe(0);
    page.transicionar(812, 'ENTREGUE');
    http.expectOne(`${API_BASE_URL}/pedidos/812/transicoes`).flush({
      timestamp: servidorEm, status: 422, error: 'Unprocessable Entity', message: 'Transição inválida', path: '/pedidos/812/transicoes',
    }, { status: 422, statusText: 'Unprocessable Entity' });
    expect(page.cards()[0].pedido.status).toBe('EM_ROTA');
    expect(page.processando().size).toBe(0);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('Transição inválida');
  });
});
