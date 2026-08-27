// Fonte única do rótulo/cor de acesso do cliente — usada pela tela Clientes
// e pelo painel do próprio cliente (TelaClienteDashboard.jsx tem sua própria
// versão focada na Agenda, statusAgendaCliente(), que deriva do MESMO campo
// abaixo).
//
// Antes esta função também olhava `pagamento_confirmado` e
// `acesso_liberado_manual`, e podia devolver "Aguardando pagamento": o acesso
// à agenda dependia de o pagamento estar confirmado. Isso acabou — cobrança e
// pagamento passaram para o RV Finance (SaaS separado), e no RV Marine o
// cliente tem acesso livre. A policy "cliente_cria_agendamento" do banco foi
// reescrita na mesma direção (migration_rv_marine_sem_bloqueio_pagamento.sql):
// hoje ela também só checa `acesso_suspenso`, então tela e banco continuam
// dizendo exatamente a mesma coisa.
//
// As colunas pagamento_confirmado / pagamento_confirmado_em /
// acesso_liberado_manual continuam existindo no banco, com os dados intactos —
// só não são mais lidas por aqui.
//
// Suspender o acesso segue sendo uma ação da marina (botão "Suspender acesso"
// na tela Clientes), e é o único motivo pelo qual a agenda trava.
export function statusAcessoCliente(cliente) {
  if (cliente.acesso_suspenso) return { texto: 'Suspenso', classe: 'cancelado' }
  return { texto: 'Liberado', classe: 'em-dia' }
}
