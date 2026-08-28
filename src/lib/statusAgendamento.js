import { janelaEncerrada, restanteDaJanela, textoRestante } from './confirmacaoAutomatica.js'
import { inicioJanelaAgendamento } from './agendamentos.js'
// Extensão .js explícita pelo mesmo motivo de statusAbastecimento.js: as
// regras puras deste módulo são testadas rodando direto no Node, que exige
// o caminho completo (o Vite resolve dos dois jeitos).

// Fonte única do fluxo de pedido de descida/subida (Fila de Rampa) — usada
// pelo Painel de Controle (TelaVagas.jsx, o apito global em
// SonsPainelAdmin.jsx via lib/filaRampa.js) e pelo Diário de Bordo do
// cliente (TelaClienteDashboard.jsx). Mesma regra dos 15 minutos do
// abastecimento (lib/confirmacaoAutomatica.js, lib/statusAbastecimento.js):
// a equipe tem dois botões, Confirmar e Cancelar; se ninguém decidir dentro
// de 15 minutos contados de created_at, o pedido vale como confirmado
// sozinho.
//
// A diferença para o abastecimento é só o destino da confirmação: aqui ela
// não é um status novo — é o MESMO status final que "Confirmar" sempre
// produziu (concluido na descida, navegando na subida), só que disparado
// pelo relógio em vez de um clique. Por isso não existe um 'confirmado'
// intermediário neste fluxo (o antigo passo "Recebido" saiu da Fila de
// Rampa): são só três destinos por completo — aguardando, confirmado (que
// aqui É o final) e cancelado.

// Pra qual status uma descida/subida vai quando confirmada — por clique ou
// pelo relógio, é sempre o mesmo valor (ver STATUS_FILA_OPCOES, removido de
// TelaVagas.jsx: os dois botões chamam isto direto).
export function statusFinalAgendamento(tipo) {
  return tipo === 'retirada' ? 'concluido' : 'navegando'
}

// Status efetivo — o que a tela deve mostrar, não necessariamente o que
// está gravado. `agoraMs` entra como parâmetro pelo mesmo motivo de
// statusEfetivoAbastecimento: as telas já têm o próprio relógio avançando
// sozinho, e a função fica testável sem depender do horário real.
export function statusEfetivoAgendamento(a, agoraMs = Date.now()) {
  if (!a) return null
  if (a.status !== 'solicitado') return a.status
  return janelaEncerrada(inicioJanelaAgendamento(a), agoraMs) ? statusFinalAgendamento(a.tipo) : 'solicitado'
}

// Ainda dá pra confirmar ou cancelar? Vale para os dois lados: os botões da
// Fila de Rampa e o "Cancelar" do Diário de Bordo do cliente saem juntos, no
// mesmo instante, porque saem da mesma função — mesmo padrão de
// aguardandoDecisao em lib/statusAbastecimento.js. A policy
// "cliente_cancela_proprio_agendamento" no banco repete essa condição em
// SQL, então nem por fora da aplicação dá pra cancelar depois do prazo.
export function aguardandoDecisaoAgendamento(a, agoraMs = Date.now()) {
  return statusEfetivoAgendamento(a, agoraMs) === 'solicitado'
}

// Quanto falta (em ms) para a confirmação automática — 0 quando já passou.
export function restanteParaConfirmarAgendamento(a, agoraMs = Date.now()) {
  if (!a || a.status !== 'solicitado') return 0
  return restanteDaJanela(inicioJanelaAgendamento(a), agoraMs)
}

export const textoRestanteParaConfirmarAgendamento = textoRestante
