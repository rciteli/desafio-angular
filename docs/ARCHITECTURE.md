# Arquitetura

Este documento descreve como o frontend organiza estado, HTTP, SSE e regras de domínio.

## Visão geral

```text
┌───────────────────────────────────────────────────────────────┐
│                         Angular UI                            │
│                                                               │
│  /operacao                         /pedidos                    │
│      │                                 │                       │
│      ├───────────┐                     │                       │
│      │           │                     │                       │
│      ▼           ▼                     ▼                       │
│ PedidosService  OperacaoStreamService  PedidosService         │
│      │           │                     │                       │
│      └──────┬────┘                     │                       │
│             ▼                          │                       │
│        RelogioService ◄────────────────┘                       │
└─────────────┬─────────────────────────────────────────────────┘
              │
              ▼
 https://orders-api.planumlabs.com
```

## Responsabilidades

### `features/operacao`

Responsável pelo painel em tempo real.

Mantém:

- mapa dos pedidos já conhecidos;
- conjunto de IDs em processamento;
- conjunto de IDs marcados como desatualizados;
- formulário de cancelamento;
- eventos de transição recebidos antes do payload completo;
- mensagens de erro e estado.

A página não conhece detalhes de `HttpClient` ou de criação do `EventSource`; essas responsabilidades ficam nos services.

### `features/pedidos`

Responsável pelo histórico.

A URL é a fonte persistente dos filtros. A página converte query parameters em `FiltrosPedidos` e repassa os filtros ao service.

O estado transitório da digitação da busca fica separado do filtro efetivamente aplicado para permitir debounce.

### `models/pedido.ts`

Concentra os contratos TypeScript derivados do enunciado:

- `Pedido`;
- `PaginaPedidos`;
- `FiltrosPedidos`;
- `TransicaoPedido`;
- eventos SSE;
- erro padronizado;
- estados de conexão.

### `PedidosService`

Camada HTTP da aplicação.

Responsabilidades:

- montar parâmetros de `GET /pedidos`;
- sincronizar o relógio quando uma resposta possui `servidorEm`;
- carregar todos os pedidos ativos;
- procurar um pedido após um `409` usando somente endpoints documentados;
- executar transições;
- preservar o erro HTTP original para que a página possa diferenciar `409` e `422`.

### `OperacaoStreamService`

Encapsula o `EventSource`.

Responsabilidades:

- abrir e fechar a conexão;
- refletir `conectando`, `conectado` e `reconectando`;
- registrar listeners para os eventos documentados;
- fazer parse do JSON;
- encaminhar `servidorEm` ao relógio;
- entregar eventos tipados à página;
- avisar a página quando a conexão volta depois de um erro, para que ela solicite uma reconciliação HTTP.

A reconexão da conexão não é implementada manualmente. O navegador cuida disso através de `EventSource`. O primeiro `onopen` apenas marca a conexão como ativa; um `onopen` posterior a `onerror` também dispara o callback de ressincronização.

### `RelogioService`

Mantém a referência temporal usada por toda a aplicação.

Na primeira sincronização válida:

```text
offset = servidorEm - Date.now()
```

O offset não é recalculado depois disso.

A cada segundo, apenas a referência local é atualizada:

```text
agora = Date.now() + offset
```

Isso evita criar timers por card.

### `shared/regras-pedido.ts`

É a fonte única das regras de transição e labels dos estados.

Templates não precisam conhecer combinações de estado como regra de negócio.

### `shared/tempo.ts`

Contém funções puras para:

- calcular tempo restante;
- formatar a duração;
- formatar data/hora no fuso de São Paulo.

### `shared/erro-api.ts`

Faz narrowing seguro de `HttpErrorResponse` para o formato de erro documentado pela API.

## Fluxo de carga da operação

```text
OperacaoPage
    │
    ├─ abre SSE
    │
    └─ listarAtivos()
          │
          ├─ RECEBIDO ───────┐
          ├─ EM_PREPARO ─────┤
          ├─ PRONTO ─────────┤── forkJoin
          └─ EM_ROTA ────────┘
                 │
                 └─ cada status percorre todas as páginas
                            │
                            ▼
                       Pedido[]
                            │
                            ▼
                 Map<id, Pedido> da página
```

`forkJoin` é usado porque os quatro grupos precisam estar concluídos para formar o snapshot ativo completo.

