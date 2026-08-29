import {
  janelaEncerrada, restanteDaJanela, momentoConfirmacaoAutomatica, textoRestante, paraMs,
} from './confirmacaoAutomatica.js'
// Extensão .js explícita de propósito: as regras puras deste módulo são
// testadas rodando direto no Node (sem Vite, sem navegador), e o Node exige
// o caminho completo. O Vite resolve dos dois jeitos.

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

// A regra dos 15 minutos vem de lib/confirmacaoAutomatica.js, a mesma usada
// pelos pedidos de descida e subida — um pedido do cliente é um pedido do
// cliente, e a marina responde do mesmo jeito em qualquer um deles.
//
// Aqui a janela começa em created_at: o pedido de combustível não tem hora
// marcada, é para agora. (Na descida/subida é diferente — ver
// inicioJanelaAgendamento em lib/agendamentos.js.)
//
// `agoraMs` entra como parâmetro (em vez de Date.now() aqui dentro) porque
// as telas já têm o próprio relógio que avança sozinho — e porque assim a
// função é testável sem depender do horário real.
export function statusEfetivoAbastecimento(pedido, agoraMs = Date.now()) {
  if (!pedido) return null
  if (pedido.status !== 'solicitado') return pedido.status
  return janelaEncerrada(inicioJanelaAbastecimento(pedido), agoraMs) ? 'confirmado' : 'solicitado'
}

export function inicioJanelaAbastecimento(pedido) {
  return paraMs(pedido?.created_at)
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
export function restanteParaConfirmar(pedido, agoraMs = Date.now()) {
  if (!pedido || pedido.status !== 'solicitado') return 0
  return restanteDaJanela(inicioJanelaAbastecimento(pedido), agoraMs)
}

// Quando o pedido foi confirmado, para o histórico: o carimbo gravado se
// alguém clicou, ou o instante calculado se foi o relógio que confirmou.
export function momentoConfirmacaoAbastecimento(pedido, agoraMs = Date.now()) {
  if (statusEfetivoAbastecimento(pedido, agoraMs) !== 'confirmado') return null
  return pedido.confirmado_em || momentoConfirmacaoAutomatica(inicioJanelaAbastecimento(pedido))
}

export const textoRestanteParaConfirmar = textoRestante

// Rótulos. Os quatro primeiros são o fluxo de hoje; os demais são valores
// LEGADOS, de pedidos feitos quando o abastecimento ainda tinha cobrança —
// continuam no banco e precisam de rótulo aqui para não aparecer o código
// cru numa linha antiga do Histórico de Solicitações.
export const STATUS_ABASTECIMENTO_LABEL = {
  solicitado: 'Aguardando',
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

// Pedido que não espera mais decisão de ninguém — sai da planilha de
// trabalho do Painel de Controle, mas continua inteiro no banco, no
// Histórico de abastecimento da equipe e no Histórico de Solicitações do
// cliente.
export function abastecimentoConcluido(status) {
  return status !== 'solicitado'
}

// A planilha do Painel de Controle mostra SÓ o que ainda espera decisão.
// Assim que o pedido é confirmado — pela equipe ou pelo relógio — ele sai
// dali e passa a viver no "Histórico de abastecimento" (Configurações →
// Histórico), de onde também sai a planilha exportada. A tela de trabalho
// fica com o que exige ação, e o registro fica guardado noutro lugar.

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

// Quantidade para mostrar na planilha e no Diário de Bordo. Texto mais
// curto que o marcador interno (OBSERVACAO_COMPLETAR_TANQUE, acima) — esse
// aqui é só exibição, não precisa repetir "tanque" (o combustível já
// aparece do lado, na coluna/rótulo de combustível).
export function textoQuantidade(pedido) {
  if (ehCompletarTanque(pedido)) return 'Completar'
  return `${Number(pedido?.quantidade_litros || 0).toFixed(0)} L`
}
