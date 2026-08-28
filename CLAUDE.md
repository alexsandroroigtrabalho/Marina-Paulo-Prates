# Marina Manager (RV Invictus) — índice

## Memória persistente

Este projeto usa um sistema de memória em arquivo, dentro do próprio repo (não uma
memória automática de plataforma): o índice fica em `memory/MEMORY.md`, com um
arquivo por memória no mesmo diretório. Regras completas de quando salvar/ler estão
na skill "dream" (abaixo).

## Rotina "dream"

Skill em [.claude/skills/dream/SKILL.md](.claude/skills/dream/SKILL.md), invocada por
`/dream` ou automaticamente todas as noites às 03:00 (tarefa agendada
`dream-nightly-marina-manager`).

O que ela faz: revisa o contexto recente do projeto (a conversa em andamento, quando
houver, mais `memory/session-log.md`), compara com a memória atual e propõe
correções, memórias novas, memórias desatualizadas e duplicatas a remover.

Adaptada do padrão original em `~/dream` no Mac do usuário — ali o "ler sessões
recentes" usa uma API de histórico de sessões que não existe neste ambiente
(Cowork); aqui, `memory/session-log.md` cumpre esse papel. Ver o cabeçalho do
próprio SKILL.md para o motivo completo.

- Erros de digitação e ajustes puramente mecânicos no índice são aplicados
  automaticamente.
- Qualquer outra alteração fica registrada em `memory/dream-pending.md`, numerada,
  aguardando aprovação.

**Protocolo de aprovação** (funciona em qualquer sessão sobre este projeto, não só
na que gerou a proposta):

- `Dream apply [1, 2, 3]` — aplica só esses itens de `memory/dream-pending.md`.
- `Dream apply all` — aplica todos os itens pendentes.

Nunca excluir ou reescrever o conteúdo de uma memória sem essa aprovação explícita.
Em caso de dúvida, apenas propor.

## Desenvolvimento

Fluxo completo de edição/validação/sincronização/deploy está na skill
`marina-manager-dev` (fora deste repo, no perfil do usuário) — consultar antes de
qualquer mudança de código aqui. Resumo rápido: editar → validar com esbuild →
sincronizar pro Mac com guarda de mtime → commitar (nunca dar push — o usuário
mesmo revisa e sobe).
