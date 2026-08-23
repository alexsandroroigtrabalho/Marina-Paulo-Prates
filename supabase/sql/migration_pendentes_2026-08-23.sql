-- Migrações pendentes desta sessão — junta num script só pra rodar de uma
-- vez no SQL Editor do Supabase (Dashboard do projeto > SQL Editor > New
-- query > cole e rode). Seguro rodar mais de uma vez (idempotente).
--
-- Equivale a rodar, nesta ordem:
--   1. migration_resgate_status.sql
--   2. migration_acesso_liberado_manual.sql
-- (mantidos também como arquivos separados, por histórico).

-- ============================================================
-- 1. Status do resgate (S.O.S.) — Painel de Controle
-- ============================================================
-- Troca o alerta de resgate de um booleano simples (resgate_solicitado) por
-- um status com 3 etapas em resgate_status — "solicitado" (cliente aciona o
-- S.O.S., ou a equipe marca manualmente), "recebido" (equipe confirma que
-- viu o pedido — o apito contínuo de SOS para aqui) e "resgatado" (equipe
-- marca quando o atendimento termina). Ver src/lib/statusResgate.js.

ALTER TABLE marina.agendamentos ADD COLUMN IF NOT EXISTS resgate_status TEXT;

-- Migra qualquer S.O.S. já em aberto (resgate_solicitado = true) pro novo
-- status "solicitado", pra não perder um alerta ativo na troca.
UPDATE marina.agendamentos
SET resgate_status = 'solicitado'
WHERE resgate_solicitado = true AND resgate_status IS NULL;

-- ============================================================
-- 2. Liberação manual de acesso — aba Clientes
-- ============================================================
-- Permite que a administração libere manualmente o acesso de um cliente à
-- Agenda (retirada/retorno) e demais áreas que hoje dependem de
-- pagamento_confirmado, mesmo com o pagamento ainda pendente — sem alterar
-- o status financeiro (pagamento_confirmado continua igual).

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
