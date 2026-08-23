// Pra cada embarcação, decide qual foi a movimentação concluída mais
// recente (retirada = ainda na água | retorno = já atracou) — é isso que
// decide se uma embarcação aparece em "Navegando" no Painel de Controle da
// marina e no indicador equivalente do painel do próprio cliente (mesma
// lógica usada nos dois lugares, centralizada aqui pra nunca dessincronizar).
//
// Compara primeiro por `data_hora` (quando o cliente marcou que saiu/voltou)
// e, em caso de empate, por `created_at` (quando o registro foi criado no
// banco — sempre único e estritamente crescente, ao contrário de
// `data_hora`). Esse empate acontece mais do que parece: o campo `data_hora`
// só tem precisão de minuto, então uma retirada e um retorno solicitados
// dentro do mesmo minuto colidem. Sem o desempate por `created_at`, qual das
// duas "vencia" dependia da ordem (arbitrária, do Postgres) em que os
// registros chegavam do banco — podendo fazer uma retirada recém-confirmada
// não aparecer em Navegando, mesmo com a embarcação de fato na água.
export function ultimaMovimentacaoPorEmbarcacao(agendamentos) {
  const ultima = {}
  agendamentos
    .filter((a) => a.status === 'concluido' && a.embarcacao_id)
    .forEach((a) => {
      const atual = ultima[a.embarcacao_id]
      if (!atual) {
        ultima[a.embarcacao_id] = a
        return
      }
      const dataA = new Date(a.data_hora).getTime()
      const dataAtual = new Date(atual.data_hora).getTime()
      const maisRecente = dataA > dataAtual || (dataA === dataAtual && new Date(a.created_at) > new Date(atual.created_at))
      if (maisRecente) ultima[a.embarcacao_id] = a
    })
  return ultima
}
