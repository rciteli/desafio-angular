# Painel de entregas — Desafio Angular

Frontend com `/operacao` e `/pedidos`, Angular 22, standalone components, Signals, TypeScript estrito e SCSS. Sem backend, dados fictícios de produção ou bibliotecas de interface.

**A API oficial foi usada na validação final. O SSE `/operacao/stream` conectou normalmente, mas `GET /pedidos` apresentou `500 Internal Server Error` e, em algumas tentativas, timeout. Por isso a validação real ficou parcial; o frontend continua seguindo o contrato fornecido no enunciado sem mascarar falhas do backend.**

## Instalação e execução

Ambiente utilizado: Node.js 24.19.0 e pnpm 11.19.0. As versões exatas das dependências estão no `pnpm-lock.yaml`. Compatibilidade de Node/TypeScript: [documentação do Angular](https://angular.dev/reference/versions).

Se ainda não tiver pnpm:

```bash
npm install -g pnpm@11.19.0
```

Na pasta extraída:

```bash
cd desafio-angular
pnpm install
pnpm test
pnpm build
pnpm start
```

Abra `http://localhost:4200`. A raiz redireciona para `/operacao`. `pnpm test` executa uma vez, sem modo watch. `pnpm-workspace.yaml` autoriza os scripts de instalação das dependências nativas da ferramenta de build.

## Conectar a API

A base da API fica centralizada em `src/app/services/api.config.ts` e, nesta entrega, aponta para a URL oficial:

```ts
export const API_BASE_URL = 'https://orders-api.planumlabs.com';
```

Se o endereço mudar, altere somente esse arquivo, sem barra final. A mesma base atende HTTP e SSE.

Se a API estiver indisponível, o painel mostra o erro de carregamento e mantém o estado da conexão SSE; nenhuma chamada falha vira sucesso simulado. O botão “Tentar novamente” refaz a consulta.

## Decisões técnicas

1. **Relógio:** o primeiro `servidorEm` válido calcula uma única vez `offset = servidorEm - Date.now()`. Esse offset fica armazenado e todos os cálculos usam `Date.now() + offset`. Um único intervalo compartilhado atualiza a referência local a cada segundo; antes da primeira sincronização, o valor é `null`. Horários absolutos usam `Intl.DateTimeFormat` com `America/Sao_Paulo`.
2. **Versões e SSE:** `EventSource` nativo processa `pedido.criado`, `pedido.transicionado` e `heartbeat`. Reconexão e reenvio do último ID são responsabilidade do navegador. A aplicação só aceita versões maiores, inclusive ao conciliar SSE com respostas HTTP atrasadas. Pedidos finalizados ficam no mapa da sessão, mas saem da lista visível. Se uma transição ativa chegar para um ID ainda desconhecido, o evento fica pendente e é solicitado um snapshot completo dos pedidos ativos; `exhaustMap` impede snapshots paralelos durante replay/reconexão. Isso evita varrer o histórico por ID e evita tempestade de requests. Ao sair da operação, a conexão SSE é fechada.
3. **Histórico e URL:** `page`, `status`, `busca`, `ordenarPor` e `ordem` vêm dos query parameters. As alterações navegam pelo Router, permitindo URL direta, refresh e voltar/avançar. O tamanho é fixo em 20. Busca tem debounce de 300 ms; filtros e ordenação voltam à página 1. `switchMap` cancela consultas anteriores. Filtragem, ordenação e paginação do histórico são feitas exclusivamente pela API.
4. **Cancelamento concorrente:** o motivo precisa de 10 caracteres após remover espaços das extremidades. Se uma atualização mantiver o cancelamento permitido, preserva o formulário e o texto. Se deixar de ser permitido, fecha o formulário, mantém o novo estado e informa o usuário. As transições ficam centralizadas em `shared/regras-pedido.ts`.
5. **Autoridade do servidor:** não há atualização otimista. Um conjunto de IDs bloqueia novos envios para o mesmo pedido até a requisição terminar. O `422` exibe a mensagem da API. No `409`, mostra a mensagem e consulta o pedido completo para corrigir o estado. Se essa consulta falhar, mantém as ações do pedido bloqueadas até uma nova sincronização bem-sucedida.
6. **Fora do escopo:** diferenciais, autenticação, backend/mock server, detalhe/timeline, tema, deploy, Docker e testes E2E. Com a API disponível, o próximo passo é validar a integração abaixo, sem ampliar funcionalidades.

## Lacunas do contrato e suposições mínimas

- **Resposta `200` da transição:** o enunciado diz que retorna o pedido atualizado e que toda resposta inclui `servidorEm`, mas não mostra o JSON completo. Foi adotado `Pedido & { servidorEm: string }`, sem inventar um envelope. Confirmar com a API; o tipo está em `models/pedido.ts` e o consumo em `services/pedidos.service.ts`.
- **Erro e horário:** o exemplo de erro omite `servidorEm`, apesar da regra geral. O campo é opcional em `ErroApi`; quando presente, também sincroniza o relógio.
- **Página inicial:** adotada página 1 conforme o exemplo. Não existe endpoint de consulta por ID: após `409`, a busca percorre `GET /pedidos` em ordem de criação até encontrar o ID ou terminar as páginas. Não extrai estado da mensagem textual e não inventa campos. Isso pode exigir várias chamadas em históricos extensos.
- **Carga inicial da operação:** como `status` é singular, consulta cada um dos quatro estados ativos e suas páginas uma única vez ao abrir a tela. O SSE é aberto em paralelo e o `EventSource` nativo cuida das reconexões; a aplicação não dispara uma nova carga completa a cada `onopen`. Se uma transição ativa chegar antes do payload completo do pedido, um snapshot de pedidos ativos é disparado em segundo plano e `exhaustMap` impede snapshots concorrentes. Reenvios são conciliados pela `versao`, e o botão “Tentar novamente” permanece como sincronização manual quando uma consulta falha.

## Validação realizada

| Verificação | Resultado |
| --- | --- |
| `pnpm install` | Concluído anteriormente |
| `pnpm test` | Executar novamente após aplicar os ajustes finais deste patch |
| `pnpm build` | Executar novamente após aplicar os ajustes finais deste patch |
| `pnpm start` | Aplicação local iniciou e as duas rotas foram acessadas |
| SSE `/operacao/stream` | Conexão real observada como ativa |
| `GET /pedidos` na API oficial | `500 Internal Server Error` e, em algumas tentativas, timeout |

A suíte atual contém os dois testes obrigatórios e testes adicionais de contrato HTTP, concorrência da operação, SSE, URL/debounce e relógio. Depois de aplicar este patch, valide localmente com `pnpm test` e `pnpm build` antes da entrega.

## Checklist de integração real

- [ ] Confirmar `GET /pedidos`, índice de página, paginação, filtro e ordenação.
- [ ] Confirmar busca com debounce e navegação direta/refresh/voltar/avançar.
- [ ] Confirmar payload e formato do `200` do POST de transições.
- [ ] Confirmar `409`, recuperação autoritativa e `422` com sua mensagem.
- [ ] Confirmar cancelamento, motivo mínimo e bloqueio de clique duplo com latência real.
- [x] Confirmar conexão `EventSource` com a API oficial.
- [ ] Confirmar `pedido.criado` e `pedido.transicionado` com payloads reais.
- [ ] Confirmar heartbeat, primeira sincronização de `servidorEm` e relógio local deslocado.
- [ ] Confirmar reconexão SSE, replay e deduplicação por versão.
- [ ] Confirmar SSE concorrente com formulário de cancelamento e resposta HTTP atrasada.
- [ ] Confirmar CORS/origem, horários de São Paulo e destaques de prazo.
- [ ] Conferir renderização, foco visível, teclado e responsividade no navegador.

## Publicar o código no GitHub

Antes de gerar o ZIP final, mantenha somente fontes, configurações, testes e lockfile. Não inclua `node_modules`, `dist`, `.angular`, cache ou logs. Se você executou o build, remova `dist` antes de compactar:

```powershell
Remove-Item -Recurse -Force .\dist -ErrorAction SilentlyContinue
```

Nenhum repositório remoto é criado automaticamente por este projeto.

Depois de criar um repositório vazio no GitHub, execute na pasta do projeto, substituindo a URL:

```bash
git init -b main
git add .
git commit -m "feat: implementa painel de entregas Angular"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPOSITORIO.git
git push -u origin main
```
