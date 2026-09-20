# Testes e validação

## Requisitos mínimos

- Node.js compatível com `^24.15.0 || >=26.0.0`
- pnpm 11.19.0
- acesso à API oficial

## Suíte automatizada

Execute:

```bash
pnpm test
```

Último resultado validado:

```text
Test Files  7 passed (7)
Tests       11 passed (11)
```

## O que os testes cobrem

### `shared/tempo.spec.ts`

Valida o cálculo do tempo restante usando uma referência de tempo do servidor, incluindo prazo futuro e prazo já ultrapassado.

### `shared/regras-pedido.spec.ts`

Valida todas as transições permitidas:

```text
RECEBIDO -> EM_PREPARO | CANCELADO
EM_PREPARO -> PRONTO | CANCELADO
PRONTO -> EM_ROTA
EM_ROTA -> ENTREGUE
ENTREGUE -> nenhuma
CANCELADO -> nenhuma
```

### `services/relogio.service.spec.ts`

Valida que o offset entre servidor e cliente é calculado somente na primeira sincronização válida.

### `services/pedidos.service.spec.ts`

Valida:

- método HTTP;
- URL;
- montagem dos query parameters;
- sincronização com `servidorEm`;
- endpoint e payload de transição.

### `features/pedidos/pedidos.page.spec.ts`

Valida:

- restauração dos filtros a partir da URL;
- tratamento controlado de erro de rede;
- debounce de 300 ms;
- retorno para página 1 quando a busca muda;
- renderização de estado vazio.

### `services/operacao-stream.service.spec.ts`

Valida que o primeiro `onopen` não dispara carga adicional e que, após `onerror`, a próxima abertura solicita exatamente uma ressincronização.

### `features/operacao/operacao.page.spec.ts`

Valida cenários de concorrência da operação, incluindo:

- preservação/fechamento do formulário de cancelamento conforme o novo estado;
- deduplicação por versão;
- bloqueio de clique duplo;
- remoção visual de pedido finalizado;
- ressincronização controlada quando uma transição SSE chega antes do pedido completo;
- remoção de pedido ativo que desapareceu do snapshot;
- preservação de pedido que chegou por SSE durante um snapshot em andamento;
- tratamento de `409` e `422`.

## Build de produção

Execute:

```bash
pnpm build
```

O build foi validado com sucesso após a implementação atual.

## Validação manual da API

### Listagem

PowerShell:

```powershell
curl.exe -i --max-time 30 "https://orders-api.planumlabs.com/pedidos?page=1&size=20"
```

zsh/bash:

```bash
curl -i --max-time 30 \
  "https://orders-api.planumlabs.com/pedidos?page=1&size=20"
```

Resultado esperado:

```text
HTTP/1.1 200 OK
```

### Filtro usado pela operação

```bash
curl -i --max-time 30 \
  "https://orders-api.planumlabs.com/pedidos?page=1&size=20&ordenarPor=criadoEm&ordem=asc&status=RECEBIDO"
```

Repita, quando necessário, para:

```text
EM_PREPARO
PRONTO
EM_ROTA
```

### SSE

```bash
curl -N -i --max-time 30 \
  "https://orders-api.planumlabs.com/operacao/stream"
```

A conexão deve usar `text/event-stream` e pode emitir `heartbeat`, `pedido.criado` e `pedido.transicionado`.

## Roteiro manual no navegador

### `/operacao`

1. iniciar com `pnpm start`;
2. abrir `http://localhost:4200/operacao`;
3. abrir DevTools > Network;
4. verificar as requisições de cada status ativo;
5. verificar `/operacao/stream` ativo;
6. acompanhar criação de pedidos pelo SSE;
7. executar uma transição válida;
8. confirmar que o botão fica bloqueado durante a requisição;
9. testar cancelamento com menos de 10 caracteres;
10. testar cancelamento com motivo válido;
11. confirmar destaque abaixo de cinco minutos;
12. confirmar destaque quando atrasado.

### `/pedidos`

1. abrir `http://localhost:4200/pedidos`;
2. alterar status;
3. alterar ordenação;
4. avançar página;
5. digitar rapidamente no campo de busca e observar que não há uma requisição por tecla;
6. recarregar a página e confirmar restauração dos filtros;
7. usar voltar/avançar do navegador e confirmar atualização da tabela.

## DevTools

Durante validação da operação, o padrão esperado é:

```text
GET /pedidos?...status=RECEBIDO
GET /pedidos?...status=EM_PREPARO
GET /pedidos?...status=PRONTO
GET /pedidos?...status=EM_ROTA
GET /operacao/stream   (conexão SSE)
```

A aplicação não deve gerar uma carga adicional no primeiro `onopen` do EventSource. Depois de `onerror`, porém, o próximo `onopen` deve gerar uma única ressincronização dos quatro estados ativos para cobrir eventos possivelmente perdidos durante a queda.

Uma ressincronização também pode ocorrer quando chega uma transição SSE de um ID ainda desconhecido. O fluxo usa `exhaustMap` para impedir snapshots corretivos concorrentes. Ao concluir o snapshot, pedidos ativos ausentes são removidos apenas se não receberam uma versão mais nova durante a consulta.

## Cenários que exigem condições específicas do backend

Os seguintes comportamentos estão implementados e testados localmente, mas dependem de condições específicas para serem reproduzidos manualmente na API:

- `409 Conflict` durante uma transição concorrente;
- `422` retornado pelo backend;
- replay de eventos após reconexão SSE;
- atualização SSE durante edição do cancelamento;
- resposta HTTP atrasada chegando depois de uma versão mais nova via SSE.
