# Padrão de RLS: tabelas lidas por staff e por cliente precisam de 2 políticas

## Contexto

No schema `marina`, várias tabelas são lidas tanto pelo lado staff (via
`marina-manager` interno) quanto pelo lado cliente (`TelaClienteDashboard.jsx`).
Auditando `pg_policies` por iniciativa própria (seguindo a regra de
`memory/preferencia-proatividade-diagnostico.md`), foi encontrado que
`marina.combustiveis` tinha só as políticas de staff
(`admin_marina_combustiveis`, `usuarios_marina_veem_combustiveis`, via
`marina.perfis`) e nenhuma política para clientes — o que deixaria o dropdown de
tipos de combustível vazio pra qualquer cliente real (não staff) sem erro
nenhum aparecer. Corrigido com a migração `cliente_ve_combustiveis_da_marina` e
verificado por simulação de RLS (uid real do cliente teste: linhas visíveis; uid
fabricado: 0 linhas, bloqueio correto).

## Regra / checklist

Toda tabela do schema `marina` que alimenta tanto uma tela de staff quanto a
`TelaClienteDashboard.jsx` precisa de **duas políticas SELECT separadas**:

- uma via `marina.perfis` (checando `perfis.marina_id`/`perfis.role`) pro lado
  staff;
- outra via `marina.clientes` (`clientes.user_id = auth.uid()`) pro lado
  cliente.

Faltar a política do cliente **não gera erro** — a query simplesmente retorna 0
linhas pro cliente real, o que é fácil de confundir com "não tem dado" em vez de
"RLS bloqueando". Ao criar uma tabela nova nesse schema que os dois lados vão
ler, ou ao investigar um caso de "cliente não vê X", checar esse padrão primeiro
(via `pg_policies` ou simulação de RLS com o uid do cliente) antes de assumir
outra causa.
