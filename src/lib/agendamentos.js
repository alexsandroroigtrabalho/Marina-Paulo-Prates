// Pra cada embarcação, decide qual foi a movimentação concluída mais
// recente (retirada = ainda na água | retorno = já atracou) — é isso que
// decide se uma embarcação aparece em "Navegando" no Painel de Controle da
// marina e no indicador equivalente do painel do próprio cliente (mesma
// lógica usada nos dois lugares, centralizada aqui pra nunca dessincronizar).
//
// Compara por `concluido_em` — o instante real em que o status virou
// 'concluido', gravado automaticamente pelo aplicativo (ver
// atualizarStatusAgendamento em lib/db.js) e nunca editável por ninguém.
// De propósito, NÃO usa `data_hora` como
// critério principal: esse campo é o horário que o próprio cliente digita
// ao pedir a descida/subida, então nada garante que reflita a ordem real
// dos acontecimentos — uma descida confirmada agora podia ter um
// `data_hora` mais antigo que uma subida confirmada dias atrás (se o
// cliente tivesse digitado um horário incomum), fazendo a embarcação
// recém-confirmada não aparecer em Navegando mesmo estando de fato na água.
//
// `created_at` entra só como desempate final de segurança, pro caso raro de
// dois registros terem `concluido_em` idêntico — é único e estritamente
// crescente. Registros antigos (de antes dessa coluna existir) tiveram
// `concluido_em` preenchido por uma migração com o melhor valor disponível
// na época, então nunca ficam sem esse campo.
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
      const chave = (x) => new Date(x.concluido_em || x.data_hora).getTime()
      const chaveA = chave(a)
      const chaveAtual = chave(atual)
      const maisRecente = chaveA > chaveAtual || (chaveA === chaveAtual && new Date(a.created_at) > new Date(atual.created_at))
      if (maisRecente) ultima[a.embarcacao_id] = a
    })
  return ultima
}