`expand` percorre páginas adicionais de cada status quando `totalPaginas > pagina`. Antes de cada snapshot, a página registra a versão dos pedidos ativos já conhecidos. Ao terminar, aplica os pedidos recebidos, libera IDs previamente marcados como desatualizados quando reaparecem na resposta autoritativa e remove somente os ativos ausentes cuja versão não mudou durante a consulta. Assim, um pedido criado ou atualizado por SSE enquanto o HTTP estava em andamento não é apagado por uma resposta mais antiga.


## Fluxo de reconexão do SSE

```text
EventSource conectado
       │
       ├─ onerror → estado = reconectando
       │              │
       │              └─ navegador tenta reconectar
       │
       └─ onopen após erro
              │
              ├─ estado = conectado
              └─ solicitar snapshot dos ativos
                         │
                         ▼
                 aplicarSnapshot()
                         │
                         ├─ atualiza/adiciona recebidos
                         ├─ remove ativos ausentes e inalterados
                         └─ preserva mudanças SSE concorrentes
```

O callback não executa no primeiro `onopen` normal, evitando duplicar a carga inicial. O `exhaustMap` continua impedindo que múltiplos gatilhos de ressincronização produzam snapshots corretivos paralelos.

## Fluxo de um evento `pedido.criado`

```text
SSE
 │
 ▼
OperacaoStreamService
 │
 ├─ parse JSON
 ├─ sincroniza servidorEm
 └─ callback
      │
      ▼
OperacaoPage.aplicarPedido()
      │
      ├─ compara versao
      ├─ concilia evento pendente
      └─ atualiza Map
```

## Fluxo de um evento `pedido.transicionado`

### Pedido conhecido

```text
pedido.transicionado
       │
       ▼
comparar versao
       │
       ├─ antiga/igual → ignorar
       │
       └─ maior → atualizar status + versao
```

### Pedido ainda desconhecido

O evento de transição não possui o payload completo do pedido.

Por isso:

```text
pedido.transicionado
       │
       ▼
guardar evento pendente
       │
       ▼
solicitar snapshot dos ativos
       │
       ▼
exhaustMap impede snapshots paralelos
       │
       ▼
quando o Pedido completo chegar:
conciliar com a maior versao conhecida
```

Essa estratégia evita procurar todo o histórico para cada evento SSE desconhecido.

## Fluxo de transição iniciada pelo usuário

```text
clique
  │
  ├─ valida regra local
  ├─ valida motivo quando CANCELADO
  ├─ verifica processando/desatualizado
  │
  ▼
marcar ID como processando
  │
  ▼
POST /pedidos/{id}/transicoes
  │
  ├─ 200 → aplicar pedido retornado
  │
  ├─ 409 → marcar desatualizado
  │          │
  │          └─ procurar pedido autoritativo
  │
  └─ 422/outro → mostrar mensagem
```

## Recuperação após `409`

O contrato não oferece um endpoint de consulta por ID.

O frontend não interpreta o texto de `message` como estado estruturado e não inventa um endpoint.

Em vez disso, `buscarPedido()` percorre `GET /pedidos` até localizar o ID.

Enquanto o estado autoritativo não é recuperado, o pedido fica bloqueado para novas ações.

## Concorrência do formulário de cancelamento

O formulário pertence ao pedido pelo `id`.

Ao receber um estado mais novo:

```text
novo estado ainda permite CANCELADO?
        │
     ┌──┴──┐
    sim    não
     │      │
 preservar fechar formulário
 motivo     + avisar usuário
```

## Histórico e URL

```text
queryParamMap ──► lerFiltros() ──► signal filtros
      │                                │
      │                                ▼
      │                         PedidosService.listar()
      │                                │
      │                                ▼
      └────────────────────────── resposta paginada
```

Alterações de filtro são feitas com `router.navigate()`, portanto o navegador passa a representar o estado da consulta.

## Debounce da busca

```text
input
 │
 ▼
Subject<string>
 │
 ▼
timer(300)
 │
 ├─ nova tecla antes de 300 ms → switchMap cancela timer anterior
 │
 └─ 300 ms sem alteração → atualiza URL → nova requisição
```

## Estado com Signals e RxJS

Signals são usados para estado da interface:

- pedidos;
- carregamento;
- mensagens;
- filtros;
- formulário;
- conexão;
- relógio.

RxJS é usado onde há fluxo assíncrono:

- HTTP;
- debounce;
- paginação recursiva;
- carga/reload;
- controle de concorrência;
- query parameters.

Essa separação evita manter duas fontes independentes para o mesmo estado.
