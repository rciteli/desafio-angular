import { HttpErrorResponse } from '@angular/common/http';
import { ErroApi } from '../models/pedido';

/** Faz narrowing seguro de HttpErrorResponse para o formato documentado pela API. */
export function corpoErro(erro: unknown): ErroApi | null {
  if (!(erro instanceof HttpErrorResponse)) return null;
  const corpo: unknown = erro.error;
  if (typeof corpo !== 'object' || corpo === null || !('message' in corpo)
    || typeof corpo.message !== 'string') return null;
  return corpo as ErroApi;
}

export function mensagemErro(erro: unknown, alternativa: string): string {
  return corpoErro(erro)?.message || alternativa;
}
