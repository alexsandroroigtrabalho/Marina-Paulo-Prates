import { listarClientes, listarEmbarcacoes, listarOrdensServico, listarDespachos } from './db'

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
      : c.pagamento_confirmado ? 'Liberado' : 'Aguardando pagamento'
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
    o.status?.replace('_', ' '),
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
