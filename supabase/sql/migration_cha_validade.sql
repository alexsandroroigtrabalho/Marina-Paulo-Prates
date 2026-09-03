-- Data de validade da CHA (Carteira de Habilitação de Amador) do cliente —
-- Painel de Controle do Administrador → Clientes, campo novo logo abaixo do
-- número da CHA (documento_identidade). Vira a base do indicador automático
-- "REGULAR"/"VENCIDO" nos cards de cliente (ver TelaClientes.jsx).
--
-- É um dado do CLIENTE (a pessoa), não da embarcação — por isso mora em
-- marina.clientes, e não na tabela `documentos` (que já guarda validade de
-- TIE/seguro/vistoria/habilitacao_condutor, mas por EMBARCAÇÃO; uma mesma
-- CHA cobre todas as embarcações de um mesmo cliente, então não fazia
-- sentido duplicar por embarcação).
ALTER TABLE marina.clientes ADD COLUMN IF NOT EXISTS cha_validade DATE;

-- Exclusividade de acesso (alteração): mesmo mecanismo já usado pelos outros
-- campos administrativos/financeiros (ver migration_cliente_edita_proprios_
-- dados.sql) — o trigger "protege_campos_admin_clientes" já existente ganha
-- mais uma coluna na lista do que ele restaura pro valor anterior sempre que
-- quem está editando não é staff (admin/funcionario/operador). Assim, mesmo
-- que um bug ou uma tentativa direta de escrita incluísse cha_validade no
-- payload de "Minha conta" (TelaClienteDashboard.jsx), o valor gravado
-- nunca muda por essa via — só a policy "admin_marina_clientes" (FOR ALL)
-- consegue.
--
-- Exclusividade de acesso (visualização): RLS do Postgres restringe LINHA,
-- não COLUNA — a policy "cliente_proprio_dados" (SELECT) continua liberando
-- a leitura da própria linha inteira, então cha_validade tecnicamente viaja
-- no mesmo payload que o resto do cadastro quando o cliente carrega os
-- próprios dados. Isso segue exatamente o mesmo padrão já aceito hoje para
-- outras colunas administrativas da mesma tabela (status, pagamento_
-- confirmado, acesso_suspenso, observacoes, created_at): a proteção real
-- contra alteração é o trigger acima; a "ocultação" de cha_validade no
-- Diário de Bordo e na visão do cliente é feita na camada de UI (o campo
-- simplesmente nunca é buscado/exibido em TelaClienteDashboard.jsx), não
-- por bloqueio de coluna no banco. Uma coluna verdadeiramente inacessível ao
-- cliente exigiria mover esse dado pra uma view/tabela separada com sua
-- própria RLS, ou checagem via SECURITY DEFINER function — fora do escopo
-- deste pedido; ver comentário equivalente em migration_cliente_edita_
-- proprios_dados.sql.
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
    NEW.cha_validade := OLD.cha_validade;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = marina, public;
-- (o trigger em si — protege_campos_admin_clientes_trigger — não precisa
-- mudar, só a função que ele já chama.)
