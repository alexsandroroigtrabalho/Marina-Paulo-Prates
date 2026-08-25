// Fonte única de "quais notificações da Fila de Rampa ainda estão
// aguardando" — antes vivia só dentro de TelaVagas.jsx, mas passou a ser
// usada também pelo apito global (SonsPainelAdmin.jsx, sempre montado em
// Layout.jsx, tocando mesmo fora da tela Painel de Controle) pra detectar
// notificação nova. Extraído pra um lugar só assim que precisou de uma
// segunda cópia, pelo mesmo motivo dos outros módulos lib/status*.js: evitar
// que as duas cópias divirjam.

// Uma notificação da Fila de Rampa continua "aguardando" (some da lista só
// quando concluída) em qualquer status que não seja 'concluido' — inclui o
// "Recebido" (status='confirmado'), que fica no meio do caminho entre
// "Solicitado" e o status final (Navegando/Recolhido) sem sair da Fila de
// Rampa.
//
// Exceção: na subida, assim que o status vira 'navegando' a notificação
// também sai da Fila de Rampa — a embarcação já está a caminho da marina, e
// esse acompanhamento passa a acontecer na tabela "Navegando" (ver
// naAgua/subidasNavegando em TelaVagas.jsx), não mais aqui.
export function statusLinha(a) {
  if (a.status === 'concluido') return a.tipo === 'retirada' ? 'navegando' : null
  if (a.tipo === 'retorno' && a.status === 'navegando') return null
  return a.tipo === 'retirada' ? 'aguardando_descida' : 'aguardando_retorno'
}

// Linhas ativas da Fila de Rampa: só o que ainda está aguardando descida ou
// retorno. Assim que vira "Navegando" a notificação sai daqui sozinha.
export function linhasFilaAtivas(agendamentos) {
  return agendamentos
    .filter((a) => a.status !== 'cancelado' && statusLinha(a) === (a.tipo === 'retirada' ? 'aguardando_descida' : 'aguardando_retorno'))
    .sort((a, b) => new Date(a.data_hora) - new Date(b.data_hora))
}
