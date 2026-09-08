# Fase 0 — Alinhamento de Negócio

Esta fase garante que você entende o objetivo real antes de explorar código. Não pule para
exploração técnica sem clareza de negócio — uma spec construída sobre premissa errada é inútil.

**Pré-requisitos:**

- **Fase -2 concluída** — leia `PROJECT_MAP.md` (tipo de projeto, camadas, integrações externas
  recorrentes) e `.claude/sdd/perfil.md` (o que é uma unidade de entrega) antes de perguntar
  qualquer coisa. Sem isso você vai perguntar ao usuário o que o repositório já responde.
- **Fase -1 concluída** — releia a sessão de grilling e mapeie o que ela já resolveu. Só pergunte
  o que ficou em aberto; se a entrevista cobriu tudo, apresente o resumo e peça confirmação (ver
  `fase-1_ticket_grilling.md § -1.4`).

---

## 0.1 — Perguntas obrigatórias (use `AskUserQuestion` só para o que ainda está em aberto)

Cheque cada item contra o que a Fase -1 já resolveu e o que `PROJECT_MAP.md`/`perfil.md` já
declaram. Para o que sobrar, pergunte em uma única chamada com múltiplos campos:

1. **Objetivo da feature:** o que ela entrega? Para quem (qual perfil de usuário, dos que
   `PROJECT_MAP.md § Identidade` lista em "Quem consome")? Com qual frequência de uso?
2. **Regras de negócio:** validações, cálculos, transições de estado e permissões que devem ser
   aplicadas. Liste pelo menos as principais — não assuma nada.
3. **Tipo de mudança** (escolha uma):
   - **Feature nova:** ainda não existe — qual é o ponto de entrada mais próximo no repositório?
   - **Extensão de comportamento existente:** qual é o módulo/tela/job de referência?
4. **Controle de acesso:** a feature exige permissão nova, ou reutiliza uma existente? (Só
   pergunte se `PROJECT_MAP.md § Segurança e configuração` indicar que o projeto tem controle de
   acesso.)
5. **Não-objetivos:** o que esta feature explicitamente **não** vai fazer?
6. **Integração externa:** depende de algum serviço externo? Se sim, qual e o que já se sabe do
   contrato dele? Isso muda o que a Fase 1 precisa explorar (contrato externo, não só o interno)
   e alimenta o caso de borda "dependência externa indisponível". Comece pelas integrações que
   `PROJECT_MAP.md § Integrações externas recorrentes` lista.
7. **Persistência/schema:** exige mudança de schema, migration ou nova fonte de dados? Use os
   mecanismos que `PROJECT_MAP.md § Frameworks e bibliotecas-chave` declara — não invente um novo.

Não prossiga para 0.2 sem essas respostas.

**Não pergunte aqui quais são as specs.** Nesta fase você ainda não viu o contrato real (Fase 1)
nem os padrões do repositório (Fase 2), então qualquer lista agora é chute. A Fase 3 deriva a
lista do que foi levantado e só a apresenta para confirmação.

### Testes — vem do `PROJECT_MAP.md`, não do usuário

Não pergunte que testes fazer: `PROJECT_MAP.md § Testes` já registra o que é obrigatório neste
repositório. Aplique de lá:

- O nível **sempre obrigatório** (tipicamente unit) vale para todo comportamento novo ou alterado
  — e é estrutural no `spec-harness`, onde a fase RED escreve o teste antes de existir produção.
- Os níveis **condicionais** (integração, e2e, contrato) são derivados do conteúdo da spec, não
  perguntados. Derive pelo gatilho que `PROJECT_MAP.md` declarar — por exemplo mutação de estado,
  dado sensível/financeiro, mudança de permissão ou travessia de processo.
- O que faz um teste **valer** ali (asserir o ramo de erro explicitamente, e não apenas "não
  lançou exceção") está em `PROJECT_MAP.md` e em `regras/qualidade.md`; o checklist do template
  de spec cobra isso.

### Eixos da entrega — assuma o caminho completo

Se `.claude/sdd/perfil.md` indicar que o projeto tem mais de um eixo por onde uma feature costuma
passar (por exemplo contrato + consumo, serviço + job, API + tela), **assuma que a entrega passa
por todos eles** em vez de perguntar "é só de um lado?" como escolha aberta. Informe essa suposição ao
resumir as respostas de 0.1 e diga a ordem prevista (quem produz o contrato vem antes de quem
consome).

Só reduza para um eixo com sinal explícito e concreto de que o outro não existe — por exemplo um
job interno sem interface, uma migration isolada sem contrato novo, um ajuste puramente visual
sem mudança de contrato. Nesse caso, confirme antes de reduzir o escopo; não assuma em silêncio.

---

## 0.2 — Se for extensão de algo existente: análise da referência

Quando a feature estende um módulo, tela ou job já implementado, você precisa entender as regras
de negócio já aplicadas ali — elas determinam o que a nova spec pode assumir e o que ela ainda
precisa validar.

**Para cada referência mencionada pelo usuário:**

1. **Localize os arquivos**, usando os caminhos que `PROJECT_MAP.md § Arquitetura e estrutura
   real` declara para esse tipo de artefato:
   ```bash
   git ls-files | grep -i "<nome-do-modulo-ou-tela>"
   ```

2. **Lance um agente por referência** (modelo rápido, em paralelo se houver mais de uma):

   ```
   Agent(
     model="haiku",
     description="Análise de regras de negócio da referência",
     prompt="""
     Leia os arquivos de <caminho da referência> (implementação, contratos/DTOs e testes).

     Extraia e documente:
     1. CONTRATO ATUAL: entradas e saídas — tipos, schemas, payloads, com caminho do arquivo.
     2. REGRAS DE NEGÓCIO APLICADAS: validações, cálculos, transições de estado, permissões.
     3. PADRÃO ARQUITETURAL USADO: como erro, transação, dependência externa e efeito colateral
        são tratados ali.
     4. INVARIANTES GARANTIDOS: o que o código garante hoje sobre dados e estado.
     5. O QUE NÃO É GARANTIDO: o que fica para quem chama resolver.
     6. DEPENDÊNCIAS: outros módulos e serviços externos de que depende.

     Retorne exatamente neste formato:

     === ANÁLISE DE REFERÊNCIA: <nome> ===

     CONTRATO ATUAL:
     - [tipo/schema — com caminho do arquivo]

     REGRAS JÁ APLICADAS:
     - [regra 1 — com arquivo e função onde foi encontrada]

     INVARIANTES GARANTIDOS:
     - [invariante 1]

     O QUE NÃO É GARANTIDO (a nova spec precisa tratar):
     - [item 1]

     GAPS E INCERTEZAS:
     - [o que não deu para confirmar lendo o código]
     """
   )
   ```

3. **Consolide os relatórios** antes de ir para a Fase 1. O que a referência garante determina o
   que a nova spec pode assumir — e o que ela precisa validar.
