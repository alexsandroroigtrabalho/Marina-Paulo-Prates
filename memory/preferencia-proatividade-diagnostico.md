# Proatividade diagnóstica ao corrigir bugs

## Contexto

Durante a investigação de "o Diário de Bordo não limpa itens antigos", a
depuração ficou concentrada inteiramente no domínio `agendamentos` (Descida/Subida)
por várias rodadas. Um print enviado pelo usuário revelou que o problema real
estava, na verdade, em outros domínios (`pedidos_abastecimento`,
`ordens_servico`) que nunca tinham sido verificados — todos com a mesma causa raiz
(`classeStatusDiario` não tratando status terminal/cancelado em todo domínio).

Evidência: "aprenda com essa falha e em novos comandos se antecipe - corrija e me
avise" — mensagem do usuário logo após esse print, cobrando que eu não devia ter
me limitado a investigar só o domínio citado no relato original.

## Regra

Ao corrigir um bug relatado num domínio/tabela específico, verificar por conta
própria se domínios/tabelas irmãos com estrutura ou lógica parecida sofrem do
mesmo problema — e corrigir todos de uma vez — antes de reportar a correção como
concluída. Não esperar o usuário precisar apontar cada ocorrência separadamente.

Isso vale tanto pra bugs de lógica de aplicação (como o `classeStatusDiario`
acima, que afetava vários domínios de status no Diário de Bordo) quanto pra
padrões de configuração/infra que se repetem por várias tabelas ou telas — ver
também `memory/padrao-rls-staff-vs-cliente.md`, achado da mesma sessão seguindo
essa mesma regra.
