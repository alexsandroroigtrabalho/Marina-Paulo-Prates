-- Ajuste da regra de descida/subida: janela por tipo, destino único
-- =====================================================================
-- Correção sobre migration_agendamento_15min.sql (aplicada nesta mesma
-- sessão, poucas horas antes): a subida NÃO usa mais os mesmos 15 minutos
-- da descida. Ficou:
--
--   descida (retirada): 15 minutos. Botão "Navegando" (ou o prazo vencer)
--                        leva pro status final 'concluido' — a embarcação
--                        aparece na tabela "Navegando".
--   subida  (retorno):  5 minutos — mais curta, porque o cliente já está
--                        de volta ou perto disso quando pede. Botão
--                        "Recolhido" (ou o prazo vencer) leva TAMBÉM pro
--                        status final 'concluido' — não existe mais um
--                        'navegando' intermediário pra subida. Confirmar a
--                        subida já É o "Recolhido": a notificação some da
--                        Fila de Rampa E, no mesmo instante, a embarcação
--                        some da tabela "Navegando" (ver
--                        ultimaMovimentacaoPorEmbarcacao em
--                        lib/agendamentos.js — o 'concluido' da subida
--                        passa a ser a movimentação mais recente da
--                        embarcação).
--
-- Fonte única da regra: src/lib/statusAgendamento.js
-- (JANELA_DESCIDA_MS = 15min, JANELA_SUBIDA_MS = 5min,
-- statusFinalAgendamento sempre 'concluido' pros dois tipos).
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral. NADA É
-- APAGADO.

begin;

-- Cancelamento pelo cliente: janela por tipo -------------------------------
drop policy if exists cliente_cancela_proprio_agendamento on marina.agendamentos;

create policy cliente_cancela_proprio_agendamento
  on marina.agendamentos
  for update
  using (
    cliente_id in (select c.id from marina.clientes c where c.user_id = auth.uid())
    and status = 'solicitado'
    and created_at > now() - (case when tipo = 'retirada' then interval '15 minutes' else interval '5 minutes' end)
  )
  with check (
    cliente_id in (select c.id from marina.clientes c where c.user_id = auth.uid())
    and status = 'cancelado'
  );

commit;

-- Job do banco (pg_cron "auto-confirmar-agendamentos", a cada 5 minutos) --
-- Agora com a janela certa por tipo e o mesmo destino ('concluido') pros
-- dois — antes a subida ainda usava 15 minutos e ia pro status
-- intermediário 'navegando'.
create or replace function marina.auto_confirmar_agendamentos()
returns void
language sql
set search_path = ''
as $function$
  update marina.agendamentos
  set status = 'concluido', concluido_em = now()
  where status = 'solicitado'
    and tipo = 'retirada'
    and created_at <= now() - interval '15 minutes';

  update marina.agendamentos
  set status = 'concluido', concluido_em = now()
  where status = 'solicitado'
    and tipo = 'retorno'
    and created_at <= now() - interval '5 minutes';
$function$;
