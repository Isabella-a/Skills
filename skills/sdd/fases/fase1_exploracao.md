# Fase 1 — Descoberta Exploratória de Contratos e Schemas

Esta fase existe para que os dados de teste (fixtures/mocks de DTOs, entidades, respostas de
API) reflitam a realidade do sistema. Sem ela, os payloads inventados nos testes divergem do
schema real (colunas de migration, DTOs, resposta de API externa) e os testes aprovam código
que quebraria em produção.

---

## Execução

Leia `exploracao_contratos.md` integralmente. Em seguida, lance **um agente
Explore** com o conteúdo desse arquivo como prompt, substituindo:

- `$FONTE` → a origem do contrato informada na Fase 0 (entidade/tabela existente, tipo/DTO já
  definido, contrato de serviço externo, schema a ser criado)
- `$CONTEXTO` → os `$ARGUMENTS` originais do usuário + resumo das regras de negócio coletadas na
  Fase 0

```
Agent(
  subagent_type="Explore",
  description="Exploração de shape real de contrato/schema para specs e fixtures de teste",
  prompt=<conteúdo de exploracao_contratos.md com $FONTE e $CONTEXTO substituídos>
)
```

Aguarde o relatório completo antes de prosseguir para a Fase 2.

---

## Saída obrigatória

O relatório do agente vai diretamente para `templates/descricao_alto_nivel.md` (seção
Contratos e Schemas).

Se o agente retornar GAPS, liste-os na seção e resolva com o usuário antes de continuar — uma
spec com contrato inventado produz testes que mentem sobre a realidade (ex: DTO com campo que
não existe, entidade sem a coluna que a migration realmente criou).
