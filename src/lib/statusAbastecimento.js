// Status do fluxo simplificado de solicitações de combustível — fonte
// única dos rótulos usada pela aba "Abastecimento" (TelaAbastecimento.jsx,
// único lugar com o <select> editável de status), pela seção "Combustível"
// do Painel de Controle (TelaVagas.jsx, só consulta — sem controle nenhum
// de alteração ali) e pelo Diário de Bordo do cliente
// (TelaClienteDashboard.jsx). Antes deste arquivo, cada tela tinha sua
// própria cópia dessas informações — bastava mexer numa e esquecer a
// outra pra elas mostrarem status diferentes pro mesmo pedido.
//
// O operador só escolhe entre estas 4 opções, e só pela aba Abastecimento
// (ver STATUS_ABASTECIMENTO_OPCOES/<select> em TelaAbastecimento.jsx):
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
// 'solicitado' é o valor inicial de todo pedido novo (ver
// enviarAbastecimento em TelaClienteDashboard.jsx) — ninguém da marina
// decidiu nada ainda, então o rótulo aqui é só um travessão ("—"): nas
// duas telas administrativas o status de verdade já está claro pelo
// seletor de ação ao lado (sempre começa em "—" também, ver <select> em
// TelaAbastecimento.jsx — só muda quando o operador escolhe uma das 4
// opções reais). No Diário de Bordo do cliente esse mesmo 'solicitado'
// ganha um texto próprio, "Aguardando resposta da solicitação" — ver
// statusAbastecimentoDiario em TelaClienteDashboard.jsx, que trata esse
// caso antes de cair aqui. 'confirmado'/'entregue' são valores legados
// (pedidos de antes desse fluxo simplificado) — só têm rótulo aqui pra não
// mostrar o código cru se algum pedido velho ainda estiver com um desses
// ('entregue' também é tratado como concluído, ver abastecimentoConcluido).
export const STATUS_ABASTECIMENTO_OPCOES = [
  { valor: 'indisponivel', label: 'Indisponível' },
  { valor: 'aguardando_pagamento', label: 'Aguardando pagamento' },
  { valor: 'pago', label: 'Pagamento efetuado' },
  { valor: 'cancelado', label: 'Cancelar' },
]

export const STATUS_ABASTECIMENTO_LABEL = {
  solicitado: '—',
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

// "Completar tanque" — opção do pedido de abastecimento pra quando o
// cliente não sabe quantos litros faltam (só se sabe depois de encher):
// pede pra completar o tanque, sem quantidade/valor fechado no momento do
// pedido (ver enviarAbastecimento em TelaClienteDashboard.jsx — vai com
// quantidade_litros/valor_total = 0 e sem QR de pagamento, já que o valor
// só é acertado presencialmente na marina). Usa o campo observacoes já
// existente como marcador, sem precisar de coluna nova no banco.
//
// Enquanto ainda 'aguardando_pagamento', aparece diferente nas duas telas
// administrativas — Diário de Bordo do cliente mostra "Procurar a marina
// para efetuar o pagamento" (ver statusAbastecimentoDiario em
// TelaClienteDashboard.jsx) e a seção "Combustível" do Painel de Controle
// mostra "Tanque cheio" em verde (ver TelaVagas.jsx) — mas o status
// gravado continua sendo o mesmo 'aguardando_pagamento' de sempre, e some
// das telas do mesmo jeito assim que o operador marcar "Pagamento
// efetuado" na aba Abastecimento (ver abastecimentoConcluido acima).
export const OBSERVACAO_COMPLETAR_TANQUE = 'Completar tanque'
export function ehCompletarTanque(pedido) {
  return pedido?.observacoes === OBSERVACAO_COMPLETAR_TANQUE
}
