import { db, supabase } from './supabase'

/* ============================================================
 * Todas as operações de banco de dados ficam centralizadas aqui,
 * seguindo o padrão do projeto RV Invictus (src/lib/db.js).
 * ============================================================ */

/* ---------- Marina (config_json: apitos, e-mail de relatório, branding) ---------- */
export async function buscarMarina(marinaId) {
  const { data, error } = await db.from('marinas').select('*').eq('id', marinaId).maybeSingle()
  if (error) throw error
  return data
}

// Faz merge raso com o config_json já existente, pra não apagar outras
// chaves salvas ali (ex: gravar os apitos não pode apagar o e-mail do
// relatório de documentos, e vice-versa).
export async function atualizarConfigMarina(marinaId, configPatch) {
  const atual = await buscarMarina(marinaId)
  const novoConfig = { ...(atual?.config_json || {}), ...configPatch }
  const { error } = await db.from('marinas').update({ config_json: novoConfig }).eq('id', marinaId)
  if (error) throw error
  return novoConfig
}

// Dispara na hora o relatório de documentos vencidos/a vencer (botão
// "Enviar relatório agora" na aba Despachos) — chama a Edge Function
// send-email, que faz a consulta e o envio do lado do servidor (usa a
// service role, então o navegador nunca vê a chave de serviço). O mesmo
// envio também acontece sozinho todo dia via agendamento no Supabase
// (Edge Functions → Cron), sem precisar clicar em nada.
export async function enviarRelatorioDocumentosAgora(marinaId) {
  const { data, error } = await supabase.functions.invoke('send-email', {
    body: { tipo: 'relatorio_documentos', marina_id: marinaId },
  })
  if (error) throw error
  if (data?.error) throw new Error(data.error)
  return data
}

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

// Não usa .upsert() de propósito: num UPDATE parcial (ex: só { id,
// pagamento_confirmado }, como a chave de pagamento e os botões de
// suspender/liberar acesso fazem), o .upsert() do Supabase tenta o caminho
// de INSERT (ON CONFLICT DO UPDATE) e a policy de RLS de INSERT
// ("admin_marina_clientes", WITH CHECK marina_id = ...) é avaliada contra
// a linha proposta — que não tem marina_id nesses updates parciais, então
// vira NULL e a policy barra com "new row violates row-level security
// policy". Separar update/insert evita esse caminho: o UPDATE só reavalia
// a policy de UPDATE sobre a linha já existente (marina_id continua o
// mesmo, sem violar o WITH CHECK).
export async function salvarCliente(cliente) {
  const { id, ...campos } = cliente
  const query = id
    ? db.from('clientes').update(campos).eq('id', id)
    : db.from('clientes').insert(campos)
  const { data, error } = await query.select()
  if (error) throw error
  return data[0]
}

// Remove o cadastro do cliente definitivamente. Não há ON DELETE CASCADE
// nas tabelas relacionadas (embarcações, cobranças, ordens de serviço,
// despachos, laudos etc. — ver schema.sql), então o banco recusa a remoção
// (violação de chave estrangeira) enquanto existir algum registro vinculado
// a esse cliente; quem chama trata esse erro e oferece a opção de remover
// os vínculos junto (removerClienteComVinculos, abaixo) ou usar "Suspender
// acesso" em vez de remover.
export async function removerCliente(id) {
  const { error } = await db.from('clientes').delete().eq('id', id)
  if (error) throw error
}

async function excluirPorCliente(tabela, clienteId) {
  const { error } = await db.from(tabela).delete().eq('cliente_id', clienteId)
  if (error) throw error
}

