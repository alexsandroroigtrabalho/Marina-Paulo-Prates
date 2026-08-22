-- ============================================================
-- MIGRAÇÃO: status de cadastro/pagamento/acesso do cliente
-- Rode este script no SQL Editor do Supabase do projeto já existente
-- (schema.sql já foi atualizado com o equivalente para instalações novas).
-- ============================================================

ALTER TABLE marina.clientes ADD COLUMN IF NOT EXISTS cadastro_confirmado BOOLEAN DEFAULT true;
ALTER TABLE marina.clientes ADD COLUMN IF NOT EXISTS pagamento_confirmado BOOLEAN DEFAULT true;
ALTER TABLE marina.clientes ALTER COLUMN pagamento_confirmado SET DEFAULT false;
ALTER TABLE marina.clientes ADD COLUMN IF NOT EXISTS acesso_suspenso BOOLEAN DEFAULT false;

DROP POLICY IF EXISTS "cliente_cria_agendamento" ON marina.agendamentos;
CREATE POLICY "cliente_cria_agendamento" ON marina.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (
      SELECT id FROM marina.clientes
      WHERE user_id = auth.uid() AND pagamento_confirmado = true AND acesso_suspenso = false
    )
  );
