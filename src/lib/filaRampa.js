import { aguardandoNaFila } from './statusAgendamento.js'

// Fonte única de "quais notificações da Fila de Rampa ainda estão
// aguardando" — antes vivia só dentro de TelaVagas.jsx, mas passou a ser
// usada também pelo apito global (SonsPainelAdmin.jsx, sempre montado em
// Layout.jsx, tocando mesmo fora da tela Painel de Controle) pra detectar
// notificação nova. Extraído pra um lugar só assim que precisou de uma
// segunda cópia, pelo mesmo motivo dos outros módulos lib/status*.js: evitar
// que as duas cópias divirjam.

// Linhas ativas da Fila de Rampa: o que ainda espera decisão inicial da
// equipe (dois botões, Confirmar/Cancelar, 15min descida/5min subida — ver
// lib/statusAgendamento.js) OU, nos dois tipos, o que já confirmou sozinho
// pelo relógio mas ainda não teve o clique manual ("Navegando"/"Recolhido")
// — esse fica visível indefinidamente até esse clique (ver aguardandoNaFila).
// Usa o status
// EFETIVO, não o gravado: a notificação muda de comportamento na Fila de
// Rampa no instante exato em que o prazo se esgota, mesmo que a confirmação
// automática ainda não tenha sido escrita no banco (isso acontece sozinho no
// próximo ciclo do painel — ver autoConfirmarVencidos em TelaVagas.jsx).
//
// `agoraMs` tem padrão Date.now() pra não quebrar quem ainda chama sem
// relógio próprio (SonsPainelAdmin.jsx) — quem já tem um relógio que avança
// sozinho (TelaVagas.jsx) passa o dele, pra ficar testável e sincronizado
// com o resto da tela.
export function linhasFilaAtivas(agendamentos, agoraMs = Date.now()) {
  return agendamentos
    .filter((a) => a.status !== 'cancelado' && aguardandoNaFila(a, agoraMs))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
}
