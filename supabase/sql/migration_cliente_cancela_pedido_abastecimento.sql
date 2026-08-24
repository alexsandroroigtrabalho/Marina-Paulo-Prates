-- Nova policy "cliente_cancela_proprio_pedido_abastecimento" — pedido do
-- botão "Cancelar" direto no Diário de Bordo do cliente, pra um pedido de
-- abastecimento (ver cancelarAbastecimentoCliente em TelaClienteDashboard.jsx),
-- mesmo padrão já usado pra descida/subida (ver
-- migration_cliente_cancela_confirmado.sql, policy
-- "cliente_cancela_proprio_agendamento"). Antes desta migration não existia
-- nenhuma policy de UPDATE pro cliente em marina.pedidos_abastecimento — só
-- FOR ALL pro staff da marina e FOR INSERT/SELECT pro próprio cliente — então
-- o botão "Cancelar" ia bater num "permission denied"/0 linhas afetadas.
--
-- Restrito a: (1) só a própria linha (cliente_id do usuário autenticado);
-- (2) só enquanto status ainda for 'aguardando_pagamento' ou 'indisponivel'
-- — uma vez "Pagamento efetuado" (status='pago') o pedido já foi concluído e
-- some da tela do administrador e do Diário de Bordo (ver pedidosVisiveis em
-- TelaAbastecimento.jsx e o filtro correspondente em diarioDeBordo, dentro
-- de TelaClienteDashboard.jsx) — não faz sentido cancelar o que já foi pago;
-- (3) o resultado só pode ser 'cancelado' (WITH CHECK) — o cliente não ganha,
-- com isso, poder de editar mais nada na própria linha (quantidade, valor,
-- combustível etc.), só de cancelar.
--
-- Cancelar já propaga sozinho pro resto do sistema, sem precisar de mais
-- nada nesta migration:
--  - Painel de Controle (TelaAbastecimento.jsx): assina mudanças em
--    marina.pedidos_abastecimento via Supabase Realtime (canal
--    "abastecimento-{marinaId}-pedidos", adicionado junto com esta feature,
--    mesmo padrão já usado em TelaFinanceiro.jsx pra essa mesma tabela) —
--    atualiza sozinho, sem precisar trocar de aba.
--  - Diário de Bordo do próprio cliente: já assina a mesma tabela (canal
--    existente em TelaClienteDashboard.jsx, filtro por cliente_id) — o botão
--    de cancelar some junto com o status "Cancelado" aparecendo, sem F5.
--  - Arrecadação detalhada (TelaFinanceiro.jsx): 'cancelado' nunca contou
--    como receita ali (só 'pago'/'entregue' contam) — nada muda.
--
-- Testado numa transação isolada em produção (DO block com RAISE EXCEPTION
-- no final, revertendo tudo — pedidos de teste inseridos e já removidos
-- pelo rollback, cliente real "Cliente Teste" usado só pro auth.uid()) antes
-- de aplicar de verdade: cancelar um 'aguardando_pagamento' → permitido (1
-- linha); cancelar um 'indisponivel' → permitido (1 linha); tentar cancelar
-- um 'pago' → bloqueado (0 linhas afetadas). Confirmado depois, por leitura
-- direta, que nenhum dado de teste ficou gravado na tabela.
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-24 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. Seguro rodar de
-- novo (idempotente: DROP POLICY IF EXISTS + CREATE POLICY).

DROP POLICY IF EXISTS "cliente_cancela_proprio_pedido_abastecimento" ON marina.pedidos_abastecimento;
CREATE POLICY "cliente_cancela_proprio_pedido_abastecimento" ON marina.pedidos_abastecimento
  FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()) AND status IN ('aguardando_pagamento', 'indisponivel'))
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()) AND status = 'cancelado');
