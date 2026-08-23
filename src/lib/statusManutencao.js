/* ============================================================
 * Status de uma ordem de serviço (marina.ordens_servico) — fonte única
 * usada em todo lugar que exibe manutenção: a tela interna Manutenção
 * (badge + seletor), o Diário de Bordo do portal do cliente e a planilha
 * exportada pela engrenagem da aba Manutenção. Mudar um rótulo aqui já
 * atualiza todos esses lugares de uma vez.
 *
 * "aberta" continua sendo o valor padrão de uma ordem recém-criada
 * (default da coluna no schema.sql) e "cancelada" continua disponível
 * pra quando um serviço é cancelado — nenhum dos dois some, só não têm
 * uma cor de farol específica pedida, então mantêm o tom neutro já usado
 * no resto do sistema para status "em espera"/"neutro".
 * ============================================================ */
export const STATUS_MANUTENCAO = [
  { valor: 'aberta', label: 'Aberta' },
  { valor: 'em_andamento', label: 'Em andamento' },
  { valor: 'aguardando_peca', label: 'Aguardando peça' },
  { valor: 'concluida', label: 'Concluído' },
  { valor: 'cancelada', label: 'Cancelada' },
]

export function labelStatusManutencao(status) {
  return STATUS_MANUTENCAO.find((s) => s.valor === status)?.label || status
}
