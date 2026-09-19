# Painel de entregas — Desafio Angular

Frontend de um painel operacional de pedidos, desenvolvido em Angular 22 para acompanhar entregas em tempo real e consultar o histórico de pedidos com paginação, filtros e ordenação server-side.

A implementação prioriza os requisitos do desafio: código enxuto, tipagem estrita, Signals para estado, `EventSource` nativo para SSE, regras de transição centralizadas e tratamento explícito de concorrência e erros da API.

## Status da entrega

Validação local realizada em 18/09/2026:

| Verificação | Resultado |
| --- | --- |
| `pnpm install` | Concluído |
| `pnpm test` | **6 arquivos / 9 testes / 9 aprovados** |
| `pnpm build` | **Concluído com sucesso** |
| `pnpm start` | Aplicação iniciada em `http://localhost:4200` |
| `GET /pedidos` | **200 OK** contra a API oficial |
| SSE `/operacao/stream` | **Conexão real ativa** |
| Carga dos pedidos em `/operacao` | Validada contra a API oficial |
| Histórico `/pedidos` | Implementado e integrado à API oficial |

Os cenários de `409`, `422`, replay de SSE e conflito de cancelamento possuem tratamento implementado e cobertura de testes, mas não são marcados aqui como reproduzidos manualmente contra o backend real.

## Stack

- Angular 22
- TypeScript com `strict: true`
- Standalone Components
- Angular Signals
- Angular Router
- RxJS
- SCSS
- pnpm
- Node.js 24+

Não são utilizadas bibliotecas de UI, gerenciamento global de estado, SSE ou datas.

## Pré-requisitos

- Node.js 24 ou superior
- pnpm

A versão de pnpm usada no projeto está declarada em `package.json`:

```json
"packageManager": "pnpm@11.19.0"
```

Caso ainda não tenha pnpm instalado:

```bash
npm install -g pnpm@11.19.0
```

## Instalação

Na raiz do projeto:

```bash
pnpm install
```

## Execução local

```bash
pnpm start
```

Abra:

```text
http://localhost:4200
```

A rota raiz redireciona automaticamente para `/operacao`.

Rotas disponíveis:

- `/operacao` — acompanhamento em tempo real dos pedidos ativos;
- `/pedidos` — histórico paginado com filtros, busca e ordenação.

## Scripts

```bash
pnpm start
```

Inicia o servidor de desenvolvimento Angular.

```bash
pnpm test
```

Executa a suíte de testes uma vez, sem modo watch.

```bash
pnpm build
```

Gera o build de produção em `dist/`.

## API

A URL base está centralizada em:

```text
src/app/services/api.config.ts
```

Configuração atual:

```ts
export const API_BASE_URL = 'https://orders-api.planumlabs.com';
```

Documentação Swagger:

```text
https://orders-api.planumlabs.com/swagger-ui/index.html
```

Endpoints utilizados:

```text
GET  /pedidos
GET  /operacao/stream
POST /pedidos/{id}/transicoes
```

### `GET /pedidos`

Usado no histórico e na carga dos pedidos ativos. A API executa paginação, busca, filtro e ordenação.

Parâmetros suportados:

```text
page
size
status
busca
ordenarPor
ordem
```

O frontend não carrega o histórico inteiro para aplicar filtros no navegador.

### `GET /operacao/stream`

Conexão Server-Sent Events criada com `EventSource` nativo.

Eventos tratados:

```text
pedido.criado
pedido.transicionado
heartbeat
```

A reconexão é responsabilidade do próprio `EventSource`; não existe mecanismo de retry manual no frontend.

### `POST /pedidos/{id}/transicoes`

Aplica uma transição de estado.

Payload:

```json
{
  "para": "EM_ROTA",
  "motivo": null
}
```

O frontend está preparado para `200`, `409` e `422`.

## Fluxo dos pedidos

```text
RECEBIDO ──> EM_PREPARO ──> PRONTO ──> EM_ROTA ──> ENTREGUE
    │             │
    └─────────────┴──────────> CANCELADO
```

Regras:

- `CANCELADO` exige motivo com no mínimo 10 caracteres;
- `ENTREGUE` é estado final;
- `CANCELADO` é estado final;
- somente transições válidas são exibidas na interface.

As regras ficam centralizadas em:

```text
src/app/shared/regras-pedido.ts
```

## Arquitetura

A aplicação é dividida em três grupos principais:

