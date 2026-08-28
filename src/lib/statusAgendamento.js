import { janelaEncerrada, restanteDaJanela, textoRestante } from './confirmacaoAutomatica.js'
import { inicioJanelaAgendamento } from './agendamentos.js'
// Extensão .js explícita pelo mesmo motivo de statusAbastecimento.js: as
// regras puras deste módulo são testadas rodando direto no Node, que exige
// o caminho completo (o Vite resolve dos dois jeitos).

// Fonte única do fluxo de pedido de descida/subida (Fila de Rampa) — usada
// pelo Painel de Controle (TelaVagas.jsx, o apito global em
// SonsPainelAdmin.jsx via lib/filaRampa.js) e pelo Diário de Bordo do
// cliente (TelaClienteDashboard.jsx).
//
// A equipe tem sempre dois botões — Confirmar (com um rótulo próprio por
// tipo) e Cancelar. Se ninguém decidir dentro do prazo, o pedido vale como
// confirmado sozinho. O prazo NÃO é o mesmo para os dois tipos:
//   - descida (retirada): 15 minutos. Confirmar (rótulo "Navegando") leva
//     direto pro status final 'concluido' — a notificação sai da Fila de
//     Rampa e a embarcação aparece na tabela "Navegando".
//   - subida (retorno): 5 minutos, mais curto — o cliente já está de volta
//     ou perto disso quando pede. Confirmar (rótulo "Recolhido") também
//     leva direto pro status final 'concluido': some da Fila de Rampa E,
//     no mesmo instante, some a embarcação da tabela "Navegando" (ver
//     ultimaMovimentacaoPorEmbarcacao em lib/agendamentos.js — o
//     'concluido' da subida passa a ser a movimentação mais recente da
//     embarcação, tirando-a de "quem está na água"). Não existe um estado
//     intermediário "navegando de volta" — confirmar a subida É o
//     "Recolhido".
export const JANELA_DESCIDA_MS = 15 * 60 * 1000
export const JANELA_SUBIDA_MS = 5 * 60 * 1000

function janelaAgendamento(tipo) {
  return tipo === 'retirada' ? JANELA_DESCIDA_MS : JANELA_SUBIDA_MS
}

// Pra qual status uma descida/subida vai quando confirmada — por clique ou
// pelo relógio, sempre o mesmo valor pros dois tipos: 'concluido'. O que
// muda por tipo é só o RÓTULO do botão (ver labelConfirmarAgendamento) e a
// duração da janela — o destino no banco é sempre este.
export function statusFinalAgendamento(_tipo) {
  return 'concluido'
}

// "Navegando" na descida (confirma que o barco entrou na água), "Recolhido"
// na subida (confirma que o barco já foi retirado) — mesmo destino no
// banco, textos diferentes porque contam coisas diferentes pra quem está
// vendo o Painel de Controle.
export function labelConfirmarAgendamento(tipo) {
  return tipo === 'retirada' ? 'Navegando' : 'Recolhido'
}

// Status efetivo — o que a tela deve mostrar, não necessariamente o que
// está gravado. `agoraMs` entra como parâmetro pelo mesmo motivo de
// statusEfetivoAbastecimento: as telas já têm o próprio relógio avançando
// sozinho, e a função fica testável sem depender do horário real.
export function statusEfetivoAgendamento(a, agoraMs = Date.now()) {
  if (!a) return null
  if (a.status !== 'solicitado') return a.status
  return janelaEncerrada(inicioJanelaAgendamento(a), agoraMs, janelaAgendamento(a.tipo)) ? statusFinalAgendamento(a.tipo) : 'solicitado'
}

// Ainda dá pra confirmar ou cancelar? Vale para os dois lados: os botões da
// Fila de Rampa e o "Cancelar" do Diário de Bordo do cliente saem juntos, no
// mesmo instante, porque saem da mesma função — mesmo padrão de
// aguardandoDecisao em lib/statusAbastecimento.js. A policy
// "cliente_cancela_proprio_agendamento" no banco repete essa condição em
// SQL (com a mesma janela por tipo), então nem por fora da aplicação dá pra
// cancelar depois do prazo.
export function aguardandoDecisaoAgendamento(a, agoraMs = Date.now()) {
  return statusEfetivoAgendamento(a, agoraMs) === 'solicitado'
}

// Quanto falta (em ms) para a confirmação automática — 0 quando já passou.
// Não usado hoje na tela (o cronômetro visual foi removido do Painel de
// Controle a pedido), mas continua aqui: é lógica pura, testada, e pode
// voltar a ser útil sem precisar reinventar a janela por tipo.
export function restanteParaConfirmarAgendamento(a, agoraMs = Date.now()) {
  if (!a || a.status !== 'solicitado') return 0
  return restanteDaJanela(inicioJanelaAgendamento(a), agoraMs, janelaAgendamento(a.tipo))
}

export const textoRestanteParaConfirmarAgendamento = textoRestante
