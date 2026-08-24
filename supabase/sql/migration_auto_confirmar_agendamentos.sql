-- Confirmação automática de solicitações de descida/subida — se a
-- solicitação não for cancelada dentro do prazo, o status avança sozinho de
-- 'solicitado' para 'confirmado' ("Recebido"), do mesmo jeito que já
-- acontece quando o operador confirma manualmente pelo campo Status da Fila
-- de Rampa (ver STATUS_FILA_OPCOES/mudarStatusAgendamento em TelaVagas.jsx).
--
-- Sem envio de e-mail/notificação separada: o cliente já vê a mudança de
-- status na hora, tanto no Painel de Controle quanto na tela dele, porque os
-- dois já assinam mudanças em marina.agendamentos via Supabase Realtime (ver
-- os canais "vagas-...-agendamentos" em TelaVagas.jsx e a assinatura
-- equivalente em TelaClienteDashboard.jsx) — não precisa de nada além da
-- própria linha mudar no banco.
--
-- Prazos diferentes por tipo, contados a partir de created_at (quando o
-- cliente enviou o pedido): descida (retirada) 30 minutos, subida (retorno)
-- 15 minutos. Se o operador já confirmou manualmente antes disso (ou
-- cancelou), o status não é mais 'solicitado' e a linha nem entra no UPDATE
-- — o job nunca sobrescreve uma decisão que já foi tomada.
--
-- Job roda a cada 5 minutos (mesmo espírito do "limpar-historico-manobras-
-- antigo", que já existe rodando de hora em hora) — folga de até 5 minutos
-- sobre o prazo exato, o que é aceitável pra esse aviso.
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-24 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. Seguro rodar de
-- novo (idempotente: CREATE OR REPLACE + cron.schedule com o mesmo jobname
-- substitui o agendamento anterior).

CREATE OR REPLACE FUNCTION marina.auto_confirmar_agendamentos()
RETURNS void
LANGUAGE sql
AS $$
  UPDATE marina.agendamentos
  SET status = 'confirmado'
  WHERE status = 'solicitado'
    AND (
      (tipo = 'retirada' AND created_at <= now() - interval '30 minutes')
      OR (tipo = 'retorno' AND created_at <= now() - interval '15 minutes')
    );
$$;

COMMENT ON FUNCTION marina.auto_confirmar_agendamentos() IS
  'Executada periodicamente (job pg_cron "auto-confirmar-agendamentos", a cada 5 minutos) — avança sozinha pra "confirmado" (Recebido) toda solicitação de descida/subida ainda em "solicitado" depois do prazo (30min descida / 15min subida), se ninguém confirmou ou cancelou antes.';

SELECT cron.schedule(
  'auto-confirmar-agendamentos',
  '*/5 * * * *',
  $$SELECT marina.auto_confirmar_agendamentos()$$
);
