-- Acesso livre no RV Marine: a Agenda (descida/subida) deixa de depender de
-- confirmação de pagamento.
--
-- Motivo: o controle financeiro e de liberação de acesso sai do RV Marine e
-- passa a ser feito no RV Finance, o SaaS paralelo. Dentro do RV Marine o
-- cliente tem liberdade de acesso; quem entra na plataforma passa a ser
-- controlado pela forma de cadastro (sublink próprio fornecido pela marina),
-- não por um bloqueio dentro do aplicativo.
--
-- O que muda na policy "cliente_cria_agendamento":
--   REMOVIDO   (pagamento_confirmado = true OR acesso_liberado_manual = true)
--   MANTIDO    o cliente só cria agendamento PARA SI (user_id = auth.uid())
--   MANTIDO    acesso_suspenso = false — suspensão é uma ação administrativa
--              da marina, não um bloqueio financeiro, então continua valendo
--   MANTIDO    o alinhamento do horário à grade da rampa
--              (rampaIntervaloMinutos), que é regra de agenda, não de dinheiro
--
-- As colunas pagamento_confirmado / acesso_liberado_manual NÃO são removidas:
-- os dados históricos ficam preservados para a migração do módulo financeiro
-- (RV Finance). Esta migração só para de USÁ-LAS como condição de acesso.
--
-- COALESCE em acesso_suspenso: hoje a coluna tem default false e nenhuma
-- linha nula, mas "NULL = false" resulta em NULL (não em true), o que
-- bloquearia silenciosamente qualquer cliente que viesse com o campo vazio.
-- O COALESCE deixa a regra imune a isso.
--
-- Idempotente: seguro rodar mais de uma vez.

DROP POLICY IF EXISTS "cliente_cria_agendamento" ON marina.agendamentos;

CREATE POLICY "cliente_cria_agendamento" ON marina.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (
    cliente_id IN (
      SELECT c.id
        FROM marina.clientes c
      WHERE c.user_id = auth.uid()
        AND COALESCE(c.acesso_suspenso, false) = false
    )
    AND (
      (EXTRACT(epoch FROM data_hora))::bigint
      % ((COALESCE(
            (SELECT ((m.config_json ->> 'rampaIntervaloMinutos'))::integer
               FROM marina.marinas m
              WHERE m.id = agendamentos.marina_id),
            15) * 60))::bigint
    ) = 0
  );
