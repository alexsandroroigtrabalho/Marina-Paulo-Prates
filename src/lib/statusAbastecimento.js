// Fonte ÚNICA do fluxo de pedido de abastecimento — usada pelo painel do
// cliente (TelaClienteDashboard.jsx), pela planilha de solicitações do
// Painel de Controle (TelaVagas.jsx) e pela aba Abastecimento
// (TelaAbastecimento.jsx, hoje fora do menu). Antes deste arquivo cada tela
// tinha sua própria cópia dessas regras — bastava mexer numa e esquecer a
// outra pra elas mostrarem coisas diferentes sobre o mesmo pedido.
//
// O fluxo tem três estados e nada de financeiro:
//
//   solicitado  o cliente pediu. Aparece na planilha do Painel de Controle
//               com dois botões: "Confirmar abastecimento" e "Cancelar".
//   confirmado  a equipe confirmou — OU o pedido completou 15 minutos sem
//               ninguém cancelar, e vale como confirmado sozinho.
//   cancelado   cancelado pela equipe ou pelo próprio cliente, dentro
//               daqueles mesmos 15 minutos.
//
// Não existe preço, valor, cobrança, QR nem confirmação de pagamento: isso
// tudo passou para o RV Finance, o SaaS paralelo.

// Quanto tempo o pedido fica esperando uma decisão da equipe antes de valer
// como confirmado sozinho.
export const JANELA_CONFIRMACAO_MS = 15 * 60 * 1000

// A confirmação automática é DERIVADA de created_at, não gravada por
// ninguém. Essa escolha é o que faz a regra valer de verdade:
//
//   - não depende de alguém estar com o Painel de Controle aberto (o
//     pedido feito às 3h da manhã se confirma igual);
//   - não precisa de rotina agendada, fila nem serviço externo;
//   - dá exatamente o mesmo resultado no painel da equipe, no painel do
//     cliente e na policy do banco, porque os três calculam a mesma conta
//     sobre o mesmo created_at.
//
// Quando alguém da equipe clica em "Confirmar abastecimento" antes dos 15
// minutos, aí sim o status vira 'confirmado' no banco (e confirmado_em
// guarda o momento). Um pedido confirmado com confirmado_em em NULL foi
// confirmado pelo relógio, e o momento dele é sempre
// created_at + JANELA_CONFIRMACAO_MS.
//
// `agoraMs` entra como parâmetro (em vez de Date.now() aqui dentro) porque
// as telas já têm o próprio relógio que avança de segundo em segundo — e
// porque assim a função é testável sem depender do horário real.
export function statusEfetivoAbastecimento(pedido, agoraMs = Date.now()) {
  if (!pedido) return null
  if (pedido.status !== 'solicitado') return pedido.status
  const criadoEm = momentoDoPedido(pedido)
  // Sem saber quando o pedido nasceu, o seguro é continuar esperando uma
  // decisão de gente — nunca confirmar sozinho. (Cuidado com o atalho
  // `new Date(null)`: ele dá 1970, um número perfeitamente finito, e faria
  // qualquer pedido sem created_at nascer "confirmado".)
  if (criadoEm === null) return 'solicitado'
  return agoraMs - criadoEm >= JANELA_CONFIRMACAO_MS ? 'confirmado' : 'solicitado'
}

// created_at em milissegundos, ou null se o campo estiver faltando/ilegível.
function momentoDoPedido(pedido) {
  if (!pedido?.created_at) return null
  const ms = new Date(pedido.created_at).getTime()
  return Number.isFinite(ms) ? ms : null
}

// Ainda dá pra confirmar ou cancelar? Só enquanto o pedido não tiver
// virado confirmado — nem por decisão da equipe, nem pelo relógio. Vale
// para os dois lados: os botões da planilha do Painel de Controle e o
// "Cancelar" do Diário de Bordo do cliente saem juntos, no mesmo instante,
// porque saem da mesma função. A policy
// "cliente_cancela_proprio_pedido_abastecimento" no banco repete essa
// condição em SQL (ver migration_abastecimento_sem_financeiro.sql), então
// nem por fora da aplicação dá pra cancelar depois do prazo.
export function aguardandoDecisao(pedido, agoraMs = Date.now()) {
  return statusEfetivoAbastecimento(pedido, agoraMs) === 'solicitado'
}

