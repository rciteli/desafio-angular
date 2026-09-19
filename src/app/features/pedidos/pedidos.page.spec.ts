import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API_BASE_URL } from '../../services/api.config';
import { PedidosPage } from './pedidos.page';

describe('PedidosPage: URL e API offline', () => {
  afterEach(() => vi.useRealTimers());

  it('restaura filtros da URL, exibe erro controlado e aguarda o debounce', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'pedidos', component: PedidosPage }]),
      provideHttpClient(), provideHttpClientTesting(),
    ] });
    const http = TestBed.inject(HttpTestingController);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/pedidos?page=2&status=PRONTO&busca=Maria&ordenarPor=criadoEm&ordem=desc', PedidosPage);
    const inicial = http.expectOne(r => r.url === `${API_BASE_URL}/pedidos`);
    expect(inicial.request.params.get('page')).toBe('2');
    expect(page.filtros().status).toBe('PRONTO');
    expect(page.busca()).toBe('Maria');
    inicial.error(new ProgressEvent('error'));
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Não foi possível carregar os pedidos.');
    vi.useFakeTimers();
    page.pesquisar('Jo');
    await vi.advanceTimersByTimeAsync(200);
    page.pesquisar('João');
    await vi.advanceTimersByTimeAsync(299);
    http.expectNone(r => r.url === `${API_BASE_URL}/pedidos`);
    await vi.advanceTimersByTimeAsync(1);
    const busca = http.expectOne(r => r.url === `${API_BASE_URL}/pedidos`);
    expect(busca.request.params.get('busca')).toBe('João');
    expect(busca.request.params.get('page')).toBe('1');
    expect(TestBed.inject(Router).url).toContain('page=1');
    busca.flush({ servidorEm: '2026-09-11T14:22:31-03:00', conteudo: [], pagina: 1, tamanho: 20, total: 0, totalPaginas: 0 });
    harness.detectChanges();
    expect(harness.routeNativeElement?.textContent).toContain('Nenhum pedido encontrado.');
    http.verify();
  });
});
