-- Migração incremental: troca o alerta de resgate (S.O.S.) de um booleano
-- simples (resgate_solicitado) por um status com 3 etapas em
-- resgate_status — "solicitado" (cliente aciona o S.O.S., ou a equipe marca
-- manualmente), "recebido" (equipe confirma que viu o pedido, no Painel de
-- Controle — o apito contínuo de SOS para aqui) e "resgatado" (equipe marca
-- quando o atendimento termina). Ver src/lib/statusResgate.js.
--
-- Rode este script uma vez no SQL Editor do Supabase (Dashboard do projeto
-- > SQL Editor > New query > cole e rode). Ele é seguro rodar mais de uma
-- vez.

ALTER TABLE marina.agendamentos ADD COLUMN IF NOT EXISTS resgate_status TEXT;

-- Migra qualquer S.O.S. já em aberto (resgate_solicitado = true) pro novo
-- status "solicitado", pra não perder um alerta ativo na troca.
UPDATE marina.agendamentos
SET resgate_status = 'solicitado'
WHERE resgate_solicitado = true AND resgate_status IS NULL;

-- A partir daqui, resgate_solicitado (coluna antiga) não é mais usada pelo
-- código — fica no banco só por segurança, sem necessidade de removê-la.
