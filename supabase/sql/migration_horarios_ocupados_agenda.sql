-- Sincronização correta dos horários de descida/subida (Agenda da rampa) com
-- o calendário — tela do cliente (TelaClienteDashboard.jsx) e, por
-- consequência, a Fila de Rampa/Navegando do Painel de Controle
-- (TelaVagas.jsx), que só exibe o que já foi agendado.
--
-- Faltava considerar UMA regra na lista de horários disponíveis: agendamentos
-- já existentes. Até aqui, horariosDisponiveis() (lib/agendaRampa.js) só
-- olhava horário de funcionamento + intervalo + manutenções + já ter passado
-- (pro dia de hoje) — nada impedia dois clientes diferentes escolherem o
-- mesmíssimo horário, já que não existe (nunca existiu) constraint de
-- unicidade em marina.agendamentos.data_hora.
--
-- Duas peças abaixo, seguindo o mesmo espírito de sempre reforçar no banco
-- uma regra que a tela já aplica (ver "cliente_cria_agendamento" acima, que
-- já repete a checagem de intervalo por segurança):
--
-- 1) marina.horarios_ocupados(marina_id, data): função (RPC) que devolve só
--    os `data_hora` já ocupados (status <> 'cancelado') naquele dia — nunca
--    devolve cliente/embarcação/observações, só o carimbo, porque um cliente
--    comum NÃO pode ver os agendamentos de outros clientes (RLS
--    "cliente_ve_proprios_agendamentos" continua intacta, restrita à própria
--    linha). A função roda com SECURITY DEFINER pra poder olhar a tabela
--    inteira, mas só devolve esse único campo, e só do dia pedido — e além
--    disso trava o `marina_id` pedido contra o `marina_id` do próprio perfil
--    de quem chamou, pra ninguém espiar a agenda de uma marina diferente.
--    Chamada pelo front (lib/db.js → listarHorariosOcupados) toda vez que o
--    cliente troca a data no formulário de Descida/Subida, alimentando
--    horariosDisponiveis() na hora — é o que fecha o "atualize imediatamente
--    os horários disponíveis" pedido.
--
-- 2) Trigger marina.verifica_horario_livre(): reforça no banco o "não
--    permita horário já ocupado" mesmo pra quem tentasse contornar a tela e
--    mandar direto pra API (mesmo raciocínio do check de intervalo já
--    existente) — e também cobre a corrida rara de dois clientes clicando
--    "Confirmar" quase ao mesmo tempo pro mesmo horário, que só JavaScript
--    no front nunca consegue barrar de verdade. Só reconfere quando
--    `data_hora` está de fato mudando (INSERT, ou UPDATE que move o
--    horário) — uma UPDATE comum de status (ex: "solicitado" → "concluido"),
--    sem mexer no horário, passa direto, pra não travar dados antigos que já
--    existissem em conflito antes desta migration.
--
-- Já aplicada diretamente no projeto (yhioftajhsfpymrqaijd) via MCP em
-- 2026-08-24 — este arquivo fica só como registro/histórico, seguindo o
-- mesmo padrão dos outros migration_*.sql deste diretório. Seguro rodar de
-- novo (idempotente: CREATE OR REPLACE + DROP TRIGGER IF EXISTS).

CREATE OR REPLACE FUNCTION marina.horarios_ocupados(p_marina_id UUID, p_data DATE)
RETURNS TABLE(data_hora TIMESTAMPTZ)
LANGUAGE sql
SECURITY DEFINER
SET search_path = marina, public
AS $$
  SELECT a.data_hora
  FROM marina.agendamentos a
  WHERE a.marina_id = p_marina_id
    AND p_marina_id = (SELECT marina_id FROM marina.perfis WHERE id = auth.uid())
    AND a.status <> 'cancelado'
    AND a.data_hora >= p_data::timestamptz
    AND a.data_hora < (p_data + 1)::timestamptz
$$;

GRANT EXECUTE ON FUNCTION marina.horarios_ocupados(UUID, DATE) TO authenticated;

CREATE OR REPLACE FUNCTION marina.verifica_horario_livre()
RETURNS TRIGGER AS $$
BEGIN
  -- data_hora não mudou (ex: só o status foi atualizado) — nada a reconferir.
  IF TG_OP = 'UPDATE' AND NEW.data_hora = OLD.data_hora THEN
    RETURN NEW;
  END IF;

  IF NEW.status <> 'cancelado' AND EXISTS (
    SELECT 1 FROM marina.agendamentos
    WHERE marina_id = NEW.marina_id
      AND data_hora = NEW.data_hora
      AND status <> 'cancelado'
      AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
  ) THEN
    RAISE EXCEPTION 'Esse horário já está ocupado por outro agendamento.';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = marina, public;

DROP TRIGGER IF EXISTS verifica_horario_livre_trigger ON marina.agendamentos;
CREATE TRIGGER verifica_horario_livre_trigger
  BEFORE INSERT OR UPDATE ON marina.agendamentos
  FOR EACH ROW EXECUTE FUNCTION marina.verifica_horario_livre();
