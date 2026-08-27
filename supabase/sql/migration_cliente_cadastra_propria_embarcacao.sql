-- O cliente passa a cadastrar e editar as PRÓPRIAS embarcações, pelo painel
-- do cliente ("Minha conta" → Embarcações).
--
-- Motivo: as embarcações saíram do cadastro inicial (que virou só a conta de
-- acesso à plataforma, comum às 7 aplicações) e passaram a ser um dado
-- específico do RV Marine, completado dentro dele. Sem esta permissão o
-- cliente ficaria sem nenhuma forma de registrar a embarcação e nunca
-- conseguiria agendar uma descida.
--
-- A marina continua podendo cadastrar a embarcação pelo Painel de Controle:
-- a policy "admin_marina_embarcacoes" (FOR ALL) já existente não é tocada.
-- Os dois caminhos convivem.
--
-- O que estas policies garantem:
--   - o cliente só mexe em embarcação ligada à PRÓPRIA linha de cliente
--     (cliente_id ... WHERE user_id = auth.uid())
--   - a marina_id gravada tem de ser a da própria linha de cliente, então
--     não dá pra inserir embarcação em outra marina
--   - não há policy de DELETE de propósito: excluir embarcação segue sendo
--     ação da administração da marina, para não sumir com histórico de
--     agendamentos/despachos ligados a ela
--
-- Idempotente: seguro rodar mais de uma vez.

DROP POLICY IF EXISTS "cliente_cria_propria_embarcacao" ON marina.embarcacoes;

CREATE POLICY "cliente_cria_propria_embarcacao" ON marina.embarcacoes
  FOR INSERT TO authenticated
  WITH CHECK (
    (cliente_id, marina_id) IN (
      SELECT c.id, c.marina_id
        FROM marina.clientes c
       WHERE c.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "cliente_edita_propria_embarcacao" ON marina.embarcacoes;

CREATE POLICY "cliente_edita_propria_embarcacao" ON marina.embarcacoes
  FOR UPDATE TO authenticated
  USING (
    cliente_id IN (
      SELECT c.id FROM marina.clientes c WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    (cliente_id, marina_id) IN (
      SELECT c.id, c.marina_id
        FROM marina.clientes c
       WHERE c.user_id = auth.uid()
    )
  );
