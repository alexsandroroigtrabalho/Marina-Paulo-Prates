-- Vencimento automático da descida deixa de finalizar sozinho
-- =============================================================
-- Correção sobre migration_subida_confirmada_e_motivo_cancelamento.sql
-- (aplicada nesta mesma sessão, pouco antes): até aqui, só a SUBIDA tinha
-- esse comportamento — vencer o prazo da DESCIDA sem decisão da equipe
-- ainda ia direto pro status final 'concluido', jogando a embarcação pra
-- tabela "Navegando" sozinha, sem ninguém confirmar que o barco realmente
-- entrou na água. Ficou:
--
--   - Clique manual da equipe ("Navegando"/"Recolhido") continua sendo o
--     único jeito de finalizar de verdade — sempre 'concluido', pros dois
--     tipos (statusFinalAgendamento, em src/lib/statusAgendamento.js). Isso
--     não mudou.
--   - Vencer o prazo SOZINHO agora tem o MESMO destino pros dois tipos
--     (statusAutoConfirmadoAgendamento, mesmo arquivo): sempre 'confirmado'
--     — nunca 'concluido'. A notificação continua na Fila de Rampa e a
--     embarcação NÃO aparece em "Navegando" (nem sai de lá) só porque o
--     relógio venceu; só o clique manual muda isso.
--
-- Fonte única da regra: src/lib/statusAgendamento.js.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral. NADA É
-- APAGADO.

-- Job do banco (pg_cron "auto-confirmar-agendamentos", a cada 5 minutos) --
-- Descida: agora vai pra 'confirmado' — SEM concluido_em (não é o
-- encerramento de verdade, esse só acontece quando a equipe clica
-- "Navegando", que grava 'concluido' + concluido_em pela via normal —
-- atualizarStatusAgendamento em lib/db.js). Subida: sem mudança (já ia pra
-- 'confirmado' desde a migração anterior).
create or replace function marina.auto_confirmar_agendamentos()
returns void
language sql
set search_path = ''
as $function$
  update marina.agendamentos
  set status = 'confirmado'
  where status = 'solicitado'
    and tipo = 'retirada'
    and created_at <= now() - interval '15 minutes';

  update marina.agendamentos
  set status = 'confirmado'
  where status = 'solicitado'
    and tipo = 'retorno'
    and created_at <= now() - interval '5 minutes';
$function$;
