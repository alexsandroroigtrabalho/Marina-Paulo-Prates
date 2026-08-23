// Fonte única do rótulo/cor de acesso do cliente — usada pela tela
// Clientes, pela aba Financeiro e pelo painel do próprio cliente
// (TelaClienteDashboard.jsx tem sua própria versão focada na Agenda,
// statusAgendaCliente(), mas deriva dos MESMOS 3 campos abaixo). Extraído
// pra lib pra tela Clientes e aba Financeiro nunca mostrarem um rótulo ou
// cor diferente pro mesmo cliente — os mesmos 3 campos que a policy
// "cliente_cria_agendamento" do banco usa pra travar/liberar de verdade.
export function statusAcessoCliente(cliente) {
  if (cliente.acesso_suspenso) return { texto: 'Suspenso', classe: 'cancelado' }
  if (cliente.pagamento_confirmado) return { texto: 'Liberado', classe: 'em-dia' }
  if (cliente.acesso_liberado_manual) return { texto: 'Liberado manualmente', classe: 'em-dia' }
  return { texto: 'Aguardando pagamento', classe: 'pendente' }
}