// Quanto falta (em ms) para a confirmação automática — 0 quando já passou.
// Usado só para mostrar o tempo restante ao lado dos botões, para a equipe
// saber que aquela linha tem prazo.
export function restanteParaConfirmar(pedido, agoraMs = Date.now()) {
  if (!pedido || pedido.status !== 'solicitado') return 0
  const criadoEm = momentoDoPedido(pedido)
  if (criadoEm === null) return 0
  return Math.max(0, criadoEm + JANELA_CONFIRMACAO_MS - agoraMs)
}

// "faltam 7 min" / "faltam 40 s" — abaixo de um minuto conta em segundos,
// senão a contagem ficaria parada em "1 min" pelo minuto inteiro final.
export function textoRestanteParaConfirmar(restanteMs) {
  if (restanteMs <= 0) return ''
  const segundos = Math.ceil(restanteMs / 1000)
  if (segundos < 60) return `${segundos} s`
  return `${Math.ceil(segundos / 60)} min`
}

// Rótulos. Os quatro primeiros são o fluxo de hoje; os demais são valores
// LEGADOS, de pedidos feitos quando o abastecimento ainda tinha cobrança —
// continuam no banco e precisam de rótulo aqui para não aparecer o código
// cru numa linha antiga do Histórico de Solicitações.
export const STATUS_ABASTECIMENTO_LABEL = {
  solicitado: 'Aguardando confirmação',
  confirmado: 'Confirmado',
  cancelado: 'Cancelado',
  // Legados do fluxo com pagamento (nada é reescrito no banco):
  aguardando_pagamento: 'Confirmado (fluxo antigo)',
  pago: 'Concluído (fluxo antigo)',
  entregue: 'Concluído (fluxo antigo)',
  indisponivel: 'Indisponível',
}

export function labelStatusAbastecimento(status) {
  return STATUS_ABASTECIMENTO_LABEL[status] || status
}

// Classe do selo de status (`badge status-${...}` na planilha do Painel de
// Controle). Os nomes levam o prefixo "abast-" de propósito: '.status-solicitado'
// e '.status-confirmado' já existem no index.css com OUTRO significado (a
// Fila de Rampa, onde "Confirmado" quer dizer "recebido, ainda por fazer", e
// por isso é laranja de espera). Aqui "Confirmado" é o oposto: está
// resolvido. Reaproveitar a classe pintaria os dois com a mesma cor dizendo
// coisas contrárias.
//
// Os legados de conclusão entram no mesmo verde de confirmado — não vale uma
// cor nova só por causa de linha antiga.
export function classeStatusAbastecimento(status) {
  if (status === 'solicitado') return 'abast-aguardando'
  if (status === 'confirmado' || status === 'pago' || status === 'entregue' || status === 'aguardando_pagamento') return 'abast-confirmado'
  return status
}

// Pedido que não pede mais nada de ninguém — sai das listas ativas (a
// planilha do Painel de Controle e o Diário de Bordo do cliente), mas
// continua inteiro no banco e no Histórico de Solicitações.
//
// 'confirmado' NÃO entra aqui: um pedido confirmado é justamente o que a
// equipe precisa ver para ir abastecer. Ele sai da planilha pelo tempo
// (ver JANELA_PLANILHA_MS abaixo), não pelo status.
export function abastecimentoConcluido(status) {
  return status === 'cancelado' || status === 'pago' || status === 'entregue'
}

// Por quanto tempo um pedido já confirmado continua na planilha do Painel
// de Controle. Como não existe "entregue" neste fluxo, é o relógio que
// limpa a lista — senão ela cresceria para sempre. Um dia cobre com folga
// a rotina da marina, e nada some do banco: o pedido segue no Histórico de
// Solicitações do cliente e na exportação.
export const JANELA_PLANILHA_MS = 24 * 60 * 60 * 1000

// "Completar tanque" — para quando o cliente não sabe quantos litros faltam
// (só se sabe depois de encher). Vai sem quantidade fechada; usa o campo
// observacoes já existente como marcador, sem coluna nova no banco. A
// coluna quantidade_litros continua NOT NULL, então grava 0 — o mesmo
// placeholder que os pedidos antigos já usam, o que mantém a convenção
// legível para os 53 registros que já estavam lá.
export const OBSERVACAO_COMPLETAR_TANQUE = 'Completar tanque'

export function ehCompletarTanque(pedido) {
  return pedido?.observacoes === OBSERVACAO_COMPLETAR_TANQUE
}

// Quantidade para mostrar na planilha e no Diário de Bordo.
export function textoQuantidade(pedido) {
  if (ehCompletarTanque(pedido)) return 'Completar tanque'
  return `${Number(pedido?.quantidade_litros || 0).toFixed(0)} L`
}
