# Perfil do repositório — SDD (unidade de entrega)

> Gerado pela Fase 0 da skill `sdd` em <data>. Complementa `PROJECT_MAP.md` (stack, arquitetura,
> estilos, testes, ambiente local, CI/CD, segurança, convenções, integrações externas e fluxo de
> trabalho — gerado pela skill `project-map`) com o que é específico de spec: o que conta como
> "uma spec" neste repositório. Versione este arquivo. Para refazer: rode a skill com `--setup`
> ou apague este arquivo.

## Unidade de entrega — o que é "uma spec" aqui

<Uma frase objetiva. Ex.: "um caso de uso do domínio, com seu contrato de entrada/saída e seus
testes" ou "um endpoint com validação + persistência" ou "uma task do DAG com seu teste">

- **Isto é uma spec:** <exemplo real e pequeno, tirado do repo>
- **Isto é grande demais** (vira duas ou mais): <exemplo real>

## Ferramenta de implementação

<Escolha uma. Define se uma entrega full-stack vira um arquivo por camada ou um arquivo só —
pergunte isto uma vez aqui; as fases seguintes leem este campo e não perguntam de novo.>

- [ ] **`spec-harness`** — um escopo por spec (packet do harness não atravessa camada); entrega
  full-stack vira par `NN-backend.md` + `NN+1-frontend.md`, `Depende de` a primeira.
- [ ] **Outra (`spec-orchestrator`, manual, outra)** — sem scope de packet a respeitar; entrega
  full-stack vira **uma spec só** cobrindo backend e frontend juntos, do tamanho de uma
  jornada/tela inteira (só quebra em outra spec ao mudar de tela/fluxo, nunca por camada).

## Em aberto

- ⚠️ ABERTO: <o que não foi possível confirmar e o que resolveria>
