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
// confirmado sozinho. O prazo NÃO é o mesmo para os dois tipos, e o destino
// do vencimento automático TAMBÉM não é mais o mesmo (esse é o ponto que
// mudou nesta revisão):
//   - descida (retirada): 15 minutos. Confirmar (clique no botão
//     "Navegando", ou o prazo vencer sozinho) leva direto pro status final
//     'concluido' — a notificação sai da Fila de Rampa e a embarcação
//     aparece na tabela "Navegando". Aqui clique e vencimento automático
//     dão exatamente no mesmo lugar.
//   - subida (retorno): 5 minutos, mais curto — o cliente já está de volta
//     ou perto disso quando pede. AQUI clique e vencimento automático NÃO
//     são mais a mesma coisa:
//       · clicar "Recolhido" continua sendo o de sempre: vai direto pro
//         status final 'concluido' — some da Fila de Rampa e, no mesmo
//         instante, some a embarcação da tabela "Navegando" (ver
//         ultimaMovimentacaoPorEmbarcacao em lib/agendamentos.js).
//       · já vencer os 5 minutos SEM ninguém clicar não finaliza mais
//         nada sozinho — só confirma o pedido (o cliente já vê "Solicitação
//         confirmada" no próprio painel, ver statusAgendamentoDiario em
//         TelaClienteDashboard.jsx, que já tratava esse status há tempos) e
//         grava 'confirmado'. A notificação CONTINUA na Fila de Rampa e a
//         embarcação CONTINUA em "Navegando" até a equipe clicar
//         "Recolhido" de verdade — só esse clique manual é que apaga a
//         notificação e tira a embarcação da água. "Cancelar" continua
//         disponível o tempo todo, mesmo depois de confirmado sozinho (ver
//         linhaNotificacao em TelaVagas.jsx).
//
// Por isso agora tem DOIS destinos possíveis pro vencimento automático,
// diferente do clique manual (que é sempre 'concluido' pros dois tipos) —
// ver statusFinalAgendamento (clique) x statusAutoConfirmadoAgendamento
// (relógio) abaixo.
export const JANELA_DESCIDA_MS = 15 * 60 * 1000
export const JANELA_SUBIDA_MS = 5 * 60 * 1000

function janelaAgendamento(tipo) {
  return tipo === 'retirada' ? JANELA_DESCIDA_MS : JANELA_SUBIDA_MS
}

// Pra qual status uma descida/subida vai quando a EQUIPE confirma por
// clique ("Navegando"/"Recolhido") — sempre o mesmo valor pros dois tipos:
// 'concluido'. Isso nunca mudou; o que mudou foi separar isso do destino do
// vencimento automático (statusAutoConfirmadoAgendamento, logo abaixo), que
// pra subida agora é diferente.
export function statusFinalAgendamento(_tipo) {
  return 'concluido'
}

// Pra qual status vai quando NINGUÉM decide e o prazo vence sozinho.
// Descida: igual ao clique, 'concluido'. Subida: 'confirmado' — um status
// intermediário (não apaga a notificação, não tira a embarcação da água),
// só o clique manual em "Recolhido" leva ela pro 'concluido' de verdade.
export function statusAutoConfirmadoAgendamento(tipo) {
  return tipo === 'retirada' ? 'concluido' : 'confirmado'
}

// "Navegando" na descida (confirma que o barco entrou na água), "Recolhido"
// na subida (confirma que o barco já foi retirado) — mesmo destino no
// banco quando é clique da equipe, textos diferentes porque contam coisas
// diferentes pra quem está vendo o Painel de Controle.
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
  return janelaEncerrada(inicioJanelaAgendamento(a), agoraMs, janelaAgendamento(a.tipo))
    ? statusAutoConfirmadoAgendamento(a.tipo)
    : 'solicitado'
}

// Ainda espera decisão inicial (confirmar ou cancelar dentro do prazo)? Vale
// para os dois lados: o "Cancelar" do Diário de Bordo do cliente sai neste
// instante (a policy "cliente_cancela_proprio_agendamento" no banco repete
// essa mesma condição em SQL, com a mesma janela por tipo, então nem por
// fora da aplicação dá pra cancelar depois do prazo). Do lado da equipe, os
// botões da Fila de Rampa NÃO usam mais isso pra decidir se aparecem —
// aparecem sempre (ver linhaNotificacao em TelaVagas.jsx) — isso aqui
// continua servindo só pro botão de cancelar do próprio cliente.
export function aguardandoDecisaoAgendamento(a, agoraMs = Date.now()) {
  return statusEfetivoAgendamento(a, agoraMs) === 'solicitado'
}

// Ainda deve aparecer na Fila de Rampa? Diferente de aguardandoDecisao: uma
// subida 'confirmado' (vencida sozinha, sem ninguém ter clicado) não está
// mais "esperando decisão" (o cliente já foi confirmado, não dá mais pra
// cancelar pelo app dele), mas AINDA precisa aparecer pra equipe até
// alguém clicar "Recolhido" — é essa diferença que linhasFilaAtivas usa
// (lib/filaRampa.js). Só vale pra subida: uma descida nunca fica
// 'confirmado' por este fluxo (vencer o prazo já finaliza ela direto).
export function aguardandoNaFila(a, agoraMs = Date.now()) {
  const efetivo = statusEfetivoAgendamento(a, agoraMs)
  if (efetivo === 'solicitado') return true
  return efetivo === 'confirmado' && a.tipo === 'retorno'
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
