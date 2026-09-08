# Fase 3 — Confirmação de Escopo Técnico

Com as respostas de negócio (Fase 0), os relatórios de módulo/tela de referência (Fase 0.2, se
aplicável), o shape do contrato (Fase 1) e a investigação do repositório (Fase 2) em mãos, use
`AskUserQuestion` para confirmar apenas o que ainda estiver em aberto.

---

## Perguntas desta fase

1. **Camadas envolvidas:** quais camadas do repositório esta entrega atravessa, na ordem em que
   `PROJECT_MAP.md § Arquitetura e estrutura real` as declara — schema, persistência, regra de
   negócio, exposição, consumo? É subset ou o caminho inteiro? (Só pergunte o que não ficou claro
   na Fase 0.)
2. **Efeito colateral:** a entrega dispara algo fora do fluxo principal (notificação,
   sincronização, job)? Use o mecanismo que o repositório já tem para isso.
3. **Modos de falha:** o que acontece quando a validação falha? Quando o recurso não existe?
   Quando a dependência externa devolve erro ou não responde? Quando falta permissão?
4. **Reutilização:** a Fase 2 encontrou algo que já cobre parte desta entrega? Apresente ao
   usuário antes de propor código novo — cada reuso é uma spec que não precisa existir.
5. **Lista de specs — apresente, não pergunte em aberto:** derive você mesmo a divisão em
   `specs/`, sem pedir ao usuário para adivinhar. Aplique a regra de granularidade (mesma usada
   na Fase 4, `fases/fase4_geracao.md#regra-de-granularidade-das-specs`):
   - testável de forma independente, sem depender de outra spec para rodar seus testes (exceto
     dependência declarada explicitamente);
   - nunca backend e frontend na mesma spec — quebre por lado, contrato/endpoint antes do
     consumo na tela;
   - agrupe por entidade/módulo backend (ex.: todo o CRUD de uma entidade numa spec só) ou por
     área de feature frontend (ex.: todas as telas dessa área numa spec só); quebre em specs
     separadas apenas ao cruzar entidade/módulo ou área diferente.

   Construa a lista cruzando: os contratos reais da Fase 1 (cada entidade/DTO/endpoint novo
   costuma virar uma spec), os módulos/telas de referência da Fase 0.2 (o que já existe não
   precisa de spec própria), e os helpers/componentes reutilizáveis da Fase 2 (reduz o
   escopo — não crie spec para o que já existe). Apresente a lista numerada e ordenada por
   dependência (a ordem já é a ordem de implementação) só para o usuário confirmar ou ajustar
   pontualmente — não como pergunta aberta de "quais specs você imagina".

---

## Regra

Não repita perguntas já respondidas na Fase 0. Só pergunte o que ainda é genuinamente incerto.

A lista de specs apresentada e confirmada aqui define diretamente os arquivos `specs/NN-nome.md`
que serão criados na Fase 4.
