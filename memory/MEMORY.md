# Índice de memória — Marina Manager

Um arquivo por memória, nesta mesma pasta (`memory/`). Cada entrada abaixo aponta
para um arquivo e resume em uma linha o que ele guarda. Ver
`.claude/skills/dream/SKILL.md` para as regras de quando criar, atualizar ou
remover uma entrada — nunca fazer isso fora do fluxo do `/dream` (auto-aplicável só
pra erro de digitação/formatação; o resto pede aprovação explícita via
`Dream apply`).

- [preferencia-proatividade-diagnostico.md](preferencia-proatividade-diagnostico.md)
  — ao corrigir um bug relatado, auditar por conta própria domínios/tabelas
  irmãos com o mesmo padrão antes de dar como concluído.
- [padrao-rls-staff-vs-cliente.md](padrao-rls-staff-vs-cliente.md) — toda tabela
  do schema `marina` lida por staff e cliente precisa de política RLS separada
  pra cada lado; faltar a do cliente não dá erro, só retorna 0 linhas.
