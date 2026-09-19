import { Routes } from '@angular/router';

/** As duas telas usam lazy loading; raiz e caminhos desconhecidos convergem para /operacao. */
export const routes: Routes = [
  { path: 'operacao', loadComponent: () => import('./features/operacao/operacao.page').then(m => m.OperacaoPage) },
  { path: 'pedidos', loadComponent: () => import('./features/pedidos/pedidos.page').then(m => m.PedidosPage) },
  { path: '', pathMatch: 'full', redirectTo: 'operacao' },
  { path: '**', redirectTo: 'operacao' },
];
