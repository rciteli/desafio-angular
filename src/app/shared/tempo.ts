/** Retorna o delta até o prazo; valores negativos significam pedido atrasado. */
export function tempoRestante(prometidoPara: string, agoraServidor: number): number {
  return Date.parse(prometidoPara) - agoraServidor;
}

export function formatarRestante(milisegundos: number): string {
  const segundos = Math.ceil(Math.abs(milisegundos) / 1000);
  const minutos = Math.floor(segundos / 60);
  const duracao = `${minutos}:${String(segundos % 60).padStart(2, '0')}`;
  return milisegundos < 0 ? `Atrasado há ${duracao}` : `Faltam ${duracao}`;
}

// Fuso explícito para não depender da configuração de timezone do navegador.
const formato = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
});

export function horarioSaoPaulo(iso: string): string {
  return formato.format(new Date(iso));
}
