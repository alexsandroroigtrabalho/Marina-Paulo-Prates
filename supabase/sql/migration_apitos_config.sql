-- Migração incremental: permite que admin/funcionário/operador leiam e
-- atualizem a config_json da PRÓPRIA marina (necessário para a nova tela
-- "Configurar apitos" no Painel de Controle, que grava apitosDescida /
-- apitosRetorno ali). Antes disso só quem tinha role = 'operador' tinha
-- qualquer acesso à tabela marina.marinas.
--
-- Rode este script uma vez no SQL Editor do Supabase (Dashboard do projeto
-- > SQL Editor > New query > cole e rode). Ele é seguro rodar mais de uma
-- vez (DROP POLICY IF EXISTS antes de recriar).

DROP POLICY IF EXISTS "staff_ve_propria_marina" ON marina.marinas;
CREATE POLICY "staff_ve_propria_marina" ON marina.marinas
  FOR SELECT TO authenticated
  USING (id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

DROP POLICY IF EXISTS "staff_atualiza_propria_marina" ON marina.marinas;
CREATE POLICY "staff_atualiza_propria_marina" ON marina.marinas
  FOR UPDATE TO authenticated
  USING (id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));
