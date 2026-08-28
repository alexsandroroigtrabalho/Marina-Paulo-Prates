import { statusEfetivoAgendamento } from './statusAgendamento.js'

// Fonte única de "quais notificações da Fila de Rampa ainda estão
// aguardando" — antes vivia só dentro de TelaVagas.jsx, mas passou a ser
// usada também pelo apito global (SonsPainelAdmin.jsx, sempre montado em
// Layout.jsx, tocando mesmo fora da tela Painel de Controle) pra detectar
// notificação nova. Extraído pra um lugar só assim que precisou de uma
// segunda cópia, pelo mesmo motivo dos outros módulos lib/status*.js: evitar
// que as duas cópias divirjam.

// Linhas ativas da Fila de Rampa: só o que ainda espera decisão da equipe
// (dois botões, Confirmar/Cancelar, 15 minutos de prazo — ver
// lib/statusAgendamento.js). Usa o status EFETIVO, não o gravado: a
// notificação some da Fila de Rampa no instante exato em que os 15 minutos
// se esgotam, mesmo que a confirmação automática ainda não tenha sido
// escrita no banco (isso acontece sozinho no próximo ciclo do painel — ver
// autoConfirmarVencidos em TelaVagas.jsx). Sem isso a linha ficaria visível
// por até um ciclo de atualização (10s) depois do prazo já ter passado.
//
// `agoraMs` tem padrão Date.now() pra não quebrar quem ainda chama sem
// relógio próprio (SonsPainelAdmin.jsx) — quem já tem um relógio que avança
// sozinho (TelaVagas.jsx) passa o dele, pra ficar testável e sincronizado
// com o resto da tela.
export function linhasFilaAtivas(agendamentos, agoraMs = Date.now()) {
  return agendamentos
    .filter((a) => a.status !== 'cancelado' && statusEfetivoAgendamento(a, agoraMs) === 'solicitado')
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
}
