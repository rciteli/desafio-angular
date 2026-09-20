/** Retorna o delta (variação de tempo) até o prazo; valores negativos significam pedido atrasado. */
export function tempoRestante(prometidoPara: string, agoraServidor: number): number {
  return Date.parse(prometidoPara) - agoraServidor;
}

// Retorna uma string formatada com o tempo restante até o prazo, ou o tempo de atraso caso seja negativo.
export function formatarRestante(milisegundos: number): string {
  const segundos = Math.ceil(Math.abs(milisegundos) / 1000);
  const minutos = Math.floor(segundos / 60);
  const duracao = `${minutos}:${String(segundos % 60).padStart(2, '0')}`;
  return milisegundos < 0 ? `Atrasado há ${duracao}` : `Faltam ${duracao}`;
}

// Fuso explícito para não depender da configuração de timezone do navegador.
// Formatador de data e hora para o padrão brasileiro, com fuso de São Paulo. Ex.: 01/01/2024 12:00:00
const formato = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'medium',
});

// Retorna a data e hora formatada no fuso de São Paulo, a partir de uma string ISO.
export function horarioSaoPaulo(iso: string): string {
  return formato.format(new Date(iso));
}
