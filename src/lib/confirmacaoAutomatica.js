// A regra dos 15 minutos, num lugar só.
//
// Vale para TUDO que o cliente pede à marina — abastecimento, descida e
// subida: a equipe tem duas opções, confirmar ou cancelar. Se ninguém
// cancelar dentro de 15 minutos, o pedido vale como confirmado sozinho.
//
// A confirmação automática é DERIVADA de um carimbo de tempo que já existe
// no registro, não gravada por ninguém. Essa escolha é o que faz a regra
// valer de verdade:
//
//   - não depende de alguém estar com o Painel de Controle aberto (o pedido
//     feito às 3h da manhã se confirma igual);
//   - não precisa de rotina agendada, fila nem serviço externo;
//   - dá exatamente o mesmo resultado no painel da equipe, no painel do
//     cliente e nas policies do banco, porque todos calculam a mesma conta
//     sobre o mesmo campo.
//
// Quem grava é só a decisão HUMANA: clicar em "Confirmar" ou "Cancelar"
// escreve o status no banco. A ausência de clique não escreve nada — ela é
// lida pelo relógio.
//
// Este módulo é genérico de propósito: recebe o instante em que a janela
// começou e o instante atual, e não sabe se está falando de combustível ou
// de manobra. Quem sabe disso é lib/statusAbastecimento.js e
// lib/agendamentos.js, cada um decidindo de qual campo tirar o começo da
// janela (ver `inicioJanelaAgendamento` lá, que não é simplesmente a hora do
// pedido).

export const JANELA_CONFIRMACAO_MS = 15 * 60 * 1000

// Milissegundos de um campo de data que pode vir nulo, vazio ou ilegível.
// Devolve null nesses casos, nunca um número.
//
// O cuidado aqui não é teórico: `new Date(null).getTime()` devolve 0 — o
// ano de 1970, um número perfeitamente finito e muito além de qualquer
// janela de 15 minutos. Sem esta função, um registro sem carimbo de tempo
// nasceria "confirmado".
export function paraMs(valor) {
  if (!valor) return null
  const ms = new Date(valor).getTime()
  return Number.isFinite(ms) ? ms : null
}

// A janela já fechou? `inicioMs` null (não dá pra saber quando começou)
// devolve false de propósito: sem essa informação, o seguro é continuar
// esperando decisão de gente — nunca confirmar sozinho.
export function janelaEncerrada(inicioMs, agoraMs) {
  if (inicioMs === null) return false
  return agoraMs - inicioMs >= JANELA_CONFIRMACAO_MS
}

// Quanto falta para a confirmação automática, em ms — 0 quando já passou ou
// quando não dá pra calcular.
export function restanteDaJanela(inicioMs, agoraMs) {
  if (inicioMs === null) return 0
  return Math.max(0, inicioMs + JANELA_CONFIRMACAO_MS - agoraMs)
}

// O instante exato em que a confirmação automática aconteceu — usado para
// gravar/exibir o momento da confirmação de quem nunca foi clicado.
export function momentoConfirmacaoAutomatica(inicioMs) {
  if (inicioMs === null) return null
  return new Date(inicioMs + JANELA_CONFIRMACAO_MS).toISOString()
}

// "7 min" / "40 s" — abaixo de um minuto conta em segundos, senão a
// contagem ficaria parada em "1 min" durante o minuto inteiro final.
export function textoRestante(restanteMs) {
  if (restanteMs <= 0) return ''
  const segundos = Math.ceil(restanteMs / 1000)
  if (segundos < 60) return `${segundos} s`
  return `${Math.ceil(segundos / 60)} min`
}
