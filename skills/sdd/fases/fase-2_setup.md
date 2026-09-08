# Fase -2 — Perfil da entrega (roda uma vez por repositório)

Esta fase garante que a `sdd` conhece o repositório antes de perguntar qualquer coisa sobre a
feature. Ela depende de duas fontes:

1. **`PROJECT_MAP.md`** (raiz do repo) — stack, arquitetura, estilos, testes, ambiente local,
   CI/CD e deploy, segurança, observability, convenções de código, integrações externas e fluxo
   de trabalho. Gerado pela skill `project-map`, **não** por esta fase.
2. **`.claude/sdd/perfil.md`** — só o que é específico de spec e não cabe em `PROJECT_MAP.md`: a
   unidade de entrega deste repositório. Gerado por esta fase.

Sem essas duas fontes, as fases seguintes produzem specs genéricas demais para serem
implementáveis: "crie o serviço" sem saber onde serviços moram, o que é obrigatório num teste
ali, ou o que conta como uma entrega fechada.

---

## -2.0 — `PROJECT_MAP.md` existe?

```bash
cat PROJECT_MAP.md 2>/dev/null | head -20
```

- **Existe:** leia o arquivo inteiro e guarde o conteúdo para as fases seguintes. Siga para -2.1.
- **Não existe:** pergunte ao usuário — "Não encontrei `PROJECT_MAP.md` na raiz do repositório.
  Gerar agora deixa as specs mais precisas (stack, arquitetura e convenções reais, em vez de
  genéricas). Posso rodar a skill `project-map` primeiro?"
  - **Aceitar:** invoque `Skill(skill: "project-map")` e espere terminar antes de continuar.
  - **Recusar:** prossiga sem ele, avisando que as specs vão assumir menos sobre o repositório e
    que "Padrões obrigatórios"/"Testes" das fases seguintes ficam mais genéricos.

## -2.1 — `.claude/sdd/perfil.md` existe?

```bash
cat .claude/sdd/perfil.md 2>/dev/null
```

- **Existe:** leia, guarde e **pule para a Fase -1**. Não repita a pergunta da unidade de
  entrega.
- **Existe mas está desatualizado** (usuário pediu `--setup`, ou a unidade de entrega mudou):
  refaça -2.2 e sobrescreva, avisando o que mudou.
- **Não existe:** siga para -2.2.

## -2.2 — Descubra a unidade de entrega

Esta é a única pergunta que este arquivo existe para responder — tudo o mais já está em
`PROJECT_MAP.md`. Cruzando o que `PROJECT_MAP.md § Arquitetura e estrutura real` diz sobre
camadas/módulos, use `AskUserQuestion` (uma única chamada, mostrando o que já foi inferido) para
confirmar:

- **O que conta como "uma spec" neste repositório?** Um endpoint com validação + persistência?
  Um caso de uso de domínio com seu contrato? Uma tela com seu hook de dados? Uma task de um DAG?
- Peça um exemplo real e pequeno do repositório ("isto é uma spec") e um exemplo do que é grande
  demais ("isto vira duas ou mais specs").
- Se `PROJECT_MAP.md` já indicar full-stack (frontend + backend na mesma entrega), confirme a
  ordem típica entre os eixos (ex.: contrato → persistência → exposição HTTP → consumo na tela).

Se o repositório já tiver `.claude/spec_harness/harness.config.json` inicializado, dê uma olhada
rápida nos `scopes` declarados — eles confirmam as fronteiras que uma spec não pode cruzar:

```bash
cat .claude/spec_harness/harness.config.json 2>/dev/null
```

## -2.3 — Escreva o perfil

Use `templates/perfil_repo.md` e grave em `.claude/sdd/perfil.md`. Ele deve caber em poucas
linhas — é só a unidade de entrega, não uma cópia de `PROJECT_MAP.md`. Para tudo o mais (stack,
padrões obrigatórios, testes, integrações externas, fluxo de trabalho), as fases seguintes leem
`PROJECT_MAP.md` diretamente.

Marque `⚠️ ABERTO:` no que ficar incerto.

Ao terminar, mostre um resumo de 2-3 linhas ao usuário e diga como refazer: rodar a skill com
`--setup` ou apagar `.claude/sdd/perfil.md`.

## -2.4 — Versionar

Tanto `PROJECT_MAP.md` quanto `.claude/sdd/perfil.md` **devem ser versionados** com o
repositório: descrevem o projeto, não a máquina. Se `.claude/` estiver no `.gitignore`, avise o
usuário — sem versionar, cada desenvolvedor (e cada agente) responde as perguntas de novo e as
respostas divergem.
