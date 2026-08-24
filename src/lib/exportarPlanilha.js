import { listarClientes, listarEmbarcacoes, listarOrdensServico, listarDespachos, listarAgendamentos, listarCobrancasDetalhado, listarPedidosAbastecimento } from './db'
import { labelStatusManutencao } from './statusManutencao'

// Mesma tradução usada nas telas (Painel de Controle e painel do cliente) —
// ver TIPO_AGENDAMENTO_LABEL em TelaVagas.jsx/TelaClienteDashboard.jsx.
const TIPO_MANOBRA_LABEL = { retirada: 'Descida', retorno: 'Subida' }

/* ============================================================
 * Exportação de planilhas (CSV) usadas pela engrenagem de cada aba
 * do painel interno — um arquivo por área, sempre com os dados
 * completos daquela área (não só o que está filtrado/visível na
 * tela no momento).
 *
 * Formato: CSV separado por ";" (padrão do Excel em pt-BR, onde "," já
 * é o separador decimal) com BOM UTF-8 no início, pra abrir com os
 * acentos certos direto no Excel/Google Sheets sem configurar nada.
 * ============================================================ */

// Escapa um valor pra uma célula de CSV: só entra entre aspas quando o
// texto tem ";", aspas ou quebra de linha, dobrando aspas internas
// conforme a regra do formato.
function paraCsv(valor) {
  const texto = valor === null || valor === undefined ? '' : String(valor)
  if (/[";\n]/.test(texto)) return `"${texto.replace(/"/g, '""')}"`
  return texto
}

function formatarData(valor, comHora = false) {
  if (!valor) return ''
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return valor
  return comHora ? data.toLocaleString('pt-BR') : data.toLocaleDateString('pt-BR')
}

function formatarValor(valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  return Number(valor).toFixed(2).replace('.', ',')
}

// Monta o CSV (cabeçalho + linhas já prontas) e dispara o download no
// navegador — sem precisar de nenhum backend.
function baixarCsv(nomeArquivo, cabecalho, linhas) {
  const csv = '﻿' + [cabecalho.map(paraCsv).join(';'), ...linhas.map((linha) => linha.map(paraCsv).join(';'))].join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nomeArquivo
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

function comData(sufixo) {
  return `${sufixo}_${new Date().toISOString().slice(0, 10)}.csv`
}

/* ---------- Clientes ---------- */
export async function exportarClientesCsv(marinaId) {
  const [clientes, embarcacoes] = await Promise.all([
    listarClientes(marinaId),
    listarEmbarcacoes(marinaId),
  ])

  const cabecalho = [
    'Nº', 'Nome', 'E-mail', 'Telefone', 'Carteira/CPF', 'Endereço', 'Observações',
    'Embarcações', 'Cadastro', 'Pagamento', 'Acesso à Agenda',
  ]
  const linhas = clientes.map((c, i) => {
    const embarcacoesDoCliente = embarcacoes
      .filter((e) => e.cliente_id === c.id)
      .map((e) => `${e.nome} (${e.tipo})`)
      .join(' · ')
    const acesso = c.acesso_suspenso
      ? 'Suspenso'
      : c.pagamento_confirmado ? 'Liberado' : c.acesso_liberado_manual ? 'Liberado manualmente' : 'Aguardando pagamento'
    return [
      i + 1,
      c.nome,
      c.email,
      c.telefone,
      c.cpf_cnpj,
      c.endereco,
      c.observacoes,
      embarcacoesDoCliente,
      c.cadastro_confirmado ? 'Realizado' : 'Pendente',
      c.pagamento_confirmado ? 'Efetuado' : 'Pendente',
      acesso,
    ]
  })

  baixarCsv(comData('clientes'), cabecalho, linhas)
}

/* ---------- Manutenção (ordens de serviço) ---------- */
export async function exportarManutencaoCsv(marinaId) {
  const ordens = await listarOrdensServico(marinaId)

  const cabecalho = [
    'Nº', 'Cliente', 'Embarcação', 'Tipo de serviço', 'Descrição', 'Prioridade', 'Status',
    'Responsável', 'Data de abertura', 'Data agendada', 'Data de conclusão', 'Valor (R$)', 'Observações',
  ]
  const linhas = ordens.map((o, i) => [
    i + 1,
    o.clientes?.nome,
    o.embarcacoes?.nome,
    o.tipo_servico?.replace('_', ' '),
    o.descricao,
    o.prioridade,
    labelStatusManutencao(o.status),
    o.responsavel,
    formatarData(o.data_abertura, true),
    formatarData(o.data_agendada, true),
    formatarData(o.data_conclusao, true),
    formatarValor(o.valor),
    o.observacoes,
  ])

  baixarCsv(comData('manutencao'), cabecalho, linhas)
}

/* ---------- Despachos (Capitania dos Portos) ---------- */
export async function exportarDespachosCsv(marinaId) {
  const despachos = await listarDespachos(marinaId)

  const cabecalho = [
    'Nº', 'Cliente', 'Embarcação', 'Tipo', 'Órgão', 'Nº Protocolo', 'Status',
    'Data do protocolo', 'Data de conclusão', 'Observações', 'Criado em',
  ]
  const linhas = despachos.map((d, i) => [
    i + 1,
    d.clientes?.nome,
    d.embarcacoes?.nome,
    d.tipo?.replace('_', ' '),
    d.orgao,
    d.numero_protocolo,
    d.status?.replace('_', ' '),
    formatarData(d.data_protocolo),
    formatarData(d.data_conclusao),
    d.observacoes,
    formatarData(d.created_at, true),
  ])

  baixarCsv(comData('despachos'), cabecalho, linhas)
}

/* ---------- Histórico de manobras (descidas/subidas já confirmadas) ----------
 * Mesmo recorte que a tabela "Histórico de manobras" do Painel de Controle
 * (aba Navegando): todo agendamento com status "concluido", mais recente
 * primeiro. Sujeito à mesma limpeza automática de 48h do banco (ver
 * marina.limpar_historico_manobras_antigo em supabase/sql/schema.sql) — a
 * planilha exportada reflete só o que ainda está disponível no momento. */
export async function exportarHistoricoManobrasCsv(marinaId) {
  const [agendamentos, embarcacoes] = await Promise.all([
    listarAgendamentos(marinaId),
    listarEmbarcacoes(marinaId),
  ])
  const tipoPorEmbarcacao = Object.fromEntries(embarcacoes.map((e) => [e.id, e.tipo]))

  const historico = agendamentos
    .filter((a) => a.status === 'concluido')
    .sort((a, b) => new Date(b.data_hora) - new Date(a.data_hora))

  const cabecalho = ['Nº', 'Cliente', 'Embarcação/Jet', 'Tipo', 'Tipo de manobra', 'Data e horário', 'Confirmado em']
  const linhas = historico.map((a, i) => [
    i + 1,
    a.clientes?.nome,
    a.embarcacoes?.nome,
    tipoPorEmbarcacao[a.embarcacao_id] || '',
    TIPO_MANOBRA_LABEL[a.tipo] || a.tipo,
    formatarData(a.data_hora, true),
    formatarData(a.concluido_em, true),
  ])

  baixarCsv(comData('historico_manobras'), cabecalho, linhas)
}

/* ---------- Arrecadação detalhada (Financeiro) ----------
 * Mesma composição da tela Financeiro (mensalidades pagas + consumo de
 * combustível pago/entregue — ver montarLinhasArrecadacao em
 * TelaFinanceiro.jsx), mas sempre com TODO o período disponível: a
 * exportação agora mora na engrenagem (Configurações → Financeiro), fora
 * do contexto dos filtros de data/cliente/status que a tela usa só pra
 * navegação em tela — mesmo princípio das outras exportações deste
 * arquivo (planilha completa, não um recorte do que estava filtrado). */
export async function exportarArrecadacaoCsv(marinaId) {
  const [cobrancasDetalhado, pedidosAbastecimento] = await Promise.all([
    listarCobrancasDetalhado(marinaId),
    listarPedidosAbastecimento(marinaId),
  ])

  const deCobrancas = cobrancasDetalhado
    .filter((c) => c.status === 'pago' && c.tipo === 'mensalidade')
    .map((c) => ({
      dataHora: c.pago_em,
      cliente: c.clientes?.nome,
      embarcacao: c.reservas?.embarcacoes?.nome || c.ordens_servico?.embarcacoes?.nome,
      descricao: c.descricao,
      valor: Number(c.valor),
      formaPagamento: c.forma_pagamento,
      status: c.status,
    }))
  const deAbastecimentos = pedidosAbastecimento
    .filter((p) => ['pago', 'entregue'].includes(p.status))
    .map((p) => ({
      dataHora: p.pago_em || p.created_at,
      cliente: p.clientes?.nome,
      embarcacao: p.embarcacoes?.nome,
      descricao: `Abastecimento — ${p.combustiveis?.nome || ''} (${Number(p.quantidade_litros).toFixed(2)} L)`.trim(),
      valor: Number(p.valor_total),
      formaPagamento: p.forma_pagamento,
      status: p.status,
    }))

  const linhasArrecadacao = [...deCobrancas, ...deAbastecimentos]
    .sort((a, b) => new Date(b.dataHora || 0) - new Date(a.dataHora || 0))

  const cabecalho = ['Nº', 'Data/hora', 'Cliente', 'Embarcação/jet', 'Descrição', 'Valor (R$)', 'Forma de pagamento', 'Status']
  const linhas = linhasArrecadacao.map((l, i) => [
    i + 1,
    formatarData(l.dataHora, true),
    l.cliente,
    l.embarcacao,
    l.descricao,
    formatarValor(l.valor),
    l.formaPagamento,
    l.status,
  ])

  baixarCsv(comData('arrecadacao_detalhada'), cabecalho, linhas)
}

/* ---------- Histórico de solicitações do cliente (painel do cliente) ----------
 * Diferente das exportações acima (que buscam tudo de novo no banco), esta
 * recebe os itens já prontos de TelaClienteDashboard.jsx: o mesmo recorte
 * "Histórico de Solicitações" da engrenagem (Configurações → Histórico de
 * solicitações) — TODA solicitação já feita pelo cliente (descida/subida,
 * combustível, S.O.S., manutenção, regularização, laudos, cancelamentos e
 * afins), pendente, cancelada ou concluída, com o status atual de cada
 * uma, ainda dentro da janela de 5 dias que essa tela usa (ver
 * diarioDeBordo/historicoSolicitacoes lá). Não é síncrona com o banco de
 * propósito: é uma cópia em CSV exatamente do que o cliente está vendo na
 * tela naquele momento, nada mais. */
export function exportarHistoricoSolicitacoesCsv(itens) {
  const cabecalho = ['Nº', 'Solicitação', 'Detalhe', 'Status', 'Data']
  const linhas = itens.map((item, i) => [
    i + 1,
    item.titulo,
    item.detalhe,
    item.statusLabel,
    formatarData(item.quando, true),
  ])
  baixarCsv(comData('meu_historico'), cabecalho, linhas)
}
