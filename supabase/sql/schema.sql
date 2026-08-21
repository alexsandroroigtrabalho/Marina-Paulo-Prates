-- ============================================================
-- NOTA: as tabelas vivem no schema "marina" (não no "public") para
-- poder coexistir no MESMO projeto Supabase do RV Invictus (limite de
-- 2 projetos gratuitos na conta) sem colidir com as tabelas da escola
-- náutica. Se um dia este projeto ganhar seu próprio projeto Supabase
-- dedicado, pode-se rodar este script trocando "marina." por nada
-- (schema public) e remover o bloco de "Permissões de schema" do final.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS marina;

-- ============================================================
-- Schema: Plataforma de Gerenciamento de Marina
-- Baseado no padrão multi-tenant do projeto RV Invictus
-- ============================================================

-- Extensão necessária para gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ------------------------------------------------------------
-- 1. MARINAS (tenant raiz — cada marina é um cliente da plataforma)
-- ------------------------------------------------------------
CREATE TABLE marina.marinas (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nome          TEXT NOT NULL,
  email         TEXT,
  telefone      TEXT,
  endereco      TEXT,
  plano         TEXT DEFAULT 'trial',
  status        TEXT DEFAULT 'trial',        -- trial | ativo | suspenso
  config_json   JSONB DEFAULT '{}',           -- branding, cores, logotipo
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 2. PERFIS (usuários do sistema, vinculados ao auth.users do Supabase)
-- ------------------------------------------------------------
CREATE TABLE marina.perfis (
  id          UUID REFERENCES auth.users(id) PRIMARY KEY,
  role        TEXT NOT NULL DEFAULT 'cliente',   -- operador | admin | funcionario | cliente
  nome        TEXT,
  telefone    TEXT,
  marina_id   UUID REFERENCES marina.marinas(id),
  created_at  TIMESTAMPTZ DEFAULT now()
);

CREATE OR REPLACE FUNCTION marina.criar_perfil()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO marina.perfis (id, role, nome)
  VALUES (NEW.id, 'cliente', NEW.raw_user_meta_data->>'nome');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created_marina
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION marina.criar_perfil();

-- ------------------------------------------------------------
-- 3. CLIENTES (sócios/donos de embarcações)
-- ------------------------------------------------------------
CREATE TABLE marina.clientes (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id     UUID REFERENCES marina.marinas(id) NOT NULL,
  user_id       UUID REFERENCES auth.users(id),      -- vínculo opcional com login
  nome          TEXT NOT NULL,
  email         TEXT,
  telefone      TEXT,
  cpf_cnpj      TEXT,
  endereco      TEXT,
  status        TEXT DEFAULT 'ativo',                -- ativo | inadimplente | inativo
  observacoes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 4. EMBARCAÇÕES
-- ------------------------------------------------------------
CREATE TABLE marina.embarcacoes (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id       UUID REFERENCES marina.marinas(id) NOT NULL,
  cliente_id      UUID REFERENCES marina.clientes(id) NOT NULL,
  nome            TEXT NOT NULL,
  tipo            TEXT,                    -- lancha | veleiro | jet ski | iate ...
  fabricante      TEXT,
  modelo          TEXT,
  ano             INT,
  comprimento_m   NUMERIC(5,2),
  boca_m          NUMERIC(5,2),
  calado_m        NUMERIC(5,2),
  registro        TEXT,                    -- número de registro/matrícula (Marinha)
  seguro_validade DATE,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 5. VAGAS (slips / atracação)
-- ------------------------------------------------------------
CREATE TABLE marina.vagas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id         UUID REFERENCES marina.marinas(id) NOT NULL,
  codigo            TEXT NOT NULL,          -- ex: "Píer A - 12"
  setor             TEXT,                   -- píer / marina seca / pátio
  comprimento_m     NUMERIC(5,2),
  largura_m         NUMERIC(5,2),
  calado_max_m      NUMERIC(5,2),
  tipo_estrutura    TEXT,                   -- flutuante | fixo | marina seca (rack)
  status            TEXT DEFAULT 'disponivel', -- disponivel | ocupada | manutencao | reservada
  valor_mensal      NUMERIC(10,2),
  observacoes       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now(),
  UNIQUE (marina_id, codigo)
);

-- ------------------------------------------------------------
-- 6. RESERVAS (atracação / locação de vaga por período)
-- ------------------------------------------------------------
CREATE TABLE marina.reservas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id         UUID REFERENCES marina.marinas(id) NOT NULL,
  vaga_id           UUID REFERENCES marina.vagas(id) NOT NULL,
  cliente_id        UUID REFERENCES marina.clientes(id) NOT NULL,
  embarcacao_id     UUID REFERENCES marina.embarcacoes(id),
  tipo              TEXT DEFAULT 'mensal',   -- avulsa | mensal | anual
  data_inicio       DATE NOT NULL,
  data_fim          DATE,
  status            TEXT DEFAULT 'confirmada', -- pendente | confirmada | em_andamento | encerrada | cancelada
  valor             NUMERIC(10,2),
  observacoes       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 7. COBRANÇAS / PAGAMENTOS (financeiro)
-- ------------------------------------------------------------
CREATE TABLE marina.cobrancas (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id         UUID REFERENCES marina.marinas(id) NOT NULL,
  cliente_id        UUID REFERENCES marina.clientes(id) NOT NULL,
  reserva_id        UUID REFERENCES marina.reservas(id),
  ordem_servico_id  UUID,                   -- referência opcional a ordens_servico
  descricao         TEXT NOT NULL,          -- ex: "Mensalidade vaga A-12 — Ago/2026"
  tipo              TEXT DEFAULT 'mensalidade', -- mensalidade | servico | multa | outro
  valor             NUMERIC(10,2) NOT NULL,
  vencimento        DATE NOT NULL,
  status            TEXT DEFAULT 'pendente', -- pendente | pago | atrasado | cancelado
  forma_pagamento   TEXT,                   -- pix | cartao | boleto
  payment_id        TEXT,                   -- id retornado pelo Mercado Pago
  pago_em           TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 8. ORDENS DE SERVIÇO (manutenção)
-- ------------------------------------------------------------
CREATE TABLE marina.ordens_servico (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id         UUID REFERENCES marina.marinas(id) NOT NULL,
  embarcacao_id     UUID REFERENCES marina.embarcacoes(id) NOT NULL,
  cliente_id        UUID REFERENCES marina.clientes(id) NOT NULL,
  tipo_servico      TEXT NOT NULL,          -- limpeza | manutencao_motor | guincho | combustivel | pintura | outro
  descricao         TEXT,
  status            TEXT DEFAULT 'aberta',  -- aberta | em_andamento | concluida | cancelada
  prioridade        TEXT DEFAULT 'normal',  -- baixa | normal | alta | urgente
  responsavel       TEXT,                   -- funcionário/prestador responsável
  data_abertura     TIMESTAMPTZ DEFAULT now(),
  data_agendada     TIMESTAMPTZ,
  data_conclusao     TIMESTAMPTZ,
  valor             NUMERIC(10,2),
  observacoes       TEXT
);

ALTER TABLE marina.cobrancas
  ADD CONSTRAINT fk_cobranca_os FOREIGN KEY (ordem_servico_id) REFERENCES marina.ordens_servico(id);

-- ------------------------------------------------------------
-- 9. AGENDAMENTOS (solicitação do cliente: retirada para água / retorno)
-- ------------------------------------------------------------
CREATE TABLE marina.agendamentos (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id     UUID REFERENCES marina.marinas(id) NOT NULL,
  cliente_id    UUID REFERENCES marina.clientes(id) NOT NULL,
  embarcacao_id UUID REFERENCES marina.embarcacoes(id),
  tipo          TEXT NOT NULL CHECK (tipo IN ('retirada','retorno')), -- retirada = lançamento na água | retorno = atracação de volta
  data_hora     TIMESTAMPTZ NOT NULL,
  status        TEXT DEFAULT 'solicitado', -- solicitado | confirmado | concluido | cancelado
  observacoes   TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE marina.agendamentos ADD COLUMN previsao_retorno TIMESTAMPTZ; -- só para tipo='retirada': quando o cliente prevê voltar, usado pro alerta de atraso no Painel de Controle
ALTER TABLE marina.agendamentos ADD COLUMN resgate_solicitado BOOLEAN DEFAULT false; -- alerta manual no Painel de Controle, pra embarcação navegando que precisa de resgate

-- ------------------------------------------------------------
-- 10. DOCUMENTOS DA EMBARCAÇÃO (TIE, seguro, habilitação, vistoria...)
-- ------------------------------------------------------------
CREATE TABLE marina.documentos_embarcacao (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id       UUID REFERENCES marina.marinas(id) NOT NULL,
  embarcacao_id   UUID REFERENCES marina.embarcacoes(id) NOT NULL,
  tipo            TEXT NOT NULL, -- TIE | seguro | seguro_obrigatorio | habilitacao_condutor | vistoria | outro
  numero_documento TEXT,
  data_emissao    DATE,
  data_validade   DATE,
  arquivo_url     TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 11. LAUDOS TÉCNICOS (vistoria, avaliação, etc. — diferencial: engenheiro próprio)
-- ------------------------------------------------------------
CREATE TABLE marina.laudos (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id           UUID REFERENCES marina.marinas(id) NOT NULL,
  embarcacao_id       UUID REFERENCES marina.embarcacoes(id) NOT NULL,
  cliente_id          UUID REFERENCES marina.clientes(id) NOT NULL,
  tipo                TEXT DEFAULT 'vistoria', -- vistoria | avaliacao | transferencia | seguro | outro
  finalidade          TEXT, -- seguro | financiamento | transferencia_propriedade | regularizacao | outro
  status              TEXT DEFAULT 'solicitado', -- solicitado | agendado | em_andamento | emitido | cancelado
  responsavel_tecnico TEXT, -- nome/CREA do engenheiro responsável
  data_solicitacao    TIMESTAMPTZ DEFAULT now(),
  data_vistoria       TIMESTAMPTZ,
  data_emissao        TIMESTAMPTZ,
  arquivo_url         TEXT,
  valor               NUMERIC(10,2),
  observacoes         TEXT
);

-- ------------------------------------------------------------
-- 12. DESPACHOS (regularização junto à Capitania dos Portos)
-- ------------------------------------------------------------
CREATE TABLE marina.despachos (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id         UUID REFERENCES marina.marinas(id) NOT NULL,
  embarcacao_id     UUID REFERENCES marina.embarcacoes(id),
  cliente_id        UUID REFERENCES marina.clientes(id) NOT NULL,
  tipo              TEXT NOT NULL, -- registro | transferencia | baixa | renovacao_tie | outro
  orgao             TEXT DEFAULT 'Capitania dos Portos',
  numero_protocolo  TEXT,
  status            TEXT DEFAULT 'protocolado', -- protocolado | em_analise | exigencia | aprovado | indeferido | concluido
  data_protocolo    DATE,
  data_conclusao    DATE,
  observacoes       TEXT,
  created_at        TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 13. COMBUSTÍVEIS (catálogo/estoque/preço, controlado pelo gestor)
-- ------------------------------------------------------------
CREATE TABLE marina.combustiveis (
  id                  UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id           UUID REFERENCES marina.marinas(id) NOT NULL,
  nome                TEXT NOT NULL, -- ex: "Gasolina", "Diesel Marítimo", "Etanol", "Óleo 2T"
  preco_litro         NUMERIC(10,2) NOT NULL,
  estoque_litros      NUMERIC(10,2) NOT NULL DEFAULT 0,
  ativo               BOOLEAN DEFAULT true,
  atualizado_em       TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 14. PEDIDOS DE ABASTECIMENTO (cliente solicita, com QR de pagamento)
-- ------------------------------------------------------------
CREATE TABLE marina.pedidos_abastecimento (
  id                     UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id              UUID REFERENCES marina.marinas(id) NOT NULL,
  cliente_id             UUID REFERENCES marina.clientes(id) NOT NULL,
  embarcacao_id          UUID REFERENCES marina.embarcacoes(id),
  agendamento_id         UUID REFERENCES marina.agendamentos(id), -- vincula ao card de retirada/retorno certo no Painel de Controle
  combustivel_id         UUID REFERENCES marina.combustiveis(id) NOT NULL,
  quantidade_litros      NUMERIC(10,2) NOT NULL,
  preco_litro_no_pedido  NUMERIC(10,2) NOT NULL, -- snapshot do preço no momento do pedido
  valor_total            NUMERIC(10,2) NOT NULL,
  status                 TEXT DEFAULT 'solicitado', -- solicitado | confirmado | aguardando_pagamento | pago | entregue | cancelado
  forma_pagamento        TEXT DEFAULT 'pix',
  payment_id             TEXT,
  qr_code                TEXT, -- payload "pix copia e cola" (real ou demo)
  qr_code_demo           BOOLEAN DEFAULT true, -- true = QR de demonstração, ainda sem Mercado Pago real conectado
  pago_em                TIMESTAMPTZ,
  observacoes            TEXT,
  created_at             TIMESTAMPTZ DEFAULT now()
);

-- ------------------------------------------------------------
-- 15. AUTORIZADOS (pessoas autorizadas pelo cliente a retirar/devolver a embarcação)
-- ------------------------------------------------------------
CREATE TABLE marina.autorizados (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id     UUID REFERENCES marina.marinas(id) NOT NULL,
  cliente_id    UUID REFERENCES marina.clientes(id) NOT NULL,
  nome          TEXT NOT NULL,
  documento     TEXT, -- CPF ou RG
  telefone      TEXT,
  parentesco    TEXT, -- filho(a) | conjuge | socio | funcionario | outro
  ativo         BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- Vincula (opcionalmente) um agendamento de retirada/retorno a quem de fato vai buscar/entregar
ALTER TABLE marina.agendamentos ADD COLUMN autorizado_id UUID REFERENCES marina.autorizados(id);

-- ------------------------------------------------------------
-- 16. NOTAS FISCAIS (controle de NFS-e do serviço)
-- ------------------------------------------------------------
-- Como a emissão real depende da prefeitura/certificado digital/provedor de
-- cada marina (não há padrão único de NFS-e no Brasil), esta tabela registra
-- o controle interno (o que precisa de nota, valor, status) e guarda o número
-- da nota quando ela é emitida — manualmente pelo portal da prefeitura, por um
-- provedor (Focus NFe, NFE.io etc.) ou, futuramente, via integração automática
-- (forma_emissao = 'api').
CREATE TABLE marina.notas_fiscais (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  marina_id       UUID REFERENCES marina.marinas(id) NOT NULL,
  cliente_id      UUID REFERENCES marina.clientes(id) NOT NULL,
  cobranca_id     UUID REFERENCES marina.cobrancas(id),
  descricao       TEXT NOT NULL,
  valor           NUMERIC(10,2) NOT NULL,
  numero_nota     TEXT,
  status          TEXT DEFAULT 'pendente', -- pendente | emitida | cancelada
  forma_emissao   TEXT DEFAULT 'manual',   -- manual | api
  data_emissao    DATE,
  arquivo_url     TEXT,
  observacoes     TEXT,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

ALTER TABLE marina.marinas          ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.perfis           ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.clientes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.embarcacoes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.vagas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.reservas         ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.cobrancas        ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.ordens_servico   ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.agendamentos     ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.documentos_embarcacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.laudos                ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.despachos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.combustiveis          ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.pedidos_abastecimento ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.autorizados           ENABLE ROW LEVEL SECURITY;
ALTER TABLE marina.notas_fiscais         ENABLE ROW LEVEL SECURITY;

-- Perfis: cada usuário vê e edita o próprio perfil
CREATE POLICY "perfil_proprio" ON marina.perfis
  FOR ALL TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Admin/funcionário: acesso completo aos dados da própria marina
CREATE POLICY "admin_marina_clientes" ON marina.clientes
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_embarcacoes" ON marina.embarcacoes
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_vagas" ON marina.vagas
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_reservas" ON marina.reservas
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_cobrancas" ON marina.cobrancas
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_os" ON marina.ordens_servico
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Cliente final: só vê os próprios dados
CREATE POLICY "cliente_proprio_dados" ON marina.clientes
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "cliente_proprias_embarcacoes" ON marina.embarcacoes
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_proprias_reservas" ON marina.reservas
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_proprias_cobrancas" ON marina.cobrancas
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_proprias_os" ON marina.ordens_servico
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Agendamentos: staff da marina tem acesso completo
CREATE POLICY "admin_marina_agendamentos" ON marina.agendamentos
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Agendamentos: cliente solicita, vê e cancela os próprios (enquanto ainda "solicitado")
CREATE POLICY "cliente_cria_agendamento" ON marina.agendamentos
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_ve_proprios_agendamentos" ON marina.agendamentos
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_cancela_proprio_agendamento" ON marina.agendamentos
  FOR UPDATE TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()) AND status = 'solicitado')
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Documentação, laudos e despachos: staff da marina tem acesso completo
CREATE POLICY "admin_marina_documentos" ON marina.documentos_embarcacao
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_laudos" ON marina.laudos
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

CREATE POLICY "admin_marina_despachos" ON marina.despachos
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Cliente: vê os próprios documentos/laudos/despachos; pode solicitar laudo
CREATE POLICY "cliente_ve_proprios_documentos" ON marina.documentos_embarcacao
  FOR SELECT TO authenticated
  USING (embarcacao_id IN (SELECT id FROM marina.embarcacoes WHERE cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid())));

CREATE POLICY "cliente_ve_proprios_laudos" ON marina.laudos
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_solicita_laudo" ON marina.laudos
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_ve_proprios_despachos" ON marina.despachos
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Despachos: cliente também pode solicitar diretamente (catálogo "Serviços")
CREATE POLICY "cliente_cria_despacho" ON marina.despachos
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Combustíveis: staff da marina gerencia (estoque e preço)
CREATE POLICY "admin_marina_combustiveis" ON marina.combustiveis
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Combustíveis: qualquer usuário da marina (inclusive cliente) pode ver preço/estoque disponível
CREATE POLICY "usuarios_marina_veem_combustiveis" ON marina.combustiveis
  FOR SELECT TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Pedidos de abastecimento: staff da marina tem acesso completo
CREATE POLICY "admin_marina_pedidos_abastecimento" ON marina.pedidos_abastecimento
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Pedidos de abastecimento: cliente solicita e vê os próprios
CREATE POLICY "cliente_cria_pedido_abastecimento" ON marina.pedidos_abastecimento
  FOR INSERT TO authenticated
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

CREATE POLICY "cliente_ve_proprios_pedidos_abastecimento" ON marina.pedidos_abastecimento
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Autorizados: staff da marina tem acesso completo (para conferir na portaria/rampa)
CREATE POLICY "admin_marina_autorizados" ON marina.autorizados
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Autorizados: cliente gerencia (adiciona/edita/remove) os próprios
CREATE POLICY "cliente_gerencia_autorizados" ON marina.autorizados
  FOR ALL TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()))
  WITH CHECK (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Notas fiscais: staff da marina tem acesso completo
CREATE POLICY "admin_marina_notas_fiscais" ON marina.notas_fiscais
  FOR ALL TO authenticated
  USING (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
         AND (SELECT role FROM marina.perfis WHERE id = auth.uid()) IN ('admin','funcionario','operador'))
  WITH CHECK (marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid()));

-- Notas fiscais: cliente vê as próprias
CREATE POLICY "cliente_ve_proprias_notas_fiscais" ON marina.notas_fiscais
  FOR SELECT TO authenticated
  USING (cliente_id IN (SELECT id FROM marina.clientes WHERE user_id = auth.uid()));

-- Operador (dono da plataforma): vê todas as marinas
CREATE POLICY "operador_marinas" ON marina.marinas
  FOR ALL TO authenticated
  USING ((SELECT role FROM marina.perfis WHERE id = auth.uid()) = 'operador');


-- ============================================================
-- Permissões de schema (necessário pois "marina" não é o schema "public")
-- ============================================================
GRANT USAGE ON SCHEMA marina TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA marina TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA marina TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA marina GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA marina GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;

-- Expor o schema "marina" na API REST do PostgREST (além do "public" já existente)
ALTER ROLE authenticator SET pgrst.db_schemas = 'public, marina';
NOTIFY pgrst, 'reload config';
