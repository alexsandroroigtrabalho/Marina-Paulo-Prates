-- Ficha de Cadastro (cliente final) passou a pedir CPF e documento de
-- identidade (RG) como campos distintos (antes só existia "cpf_cnpj",
-- usado como "carteira de habilitação"), além de separar o endereço em
-- rua/número/complemento em vez de um único campo de texto livre.
--
-- Aditivo e não destrutivo: cpf_cnpj/endereco continuam existindo e
-- guardando o mesmo dado de sempre (CPF e "rua/bairro"), nenhuma coluna é
-- removida ou renomeada, nenhuma linha existente é afetada.
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-23 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. Seguro rodar de
-- novo (idempotente, usa IF NOT EXISTS).

ALTER TABLE marina.clientes
  ADD COLUMN IF NOT EXISTS documento_identidade TEXT,
  ADD COLUMN IF NOT EXISTS numero_casa TEXT,
  ADD COLUMN IF NOT EXISTS complemento TEXT;