// Remove o cliente E todos os registros vinculados a ele em cascata —
// usada quando o administrador confirma explicitamente que quer apagar
// também o histórico (embarcações, cobranças, ordens de serviço,
// despachos, laudos, notas fiscais, agendamentos, pedidos de
// abastecimento, autorizados, documentos das embarcações).
//
// A ordem das exclusões segue o mapa de chaves estrangeiras do
// schema.sql: cada passo remove primeiro quem referencia o que o próximo
// passo vai apagar (ex.: notas_fiscais referencia cobrancas, então sai
// antes de cobrancas; cobrancas referencia reservas/ordens_servico, então
// sai antes delas). Sem essa ordem o Postgres recusa a exclusão por
// violação de chave estrangeira.
export async function removerClienteComVinculos(clienteId) {
  const { data: embarcacoesCliente, error: erroEmb } = await db
    .from('embarcacoes')
    .select('id')
    .eq('cliente_id', clienteId)
  if (erroEmb) throw erroEmb
  const idsEmbarcacoes = (embarcacoesCliente || []).map((e) => e.id)

  await excluirPorCliente('notas_fiscais', clienteId)
  await excluirPorCliente('pedidos_abastecimento', clienteId)
  await excluirPorCliente('cobrancas', clienteId)
  await excluirPorCliente('agendamentos', clienteId)

  if (idsEmbarcacoes.length > 0) {
    const { error } = await db.from('documentos_embarcacao').delete().in('embarcacao_id', idsEmbarcacoes)
    if (error) throw error
  }

  await excluirPorCliente('laudos', clienteId)
  await excluirPorCliente('despachos', clienteId)
  await excluirPorCliente('ordens_servico', clienteId)
  await excluirPorCliente('reservas', clienteId)
  await excluirPorCliente('autorizados', clienteId)
  await excluirPorCliente('embarcacoes', clienteId)

  const { error: erroCliente } = await db.from('clientes').delete().eq('id', clienteId)
  if (erroCliente) throw erroCliente
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

// Versão "achatada" das cobranças pra tela "Arrecadação detalhada": junta o
// nome do cliente e, quando a cobrança nasceu de uma reserva (vaga) ou de uma
// ordem de serviço, o nome da embarcação vinculada a uma delas — os dois
// únicos jeitos hoje de uma cobrança carregar uma embarcação/jet específico.
export async function listarCobrancasDetalhado(marinaId) {
  const { data, error } = await db
    .from('cobrancas')
    .select('*, clientes(nome), reservas(embarcacoes(nome)), ordens_servico(embarcacoes(nome))')
    .eq('marina_id', marinaId)
    .order('created_at', { ascending: false })
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

// Confirma o pagamento da mensalidade de um cliente (chamado pela chave de
// pagamento — sempre um clique manual e explícito do administrador). Além de
// gravar a confirmação no cadastro do cliente, cria automaticamente uma
// cobrança de mensalidade "paga" — é isso que alimenta a planilha
// "Arrecadação detalhada" da aba Financeiro com o valor recebido, sem
// precisar de nenhum lançamento manual separado.
//
// Evita duplicar: se já existe uma cobrança de mensalidade paga para este
// cliente no mês corrente (ex: administrador desligou e religou a chave no
// mesmo mês), não cria outra — a arrecadação não pode contar o mesmo
// recebimento duas vezes. Desligar a chave nunca apaga uma cobrança já
// paga: dinheiro já recebido continua contando como arrecadação; desligar
// só bloqueia o acesso do período seguinte, até nova confirmação.
export async function confirmarPagamentoMensalidade({ cliente, marinaId, valorMensalidade }) {
  const agora = new Date()
  const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1).toISOString().slice(0, 10)

  if (Number(valorMensalidade) > 0) {
    const { data: existentes, error: erroConsulta } = await db
      .from('cobrancas')
      .select('id')
      .eq('cliente_id', cliente.id)
      .eq('marina_id', marinaId)
      .eq('tipo', 'mensalidade')
      .eq('status', 'pago')
      .gte('vencimento', inicioMes)
      .limit(1)
    if (erroConsulta) throw erroConsulta

    if (!existentes.length) {
      await criarCobranca({
        marina_id: marinaId,
        cliente_id: cliente.id,
        descricao: `Mensalidade — ${agora.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })} — ${cliente.nome}`,
        tipo: 'mensalidade',
        valor: Number(valorMensalidade),
        vencimento: agora.toISOString().slice(0, 10),
        status: 'pago',
        pago_em: agora.toISOString(),
      })
    }
  }

  return salvarCliente({ id: cliente.id, pagamento_confirmado: true, pagamento_confirmado_em: agora.toISOString() })
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

export async function listarOrdensServicoCliente(clienteId) {
  const { data, error } = await db
    .from('ordens_servico')
    .select('*, embarcacoes(nome)')
    .eq('cliente_id', clienteId)
    .order('data_abertura', { ascending: false })
  if (error) throw error
  return data
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
    .select('*, clientes(nome), embarcacoes(nome), autorizados(nome, parentesco)')
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

// Horários já ocupados (de QUALQUER cliente) numa data — usado pra tirar da
// lista de horariosDisponiveis (lib/agendaRampa.js) os horários que já têm
// um agendamento ativo, sem expor de quem é cada um (RPC
// marina.horarios_ocupados só devolve o carimbo data_hora, nunca
// cliente/embarcação — ver supabase/sql/migration_horarios_ocupados_agenda.sql).
// Chamada toda vez que o cliente troca a data no formulário de
// Descida/Subida, pra manter os horários disponíveis sempre sincronizados
// com o que já foi agendado.
export async function listarHorariosOcupados(marinaId, dataYMD) {
  const { data, error } = await db.rpc('horarios_ocupados', { p_marina_id: marinaId, p_data: dataYMD })
  if (error) throw error
  return (data || []).map((linha) => linha.data_hora)
}

// Ao confirmar (status='concluido'), grava também `concluido_em` — o
// instante real da confirmação, nunca editável pelo cliente. É esse campo
// (não o `data_hora`, que o cliente escolhe livremente ao pedir a
// descida/subida) que decide qual foi a movimentação mais recente de cada
// embarcação — ver ultimaMovimentacaoPorEmbarcacao em lib/agendamentos.js.
// Sem isso, uma descida confirmada agora podia "perder" pra uma subida
// antiga se o cliente tivesse digitado um horário anterior ao dela, e a
// embarcação recém-confirmada não aparecia em Navegando.
export async function atualizarStatusAgendamento(id, status) {
  const patch = { status }
  if (status === 'concluido') patch.concluido_em = new Date().toISOString()
  const { error } = await db.from('agendamentos').update(patch).eq('id', id)
  if (error) throw error
}

// status: null (sem resgate), 'solicitado', 'recebido', 'resgatado' ou
// 'cancelado' — ver lib/statusResgate.js para o fluxo completo. Grava
// também resgate_atualizado_em — é o carimbo que TelaVagas.jsx usa pra
// saber por quanto tempo ainda mostrar "Estou bem" depois que o cliente
// cancela o S.O.S. (5 minutos, ver estouBemAtivo em lib/statusResgate.js),
// sem precisar de nenhum job/trigger no banco pra isso.
export async function atualizarStatusResgate(id, status) {
  const { error } = await db.from('agendamentos').update({ resgate_status: status, resgate_atualizado_em: new Date().toISOString() }).eq('id', id)
  if (error) throw error
}

// Encerra uma navegação direto pela tabela "Navegando" do Painel de
// Controle, sem esperar o cliente enviar uma Subida pelo app — usado quando
// o campo Status dessa tabela recebe "Recolhido" ou "Resgatado" (ver
// TelaVagas.jsx). Cria um agendamento de retorno já concluído, com a mesma
// consequência de uma Subida confirmada normalmente: tira a embarcação de
// "Navegando" (ultimaMovimentacaoPorEmbarcacao passa a apontar pro retorno)
// e limpa o Diário de Bordo ativo do cliente (statusAgendamentoDiario, em
// TelaClienteDashboard.jsx, já trata qualquer retorno concluído assim). No
// caso de "Resgatado", também grava resgate_status='resgatado' na descida
// original — mesmo rótulo/histórico já usado pelo fluxo de S.O.S., pra
// quem olhar o Histórico de Manobras depois entender que não foi um
// retorno comum. "Cancelado" não cria retorno nenhum — só cancela a
// própria descida (mesmo efeito do botão "Cancelar" já usado na Fila de
// Rampa).
export async function encerrarNavegacao(retirada, motivo) {
  if (motivo === 'cancelado') {
    return atualizarStatusAgendamento(retirada.id, 'cancelado')
  }
  const agora = new Date().toISOString()
  const { error } = await db.from('agendamentos').insert({
    marina_id: retirada.marina_id,
    cliente_id: retirada.cliente_id,
    embarcacao_id: retirada.embarcacao_id,
    tipo: 'retorno',
    data_hora: agora,
    status: 'concluido',
    concluido_em: agora,
    observacoes: motivo === 'resgatado' ? 'Encerrado pela equipe — resgate' : 'Encerrado pela equipe — recolhido direto pela tabela Navegando',
  })
  if (error) throw error
  if (motivo === 'resgatado') {
    await atualizarStatusResgate(retirada.id, 'resgatado')
  }
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

/* ---------- Combustíveis (estoque/preço, controlado pelo gestor) ---------- */
export async function listarCombustiveis(marinaId) {
  const { data, error } = await db
    .from('combustiveis')
    .select('*')
    .eq('marina_id', marinaId)
    .order('nome')
  if (error) throw error
  return data
}

export async function salvarCombustivel(combustivel) {
  const { data, error } = await db
    .from('combustiveis')
    .upsert({ ...combustivel, atualizado_em: new Date().toISOString() })
    .select()
  if (error) throw error
  return data[0]
}

/* ---------- Pedidos de abastecimento (cliente solicita, com QR de pagamento) ---------- */
export async function listarPedidosAbastecimento(marinaId) {
  const { data, error } = await db
    .from('pedidos_abastecimento')
    .select('*, clientes(nome), embarcacoes(nome), combustiveis(nome)')
    .eq('marina_id', marinaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function listarPedidosAbastecimentoCliente(clienteId) {
  const { data, error } = await db
    .from('pedidos_abastecimento')
    .select('*, embarcacoes(nome), combustiveis(nome)')
    .eq('cliente_id', clienteId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function solicitarAbastecimento(pedido) {
  const { data, error } = await db.from('pedidos_abastecimento').insert(pedido).select()
  if (error) throw error
  return data[0]
}

export async function atualizarStatusAbastecimento(id, status) {
  const patch = { status }
  if (status === 'pago') patch.pago_em = new Date().toISOString()
  const { error } = await db.from('pedidos_abastecimento').update(patch).eq('id', id)
  if (error) throw error
}

/* ---------- Autorizados (pessoas que o cliente autoriza a retirar/devolver a embarcação) ---------- */
export async function listarAutorizados(clienteId) {
  const { data, error } = await db
    .from('autorizados')
    .select('*')
    .eq('cliente_id', clienteId)
    .order('nome')
  if (error) throw error
  return data
}

export async function adicionarAutorizado(autorizado) {
  const { data, error } = await db.from('autorizados').insert(autorizado).select()
  if (error) throw error
  return data[0]
}

export async function atualizarAutorizado(id, patch) {
  const { error } = await db.from('autorizados').update(patch).eq('id', id)
  if (error) throw error
}

export async function removerAutorizado(id) {
  const { error } = await db.from('autorizados').delete().eq('id', id)
  if (error) throw error
}

/* ---------- Notas fiscais (controle de NFS-e do serviço) ---------- */
export async function listarNotasFiscais(marinaId) {
  const { data, error } = await db
    .from('notas_fiscais')
    .select('*, clientes(nome), cobrancas(descricao)')
    .eq('marina_id', marinaId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
}

export async function criarNotaFiscal(nota) {
  const { data, error } = await db.from('notas_fiscais').insert(nota).select()
  if (error) throw error
  return data[0]
}

export async function atualizarNotaFiscal(id, patch) {
  const { error } = await db.from('notas_fiscais').update(patch).eq('id', id)
  if (error) throw error
}