```text
src/app/
├── features/
│   ├── operacao/        # painel em tempo real
│   └── pedidos/         # histórico paginado
├── models/              # contratos TypeScript da API
├── services/            # HTTP, SSE e relógio do servidor
└── shared/              # regras de domínio, erros e tempo
```

Detalhes adicionais estão em [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Tela `/operacao`

A tela apresenta apenas pedidos ativos:

```text
RECEBIDO
EM_PREPARO
PRONTO
EM_ROTA
```

Cada card mostra:

- código;
- cliente;
- status;
- horário prometido;
- contagem regressiva;
- ações válidas para o estado atual.

Pedidos entregues ou cancelados permanecem no estado interno da sessão para preservar a deduplicação por versão, mas deixam de ser exibidos.

### Carga inicial

A API aceita um único `status` por chamada. Por isso a carga da operação consulta os quatro status ativos e percorre todas as páginas de cada grupo.

O resultado é consolidado em memória por ID.

### Atualização em tempo real

O SSE é aberto em paralelo com a carga inicial.

Quando chega `pedido.criado`, o payload completo é aplicado ao estado.

Quando chega `pedido.transicionado`:

1. a versão é comparada com a versão já conhecida;
2. eventos antigos ou repetidos são ignorados;
3. se o pedido já existe, somente status e versão são atualizados;
4. se o ID ainda não existe, o evento fica pendente e é solicitado um snapshot controlado dos pedidos ativos.

A ressincronização usa `exhaustMap`, evitando snapshots concorrentes em caso de replay ou múltiplos eventos próximos.

### Relógio do servidor

A contagem regressiva não usa o relógio local como fonte oficial.

Na primeira resposta válida com `servidorEm`:

```text
offset = servidorEm - Date.now()
```

O offset é armazenado uma única vez.

Depois disso:

```text
agoraServidor = Date.now() + offset
```

Um único intervalo compartilhado atualiza a referência local uma vez por segundo. Não existe `setInterval` por pedido.

Horários absolutos são formatados com:

```text
America/Sao_Paulo
```

### Deduplicação por versão

Cada pedido possui `versao`.

Se chegar um evento com:

```text
versao <= versão já armazenada
```

o evento é ignorado.

Isso protege a interface contra eventos reenviados durante reconexões do SSE e contra respostas HTTP atrasadas.

### Transições e clique duplo

Enquanto uma transição está em andamento, o ID do pedido fica no conjunto `processando`.

Uma segunda tentativa para o mesmo pedido é ignorada até a requisição terminar.

Não é feita atualização otimista: o estado só é confirmado quando o servidor responde.

### `409 Conflict`

O servidor é tratado como fonte da verdade.

Ao receber `409`:

1. o pedido é marcado como desatualizado;
2. novas ações ficam bloqueadas para esse pedido;
3. como o contrato não fornece `GET /pedidos/{id}`, o serviço percorre as páginas de `GET /pedidos` até encontrar o pedido;
4. o payload recuperado substitui o estado local;
5. se a recuperação falhar, o pedido permanece bloqueado até uma nova tentativa de sincronização.

### `422 Unprocessable Entity`

A mensagem retornada pela API é apresentada ao usuário sem simular sucesso ou alterar artificialmente o pedido.

### Cancelamento concorrente

Se o formulário de cancelamento estiver aberto e chegar uma atualização SSE:

- se o novo estado ainda permitir cancelamento, o formulário e o texto digitado são preservados;
- se o novo estado não permitir mais cancelamento, o formulário é fechado e uma mensagem informa a mudança.

## Tela `/pedidos`

O histórico utiliza exclusivamente operações server-side para:

- paginação;
- filtro por status;
- busca por cliente;
- ordenação.

A página usa tamanho fixo de 20 registros.

### Estado na URL

Os seguintes valores são lidos dos query parameters:

```text
page
status
busca
ordenarPor
ordem
```

Exemplo:

```text
/pedidos?page=2&status=PRONTO&busca=Maria&ordenarPor=criadoEm&ordem=desc
```

Recarregar a página ou navegar com voltar/avançar restaura o estado a partir da URL.

### Busca com debounce

A busca espera 300 ms após a última alteração antes de navegar e disparar uma nova consulta.

Isso evita uma requisição HTTP por tecla digitada.

## Acessibilidade

Foram mantidos os requisitos solicitados pelo desafio:

- elementos interativos nativos (`button`, `input`, `select`, `textarea`);
- navegação por teclado;
- foco visível com `:focus-visible`;
- `role="status"` para mensagens de estado;
- `role="alert"` para erros;
- tabela com `caption`, `scope` e região navegável em telas menores.

## Tratamento de erros

O helper em:

```text
src/app/shared/erro-api.ts
```

extrai a mensagem do formato padronizado da API quando disponível.

Quando a API está inacessível ou retorna um formato inesperado, a aplicação usa uma mensagem de fallback e não cria respostas falsas de sucesso.

## Testes

A suíte possui **9 testes em 6 arquivos**.

Cobertura atual:

- cálculo de tempo restante;
- regras de transição;
- cálculo único do offset do relógio;
- contrato HTTP de listagem;
- contrato HTTP de transição;
- restauração dos filtros pela URL;
- debounce da busca;
- concorrência e deduplicação na operação;
- ressincronização de IDs desconhecidos recebidos por SSE;
- tratamento de `409` e `422` na operação.

Execução:

```bash
pnpm test
```

Resultado validado:

```text
Test Files  6 passed (6)
Tests       9 passed (9)
```

Mais detalhes em [`docs/TESTING.md`](docs/TESTING.md).

## Build

```bash
pnpm build
```

Build validado com sucesso.

O diretório `dist/` é ignorado pelo Git e não deve fazer parte do ZIP de código-fonte da entrega.

## Estrutura do projeto

```text
desafio-angular/
├── docs/
│   ├── ARCHITECTURE.md
│   └── TESTING.md
├── src/
│   ├── app/
│   │   ├── features/
│   │   │   ├── operacao/
│   │   │   └── pedidos/
│   │   ├── models/
│   │   ├── services/
│   │   └── shared/
│   ├── index.html
│   ├── main.ts
│   └── styles.scss
├── angular.json
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.app.json
├── tsconfig.json
└── tsconfig.spec.json
```

## Decisões técnicas resumidas

1. **Signals para estado local:** o estado visível da interface usa `signal()` e `computed()`; RxJS fica restrito aos fluxos assíncronos em que é mais adequado.
2. **Servidor como autoridade:** não existe sucesso simulado e não existe confirmação otimista de transições.
3. **SSE nativo:** reconexão automática delegada ao navegador.
4. **Versão por pedido:** protege contra replay e eventos fora de ordem.
5. **Offset de tempo único:** evita depender do relógio configurado no computador do usuário.
6. **URL como estado do histórico:** permite refresh, compartilhamento e navegação do navegador.
7. **Regras centralizadas:** a UI pergunta ao domínio quais transições são válidas em vez de espalhar condicionais pelos templates.
8. **Dependências mínimas:** nenhuma biblioteca foi adicionada para problemas que Angular, RxJS ou APIs nativas já resolvem.

## Pontos que ficaram fora do escopo

Por decisão de escopo, não foram implementados os diferenciais opcionais:

- `httpResource`;
- interceptor global de erros;
- tela de detalhe;
- linha do tempo de eventos;
- tema claro/escuro;
- Docker;
- deploy online;
- autenticação;
- backend local/mock server;
- testes E2E.

A prioridade foi concluir corretamente as duas telas e os requisitos de consistência solicitados.

## Limitações conhecidas do contrato

### Recuperação após `409`

O contrato não define `GET /pedidos/{id}`. Por isso a recuperação autoritativa percorre páginas de `GET /pedidos` até encontrar o ID.

Essa abordagem preserva o contrato fornecido, mas pode gerar mais de uma chamada em históricos grandes.

### Formato do `200` da transição

O enunciado informa que o `POST` retorna o pedido atualizado e que as respostas incluem `servidorEm`, mas não apresenta o envelope completo da resposta de sucesso.

O tipo adotado é:

```ts
Pedido & { servidorEm: string }
```

Essa suposição está isolada em `src/app/models/pedido.ts`.

## Documentação complementar

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — arquitetura, responsabilidades e fluxos de dados;
- [`docs/TESTING.md`](docs/TESTING.md) — suíte automatizada e roteiro de validação manual.

## Entrega

Antes de criar o ZIP final ou publicar o repositório:

```bash
pnpm test
pnpm build
```

Se o build tiver sido executado e você quiser gerar um ZIP apenas com os fontes, `dist/` já está listado no `.gitignore` e deve ser excluído da compactação.

Também não devem ser incluídos:

```text
node_modules/
.angular/
coverage/
*.log
.env
```
