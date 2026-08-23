// Estados do alerta de resgate (S.O.S.) de uma embarcação navegando —
// substitui o antigo campo booleano resgate_solicitado por um fluxo de 3
// etapas, pra equipe e o cliente acompanharem o andamento do atendimento:
//
//  1. "solicitado" — o cliente aciona o S.O.S. no app (ou a equipe marca
//                    manualmente no Painel de Controle, ao perceber que uma
//                    embarcação precisa de ajuda sem esperar o cliente agir).
//  2. "recebido"   — a equipe confirma que viu o alerta (clique no Painel de
//                    Controle) — some aqui o apito contínuo de SOS.
//  3. "resgatado"  — a equipe marca manualmente quando o atendimento termina.
//
// null = nenhum resgate em andamento nessa navegação.
export const STATUS_RESGATE = [
  { valor: 'solicitado', label: 'Solicitação de resgate' },
  { valor: 'recebido', label: 'Pedido recebido' },
  { valor: 'resgatado', label: 'Resgatado' },
]

export function labelStatusResgate(status) {
  return STATUS_RESGATE.find((s) => s.valor === status)?.label || status
}
