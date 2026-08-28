# Propostas pendentes do Dream — 2026-08-28

1. [preferência repetida] Registrar diretiva permanente de proatividade diagnóstica: ao
   corrigir um bug relatado, auditar por conta própria outros domínios/tabelas com o
   mesmo padrão antes de reportar como resolvido — não esperar o usuário apontar cada
   ocorrência separadamente.
   Arquivo alvo: novo arquivo `memory/preferencia-proatividade-diagnostico.md`
   Evidência: "aprenda com essa falha e em novos comandos se antecipe - corrija e me
   avise" — conversa atual, logo após o usuário mostrar um print do Diário de Bordo com
   itens presos em domínios (ordens_servico, despachos, pedidos_abastecimento) que eu
   não tinha verificado — eu tinha investigado só `agendamentos` até então, apesar de o
   bug (`classeStatusDiario` sem tratar status terminal em todo domínio) ser o mesmo em
   todos.
   Ação proposta: criar o arquivo com contexto (o episódio que gerou a regra) + a regra
   em si ("ao corrigir um bug de um domínio/tabela, checar se domínios irmãos com
   estrutura parecida têm o mesmo problema, e corrigir tudo de uma vez, antes de dar
   como concluído"), e adicionar uma linha em `memory/MEMORY.md` apontando pra ele.

2. [fato novo] Padrão de RLS recorrente no schema `marina`: tabelas lidas tanto por
   staff quanto por clientes (ex: `combustiveis`) precisam de DUAS políticas SELECT
   separadas — uma via `marina.perfis` (staff) e outra via `marina.clientes`/
   `clientes.user_id = auth.uid()` (cliente). Faltar a política do cliente não dá erro
   nenhum — só retorna 0 linhas silenciosamente pro cliente real, o que é fácil de
   confundir com "não tem dado" em vez de "RLS bloqueando".
   Arquivo alvo: novo arquivo `memory/padrao-rls-staff-vs-cliente.md`
   Evidência: descoberto nesta sessão ao auditar `pg_policies` do schema `marina` por
   iniciativa própria (item 1 acima) — `marina.combustiveis` tinha só as políticas
   `admin_marina_combustiveis` e `usuarios_marina_veem_combustiveis` (via
   `marina.perfis`), sem nenhuma via `marina.clientes`; corrigido com a migração
   `cliente_ve_combustiveis_da_marina` e verificado via simulação de RLS (uid real do
   cliente teste: linhas visíveis; uid fabricado: 0 linhas, bloqueio correto).
   Ação proposta: criar o arquivo com o padrão descrito acima como checklist pra
   qualquer tabela nova do schema `marina` que sirva os dois lados, e adicionar uma
   linha em `memory/MEMORY.md` apontando pra ele.

Nenhuma correção pequena/mecânica pra auto-aplicar nesta rodada — `MEMORY.md` ainda
estava vazio, sem nada pra corrigir de forma, só pra criar de conteúdo (o que exige
aprovação, ver acima).
