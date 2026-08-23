-- "Meus dados" no Painel do Cliente (TelaClienteDashboard.jsx →
-- Configurações → Meus dados) passou de só-leitura para editável — o
-- cliente final agora pode corrigir o próprio cadastro (nome, CPF,
-- documento de identidade, e-mail, telefone, endereço) sem depender da
-- administração da marina.
--
-- Antes só existia a policy de SELECT (cliente_proprio_dados), então
-- qualquer UPDATE vindo do cliente era barrado pelo RLS. A policy nova
-- abaixo libera UPDATE só na própria linha (user_id = auth.uid()).
--
-- RLS do Postgres restringe LINHA, não COLUNA — então o trigger abaixo é o
-- que garante que campos administrativos/financeiros (marina_id, user_id,
-- status, cadastro_confirmado, pagamento_confirmado(_em), acesso_suspenso,
-- acesso_liberado_manual, observacoes, created_at) nunca mudam quando quem
-- está editando é o próprio cliente (não staff da marina): mesmo que o
-- valor enviado pelo front-end seja diferente, o trigger devolve pro valor
-- anterior antes do UPDATE ser gravado. Só o staff (admin/funcionario/
-- operador), via "admin_marina_clientes" (FOR ALL, já existente), continua
-- podendo mudar esses campos normalmente.
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-23 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. Seguro rodar de
-- novo (idempotente: DROP POLICY/TRIGGER IF EXISTS + CREATE OR REPLACE).

DROP POLICY IF EXISTS "cliente_atualiza_proprios_dados" ON marina.clientes;
CREATE POLICY "cliente_atualiza_proprios_dados" ON marina.clientes
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION marina.protege_campos_admin_clientes()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM marina.perfis WHERE id = auth.uid() AND role IN ('admin','funcionario','operador')
  ) THEN
    NEW.marina_id := OLD.marina_id;
    NEW.user_id := OLD.user_id;
    NEW.status := OLD.status;
    NEW.cadastro_confirmado := OLD.cadastro_confirmado;
    NEW.pagamento_confirmado := OLD.pagamento_confirmado;
    NEW.pagamento_confirmado_em := OLD.pagamento_confirmado_em;
    NEW.acesso_suspenso := OLD.acesso_suspenso;
    NEW.acesso_liberado_manual := OLD.acesso_liberado_manual;
    NEW.observacoes := OLD.observacoes;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = marina, public;

DROP TRIGGER IF EXISTS protege_campos_admin_clientes_trigger ON marina.clientes;
CREATE TRIGGER protege_campos_admin_clientes_trigger
  BEFORE UPDATE ON marina.clientes
  FOR EACH ROW EXECUTE FUNCTION marina.protege_campos_admin_clientes();
