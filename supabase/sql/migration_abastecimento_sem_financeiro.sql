-- Pedido de abastecimento sem controle financeiro
-- ================================================
-- O RV Marine volta a ter o pedido de abastecimento do cliente e a planilha
-- de solicitações no Painel de Controle — mas SÓ o pedido. Preço, valor,
-- cobrança e confirmação de pagamento não existem mais aqui: isso é do
-- RV Finance, o SaaS paralelo.
--
-- O fluxo passa a ser:
--   solicitado  -> o cliente pediu. A equipe vê na planilha do Painel de
--                  Controle, com dois botões: "Confirmar abastecimento" e
--                  "Cancelar".
--   confirmado  -> a equipe confirmou. OU o pedido completou 15 minutos sem
--                  ser cancelado: aí vale como confirmado automaticamente,
--                  sem ninguém precisar clicar em nada.
--   cancelado   -> cancelado pela equipe ou pelo próprio cliente, dentro da
--                  mesma janela de 15 minutos.
--
-- A confirmação automática é derivada de created_at (ver
-- src/lib/statusAbastecimento.js, fonte única): não depende de ninguém estar
-- com o painel aberto, nem de rotina agendada, e dá o mesmo resultado em
-- qualquer tela e no banco. Por isso a janela de 15 minutos aparece aqui
-- também, na policy de cancelamento do cliente — tela e banco dizendo a
-- mesma coisa.
--
-- Idempotente: pode rodar mais de uma vez sem efeito colateral.
--
-- NADA É APAGADO. Os 53 pedidos existentes continuam intactos, com preço e
-- valor gravados; as colunas de pagamento (qr_code, pago_em,
-- informado_pagamento_em, forma_pagamento, payment_id) seguem na tabela,
-- guardando o histórico, apenas sem uso pela aplicação.

begin;

-- 1) Preço e valor deixam de ser obrigatórios ------------------------------
-- O pedido novo não carrega mais valor nenhum, então estas colunas passam a
-- ficar em NULL. NULL aqui quer dizer "não se aplica" — melhor que gravar
-- zero, que seria confundido com "de graça" por quem for ler os dados
-- depois. Os valores já gravados não são tocados.
alter table marina.pedidos_abastecimento
  alter column preco_litro_no_pedido drop not null,
  alter column valor_total           drop not null;

-- O cadastro de combustível passa a ter só nome e ativo/inativo (Painel de
-- Controle -> Configurações -> Combustível), sem preço nem estoque.
alter table marina.combustiveis
  alter column preco_litro drop not null;

-- 2) Momento da confirmação manual -----------------------------------------
-- Só é gravado quando alguém da equipe clica em "Confirmar abastecimento".
-- Ficando NULL num pedido já confirmado, a confirmação foi a automática dos
-- 15 minutos — e o momento dela é sempre created_at + 15 min.
alter table marina.pedidos_abastecimento
  add column if not exists confirmado_em timestamptz;

comment on column marina.pedidos_abastecimento.confirmado_em is
  'Quando a equipe confirmou o pedido manualmente. NULL num pedido confirmado = confirmacao automatica aos 15 min de created_at.';

-- 3) O informe de pagamento do cliente deixa de existir ---------------------
-- Era o "Pagamento efetuado" que o cliente marcava no próprio pedido. Sem
-- cobrança no RV Marine, não há o que informar. A coluna
-- informado_pagamento_em fica na tabela com os carimbos antigos.
drop policy if exists cliente_informa_pagamento_abastecimento on marina.pedidos_abastecimento;

-- 4) Cancelamento pelo cliente, na janela de 15 minutos ---------------------
-- A policy antiga só deixava cancelar em 'aguardando_pagamento' ou
-- 'indisponivel' — status do fluxo financeiro, que não existe mais. Agora é
-- o mesmo critério que a tela usa: pedido ainda em 'solicitado' E dentro dos
-- 15 minutos. Passado esse prazo o pedido vale como confirmado, e o banco
-- recusa o cancelamento mesmo que alguém tente por fora da aplicação.
drop policy if exists cliente_cancela_proprio_pedido_abastecimento on marina.pedidos_abastecimento;

create policy cliente_cancela_proprio_pedido_abastecimento
  on marina.pedidos_abastecimento
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
