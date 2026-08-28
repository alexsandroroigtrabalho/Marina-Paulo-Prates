-- Confirmar/cancelar em 15 minutos para descida e subida
-- ========================================================
-- A mesma regra já aplicada ao pedido de abastecimento
-- (migration_abastecimento_sem_financeiro.sql) passa a valer também para
-- pedido de descida (retirada) e subida (retorno) na Fila de Rampa: a
-- equipe tem dois botões, "Confirmar" e "Cancelar". Se ninguém decidir em
-- 15 minutos, o pedido vale como confirmado sozinho — o mesmo destino que
-- "Confirmar" sempre gravou (status='concluido' na descida, que já é o que
-- faz a notificação virar "Navegando"; status='navegando' na subida, que já
-- é o que faz a notificação sumir da Fila de Rampa).
--
-- O passo intermediário "Recebido" (status='confirmado') que existia no
-- <select> de 3 opções saiu: agora são só dois botões, igual ao
-- abastecimento. Pedidos antigos com status='confirmado' continuam
-- intactos no banco (não são reescritos) — a aplicação trata esse valor
-- como legado (ver STATUS_LABEL/statusAgendamentoDiario em
-- TelaClienteDashboard.jsx).
--
-- A confirmação automática é derivada de created_at (ver
-- inicioJanelaAgendamento em src/lib/agendamentos.js e
-- src/lib/statusAgendamento.js, fonte única): não depende de ninguém estar
-- com o painel aberto além do momento em que a escrita efetivamente
-- acontece (a própria tela, ao ficar aberta o dia todo numa smart TV,
-- grava sozinha assim que percebe o prazo vencido — ver
-- autoConfirmarVencidos em TelaVagas.jsx). A tela e o banco calculam a
-- mesma janela de 15 minutos, então nunca divergem sobre até quando dá pra
-- cancelar.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral. NADA É
-- APAGADO.

begin;

-- Cancelamento pelo cliente, na janela de 15 minutos ----------------------
-- A policy antiga liberava cancelamento em 'solicitado' OU 'confirmado' —
-- 'confirmado' era o antigo passo "Recebido", que saiu do fluxo. Agora é o
-- mesmo critério que a tela usa (aguardandoDecisaoAgendamento): pedido
-- ainda em 'solicitado' E dentro dos 15 minutos de created_at. Passado esse
-- prazo o pedido vale como confirmado, e o banco recusa o cancelamento
-- mesmo que alguém tente por fora da aplicação.
drop policy if exists cliente_cancela_proprio_agendamento on marina.agendamentos;

create policy cliente_cancela_proprio_agendamento
  on marina.agendamentos
  for update
  using (
    cliente_id in (select c.id from marina.clientes c where c.user_id = auth.uid())
    and status = 'solicitado'
    and created_at > now() - interval '15 minutes'
  )
  with check (
    cliente_id in (select c.id from marina.clientes c where c.user_id = auth.uid())
    and status = 'cancelado'
  );

commit;

-- Job do banco corrigido -----------------------------------------------
-- Existia (de antes desta sessão) um job do pg_cron
-- ("auto-confirmar-agendamentos", a cada 5 minutos) chamando
-- marina.auto_confirmar_agendamentos() com a regra ANTIGA do fluxo de 3
-- passos: 30 minutos pra descida, 15 pra subida, indo para o status
-- intermediário 'confirmado' (o antigo "Recebido"). Ele continuava rodando
-- e teria brigado com a regra nova. Corrigido para os mesmos 15 minutos
-- dos dois tipos, indo direto para o status final (ver
-- statusFinalAgendamento em src/lib/statusAgendamento.js): 'concluido' na
-- descida (com concluido_em), 'navegando' na subida. Esse job é a rede de
-- segurança que garante a confirmação automática mesmo com todo painel
-- fechado — a varredura feita pela própria tela (autoConfirmarVencidos em
-- TelaVagas.jsx) só adianta o resultado enquanto alguém está com o Painel
-- de Controle aberto.
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
  set status = 'navegando'
  where status = 'solicitado'
    and tipo = 'retorno'
    and created_at <= now() - interval '15 minutes';
$function$;
