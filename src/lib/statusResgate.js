// Estados do alerta de resgate (S.O.S.) de uma embarcação navegando —
// substitui o antigo campo booleano resgate_solicitado por um fluxo de
// etapas, pra equipe e o cliente acompanharem o andamento do atendimento:
//
//  1. "solicitado" — o cliente aciona o S.O.S. no app (ou a equipe marca
//                    manualmente no Painel de Controle, ao perceber que uma
//                    embarcação precisa de ajuda sem esperar o cliente agir).
//  2. "recebido"   — a equipe confirma que viu o alerta (clique no Painel de
//                    Controle) — some aqui o apito contínuo de SOS.
//  3. "resgatado"  — a equipe marca manualmente quando o atendimento termina.
//  4. "cancelado"  — o próprio cliente cancela o pedido direto no Diário de
//                    Bordo (ver cancelarResgateCliente em
//                    TelaClienteDashboard.jsx), confirmando que está tudo
//                    bem. Mostra "Estou bem" só por um tempo — ver
//                    JANELA_ESTOU_BEM_MS/estouBemAtivo abaixo — depois volta
//                    sozinho pro status normal de navegação no Painel de
//                    Controle (TelaVagas.jsx). Fica de fora do seletor
//                    editável da equipe ali (só quem pode chegar nesse
//                    estado é o próprio cliente, cancelando).
//
// null = nenhum resgate em andamento nessa navegação.
export const STATUS_RESGATE = [
  { valor: 'solicitado', label: 'Solicitação de resgate' },
  { valor: 'recebido', label: 'Pedido recebido' },
  { valor: 'resgatado', label: 'Resgatado' },
  { valor: 'cancelado', label: 'Estou bem' },
]

export function labelStatusResgate(status) {
  return STATUS_RESGATE.find((s) => s.valor === status)?.label || status
}

// Quanto tempo a mensagem "Estou bem" fica visível no Painel de Controle
// depois que o cliente cancela o S.O.S. — depois disso o status volta
// sozinho pra "Navegando" (ver statusNavegando em TelaVagas.jsx), sem
// precisar de nenhuma ação manual da equipe nem de job/trigger no banco:
// é só uma leitura derivada de resgate_atualizado_em contra o relógio que
// já roda naquela tela.
export const JANELA_ESTOU_BEM_MS = 5 * 60 * 1000

// true enquanto ainda deve mostrar "Estou bem" pro cancelamento do
// agendamento `a` — `agoraMs` vem de fora (o relógio que já roda na tela,
// ver "agora" em TelaVagas.jsx) pra não depender de um novo Date() aqui.
export function estouBemAtivo(a, agoraMs) {
  if (a?.resgate_status !== 'cancelado' || !a.resgate_atualizado_em) return false
  return agoraMs < new Date(a.resgate_atualizado_em).getTime() + JANELA_ESTOU_BEM_MS
}
