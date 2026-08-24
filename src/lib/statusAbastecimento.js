// Status do fluxo simplificado de solicitações de combustível — fonte
// única dos rótulos e das opções do seletor de status, usada tanto pela
// aba "Abastecimento" (TelaAbastecimento.jsx) quanto pela seção
// "Combustível" do Painel de Controle (TelaVagas.jsx) e pelo Diário de
// Bordo do cliente (TelaClienteDashboard.jsx). Antes deste arquivo, cada
// tela tinha sua própria cópia dessas informações — bastava mexer numa e
// esquecer a outra pra elas mostrarem status diferentes pro mesmo pedido.
//
// O operador só escolhe entre estas 4 opções (ver <select> nas telas
// administrativas):
//   'aguardando_pagamento' — a marina confirmou o pedido, falta o cliente
//                             pagar. Continua visível nas duas telas
//                             administrativas e no Diário de Bordo.
//   'pago'                 — pagamento efetuado: conclui a solicitação —
//                             some das duas telas administrativas (ver
//                             abastecimentoConcluido abaixo) e do Diário de
//                             Bordo do cliente, mas continua contando
//                             normalmente na Arrecadação detalhada
//                             (TelaFinanceiro.jsx lê a tabela por fora
//                             dessas telas, sem esse filtro).
//   'cancelado'             — pedido cancelado (pela marina ou pelo
//                             próprio cliente, direto no Diário de Bordo).
//   'indisponivel'          — a marina não tem esse combustível disponível
//                             agora.
// 'solicitado' (valor inicial de todo pedido novo) / 'confirmado' /
// 'entregue' são valores legados (pedidos de antes desse fluxo
// simplificado) — 'solicitado' continua aparecendo normalmente até a
// marina agir; 'confirmado'/'entregue' só têm rótulo aqui pra não mostrar
// o código cru se algum pedido velho ainda estiver com um desses
// ('entregue' também é tratado como concluído, ver abastecimentoConcluido).
export const STATUS_ABASTECIMENTO_OPCOES = [
  { valor: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { valor: 'pago', label: 'Pagamento efetuado' },
  { valor: 'cancelado', label: 'Cancelar' },
  { valor: 'indisponivel', label: 'Indisponível' },
]

export const STATUS_ABASTECIMENTO_LABEL = {
  solicitado: 'Solicitado',
  confirmado: 'Confirmado',
  aguardando_pagamento: 'Aguardando pagamento',
  pago: 'Pago',
  entregue: 'Entregue',
  cancelado: 'Cancelado',
  indisponivel: 'Indisponível',
}

export function labelStatusAbastecimento(status) {
  return STATUS_ABASTECIMENTO_LABEL[status] || status
}

// Pedido já concluído — some das telas administrativas (continua contando
// normalmente na Arrecadação detalhada) e do Diário de Bordo do cliente.
export function abastecimentoConcluido(status) {
  return status === 'pago' || status === 'entregue'
}

// Enquanto o pedido estiver num destes status, o cliente ainda pode
// cancelá-lo direto pelo Diário de Bordo (ver cancelarAbastecimentoCliente
// em TelaClienteDashboard.jsx e a policy "cliente_cancela_proprio_pedido_
// abastecimento" em supabase/sql/migration_cliente_cancela_pedido_abastecimento.sql).
export const STATUS_ABASTECIMENTO_CANCELAVEIS = ['aguardando_pagamento', 'indisponivel']
