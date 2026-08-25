-- A opção "Resgatado" do status de S.O.S. (resgate_status) foi retirada a
-- pedido do cliente: "Recolhido" passou a cumprir a mesma função de encerrar
-- o atendimento (tanto o S.O.S. quanto o encerramento manual de uma
-- navegação comum pela tabela Navegando) — ver lib/statusResgate.js,
-- lib/db.js (encerrarNavegacao) e TelaVagas.jsx (LABEL_ENCERRAR) na mesma
-- leva de alterações. Nenhuma coluna nova, só um valor de texto renomeado —
-- atualiza as linhas que já estavam gravadas com o valor antigo pra não
-- ficarem com um status que a interface não reconhece mais.
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-24 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. 6 linhas
-- afetadas na aplicação original. Seguro rodar de novo (idempotente: só
-- atualiza o que ainda estiver com o valor antigo, e não sobrou nenhuma).

UPDATE marina.agendamentos SET resgate_status = 'recolhido' WHERE resgate_status = 'resgatado';
