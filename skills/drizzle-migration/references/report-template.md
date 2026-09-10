# Template — `apps/backend/docs/drizzle-migration/PROGRESS.md`

Copie a estrutura abaixo no kickoff. A ordem das seções é deliberada: **quem abre o arquivo com
zero contexto precisa saber "qual é o próximo passo" nas primeiras 20 linhas**, não depois de
ler o histórico inteiro.

---

```markdown
# Migração TypeORM → Drizzle — Progresso

> Estado durável desta migração. Leia junto com `DECISIONS.md`.
> Métricas são **geradas** — rode o scanner, não edite números à mão:
> `node .claude/skills/drizzle-migration/scripts/scan-progress.mjs`

## ⏭️ Próximo passo

<!-- A seção mais importante do arquivo. Concreto e acionável. -->
<!-- Bom: "Portar `category.repository.ts`: 4 métodos, tem deletedAt (precisa seed adversarial).
      Copiar o padrão de `feature-flag.repository.ts`." -->
<!-- Ruim: "Continuar migrando os repositories." -->

**Fase atual:** <1-Fundação | 2-Cauda longa | 3-Complexos | 4-Monstros | 5-Resíduos | 6-Descomissionamento>

## 📐 Padrões estabelecidos

<!-- O atalho mais valioso para uma sessão nova: em vez de re-derivar estilo, copiar um exemplar. -->

- **Repository canônico (copie este):** `<caminho>`
- **Repository com soft delete (copie este):** `<caminho>`
- **Paginação + count:** `<caminho>` — <abordagem: $dynamic() / sql`` / relational query>
- **Agregado com escrita em cascata:** `<caminho>`
- **Organização do schema:** `<um arquivo por domínio? nomenclatura de relations?>`
- **Helpers criados:** `<notDeleted(), upsertMany(), colunas comuns...>`

## 📊 Estado atual

<!-- SUBSTITUA este bloco inteiro pela saída do scanner a cada checkpoint. -->

<!-- saída de scan-progress.mjs aqui -->

## ⚠️ Débito de verificação

<!-- O que está no código mas NÃO foi provado. Ser honesto aqui é o que torna o relatório útil. -->

| Item | Estado | Nota |
|---|---|---|
| e2e do módulo X | ⛔ não rodado | faltou tempo |
| seed adversarial de soft delete em Y | ⛔ pendente | risco de vazamento |
| EXPLAIN comparativo da listagem Z | ⚠️ regressão de 200ms | investigar lateral join |

## 🪤 Armadilhas descobertas

<!-- Só o que foi descoberto NESTA migração, no terreno. As já conhecidas estão na SKILL.md. -->

- **<data>** — <o que morde, e como contornar>

## 🔀 Sincronização com develop

- Último merge de `develop`: <data / commit>
- Pendências trazidas pelo merge: <repositories novos, migrations novas...>

## 🐛 Bugs pré-existentes encontrados

<!-- Achados que NÃO são da migração. Registre, não conserte de brinde (aumenta o diff do PR). -->

- <descrição> — `arquivo:linha` — <decisão: corrigir agora / issue separada>

## 📝 Log de sessões

<!-- Append-only, uma linha por sessão, mais recente no topo. Curto. -->

| Data | Feito | Ficou pela metade |
|---|---|---|
| <data> | <o que foi concluído> | <o que ficou aberto> |
```

---

## Notas sobre o preenchimento

**"Próximo passo" no topo, não no fim.** Numa sessão nova o modelo lê o começo do arquivo com
mais atenção; enterrar a única informação acionável no fim desperdiça o documento.

**"Padrões estabelecidos" é o que evita inconsistência.** Numa migração de 57 arquivos feita em
dezenas de sessões, o maior risco de qualidade não é errar uma query — é cada sessão inventar
um estilo próprio de paginação, de soft delete, de nomear relations. Apontar um arquivo
exemplar por padrão resolve isso por imitação, que é mais confiável que descrever a regra.

**"Débito de verificação" precisa ser desconfortável.** A tentação é escrever só o que foi
concluído. Mas o que quebra uma migração longa é justamente o que ficou meio-pronto e foi
esquecido: o repository portado cujo e2e nunca rodou. Se está incerto, marque como não
verificado.

**Não duplique a SKILL.md no PROGRESS.md.** Estratégia, invariantes e armadilhas conhecidas
vivem na skill (estáveis). O PROGRESS.md guarda só o que muda a cada sessão.
