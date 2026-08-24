-- Amplia a policy "cliente_cancela_proprio_agendamento" pra também permitir
-- que o cliente cancele uma descida/subida já em "Recebido" (status
-- 'confirmado'), não só enquanto "Solicitado" — pedido do botão "Cancelar"
-- direto no Diário de Bordo do cliente (ver cancelarAgendamentoCliente em
-- TelaClienteDashboard.jsx). Antes desta migration, a policy só liberava o
-- UPDATE com status = 'solicitado'; a UI, se mostrasse "Cancelar" também
-- pra "Recebido", ia bater num "permission denied"/0 linhas afetadas.
--
-- Continua restrito a: (1) só a própria linha (cliente_id do usuário
-- autenticado); (2) só enquanto status ainda for 'solicitado' ou
-- 'confirmado' — a partir de "Navegando" o cancelamento vira decisão da
-- marina, pelo Painel de Controle, não mais do cliente; (3) o resultado só
-- pode ser 'cancelado' (WITH CHECK) — o cliente não ganha, com isso, poder
-- de editar mais nada na própria linha (data_hora, embarcação etc.), só de
-- cancelar.
--
-- Cancelar já propaga sozinho pro resto do sistema, sem precisar de mais
-- nada nesta migration:
--  - Painel de Controle / Fila de Rampa: já assina mudanças em
--    marina.agendamentos via Supabase Realtime (canal "vagas-...-agendamentos"
--    em TelaVagas.jsx) e linhasFila/statusLinha já excluem status='cancelado'.
--  - Agenda (marina.horarios_ocupados, ver migration_horarios_ocupados_agenda.sql):
--    já ignora status='cancelado' ao calcular horários ocupados — o horário
--    volta a ficar disponível pra outro cliente na hora.
--
-- Testado numa transação isolada em produção (com rollback, sem deixar
-- rastro) antes de aplicar de verdade: cancelar um 'confirmado' → permitido;
-- tentar cancelar um 'navegando' → bloqueado (0 linhas afetadas).
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-24 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. Seguro rodar de
-- novo (idempotente: DROP POLICY IF EXISTS + CREATE POLICY).

DROP POLICY IF EXISTS "cliente_cancela_proprio_agendamento" ON marina.agendamentos;
CREATE POLICY "cliente_cancela_proprio_agendamento" ON marina.agendamentos
  FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()) AND status IN ('solicitado', 'confirmado'))
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()) AND status = 'cancelado');
