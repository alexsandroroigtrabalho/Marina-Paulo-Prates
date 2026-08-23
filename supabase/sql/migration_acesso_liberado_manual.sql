-- Migração incremental: permite que a administração libere manualmente o
-- acesso de um cliente à Agenda (retirada/retorno) e demais áreas que hoje
-- dependem de pagamento_confirmado, mesmo com o pagamento ainda pendente —
-- sem alterar o status financeiro (pagamento_confirmado continua igual).
--
-- Rode este script uma vez no SQL Editor do Supabase (Dashboard do projeto
-- > SQL Editor > New query > cole e rode). Ele é seguro rodar mais de uma
-- vez.

ALTER TABLE marina.clientes ADD COLUMN IF NOT EXISTS acesso_liberado_manual BOOLEAN DEFAULT false;

-- Agenda passa a aceitar pedido também de quem tem a liberação manual ativa,
-- além de quem já tem o pagamento confirmado.
DROP POLICY IF EXISTS "cliente_cria_agendamento" ON marina.agendamentos;
CREATE POLICY "cliente_cria_agendamento" ON marina.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (
      SELECT id FROM marina.clientes
      WHERE user_id = auth.uid() AND acesso_suspenso = false
        AND (pagamento_confirmado = true OR acesso_liberado_manual = true)
    )
  );
