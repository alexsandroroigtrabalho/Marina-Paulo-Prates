import { db } from './supabase'

/* ============================================================
 * Todas as operações de banco de dados ficam centralizadas aqui,
 * seguindo o padrão do projeto RV Invictus (src/lib/db.js).
 * ============================================================ */

/* ---------- Clientes ---------- */
export async function listarClientes(marinaId) {
  const { data, error } = await db
    .from('clientes')
    .select('*')
    .eq('marina_id', marinaId)
    .order('nome')
  if (error) throw error
  return data
}

export async function salvarCliente(cliente) {
  const { data, error } = await db.from('clientes').upsert(cliente).select()
  if (error) throw error
  return data[0]
}

/* ---------- Embarcações ---------- */
export async function listarEmbarcacoes(marinaId) {
  const { data, error } = await db
    .from('embarcacoes')
    .select('*, clientes(nome)')
    .eq('marina_id', marinaId)
    .order('nome')
  if (error) throw error
  return data
}

export async function salvarEmbarcacao(embarcacao) {
  const { data, error } = await db.from('embarcacoes').upsert(embarcacao).select()
  if (error) throw error
  return data[0]
}

/* ---------- Vagas ---------- */
export async function listarVagas(marinaId) {
  const { data, error } = await db
    .from('vagas')
    .select('*')
    .eq('marina_id', marinaId)
    .order('codigo')
  if (error) throw error
  return data
}

export async function salvarVaga(vaga) {
  const { data, error } = await db.from('vagas').upsert(vaga).select()
  if (error) throw error
  return data[0]
}

/* ---------- Reservas / Atracação ---------- */
export async function listarReservas(marinaId) {
  const { data, error } = await db
    .from('reservas')
    .select('*, vagas(codigo), clientes(nome), embarcacoes(nome)')
    .eq('marina_id', marinaId)
    .order('data_inicio', { ascending: false })
  if (error) throw error
  return data
}

export async function criarReserva(reserva) {
  const { data, error } = await db.from('reservas').insert(reserva).select()
  if (error) throw error
  // marca a vaga como reservada/ocupada
  await db.from('vagas').update({ status: 'ocupada' }).eq('id', reserva.vaga_id)
  return data[0]
}

export async function encerrarReserva(reservaId, vagaId) {
  const { error } = await db.from('reservas').update({ status: 'encerrada' }).eq('id', reservaId)
  if (error) throw error
  await db.from('vagas').update({ status: 'disponivel' }).eq('id', vagaId)
}

/* ---------- Financeiro / Cobranças ---------- */
export async function listarCobrancas(marinaId) {
  const { data, error } = await db
    .from('cobrancas')
    .select('*, clientes(nome)')
    .eq('marina_id', marinaId)
    .order('vencimento', { ascending: false })
  if (error) throw error
  return data
}

export async function criarCobranca(cobranca) {
  const { data, error } = await db.from('cobrancas').insert(cobranca).select()
  if (error) throw error
  return data[0]
}

export async function marcarCobrancaPaga(cobrancaId) {
  const { error } = await db
    .from('cobrancas')
    .update({ status: 'pago', pago_em: new Date().toISOString() })
    .eq('id', cobrancaId)
  if (error) throw error
}

/* ---------- Manutenção / Ordens de Serviço ---------- */
export async function listarOrdensServico(marinaId) {
  const { data, error } = await db
    .from('ordens_servico')
    .select('*, embarcacoes(nome), clientes(nome)')
    .eq('marina_id', marinaId)
    .order('data_abertura', { ascending: false })
  if (error) throw error
  return data
}

export async function criarOrdemServico(os) {
  const { data, error } = await db.from('ordens_servico').insert(os).select()
  if (error) throw error
  return data[0]
}

export async function atualizarStatusOS(osId, status) {
  const patch = { status }
  if (status === 'concluida') patch.data_conclusao = new Date().toISOString()
  const { error } = await db.from('ordens_servico').update(patch).eq('id', osId)
  if (error) throw error
}

/* ---------- Agendamentos (retirada para água / retorno de atracação) ---------- */
export async function listarAgendamentosCliente(clienteId) {
  const { data, error } = await db
    .from('agendamentos')
    .select('*, embarcacoes(nome)')
    .eq('cliente_id', clienteId)
    .order('data_hora', { ascending: false })
  if (error) throw error
  return data
}

export async function listarAgendamentos(marinaId) {
  const { data, error } = await db
    .from('agendamentos')
    .select('*, clientes(nome), embarcacoes(nome)')
    .eq('marina_id', marinaId)
    .order('data_hora', { ascending: true })
  if (error) throw error
  return data
}

export async function solicitarAgendamento(agendamento) {
  const { data, error } = await db.from('agendamentos').insert(agendamento).select()
  if (error) throw error
  return data[0]
}

export async function atualizarStatusAgendamento(id, status) {
  const { error } = await db.from('agendamentos').update({ status }).eq('id', id)
  if (error) throw error
}

/* ---------- Documentação (TIE, seguro, habilitação, vistoria...) ---------- */
export async function listarDocumentos(marinaId) {
  const { data, error } = await db
    .from('documentos_embarcacao')
    .select('*, embarcacoes(nome, clientes(nome))')
    .eq('marina_id', marinaId)
    .order('data_validade', { ascending: true })
  if (error) throw error
  return data
}

export async function listarDocumentosEmbarcacao(embarcacaoId) {
  const { data, error } = await db
    .from('documentos_embarcacao')
    .select('*')
    .eq('embarcacao_id', embarcacaoId)
    .order('data_validade', { ascending: true })
  if (error) throw error
  return data
}

export async function salvarDocumento(documento) {
  const { data, error } = await db.from('documentos_embarcacao').upsert(documento).select()
  if (error) throw error
  return data[0]
}

/* ---------- Laudos técnicos (diferencial: engenheiro/vistoriador próprio) ---------- */
export async function listarLaudos(marinaId) {
  const { data, error } = await db
    .from('laudos')
    .select('*, embarcacoes(nome), clientes(nome)')
    .eq('marina_id', marinaId)
    .order('data_solicitacao', { ascending: false })
  if (error) throw error
  return data
}

export async function listarLaudosCliente(clienteId) {
  const { data, error } = await db
    .from('laudos')
    .select('*, embarcacoes(nome)')
    .eq('cliente_id', clienteId)
    .order('data_solicitacao', { ascending: false })
  if (error) throw error
  return data
}

export async function solicitarLaudo(laudo) {
  const { data, error } = await db.from('laudos').insert(laudo).select()
  if (error) throw error
  return data[0]
}

export async function atualizarLaudo(id, patch) {
  const { error } = await db.from('laudos').update(patch).eq('id', id)
  if (error) throw error
}

/* ---------- Despachos (regularização junto à Capitania dos Portos) ---------- */
export async function listarDespachos(marinaId) {
  const { data, error } = await db
    .from('despachos')
    .select('*, embarcacoes(nome), clientes(nome)')
    .eq('marina_id', marinaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function listarDespachosCliente(clienteId) {
  const { data, error } = await db
    .from('despachos')
    .select('*, embarcacoes(nome)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function criarDespacho(despacho) {
  const { data, error } = await db.from('despachos').insert(despacho).select()
  if (error) throw error
  return data[0]
}

export async function atualizarDespacho(id, patch) {
  const { error } = await db.from('despachos').update(patch).eq('id', id)
  if (error) throw error
}
