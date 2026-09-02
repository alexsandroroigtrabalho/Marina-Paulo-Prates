import { db, dbEnautica } from './supabase'

// Tudo que o RV e-Náutica precisa do banco, num lugar só — mesmo padrão de
// src/lib/db.js (RV Marine). Duas fontes de dados:
//   - marina.clientes (via `db`): o cadastro do aluno é o MESMO cadastro de
//     cliente usado pelos outros apps RV do mesmo tenant — não existe uma
//     tabela "alunos" separada. Os campos de documento/endereço abaixo
//     entraram em marina.clientes pela migração enautica_matriculas_e_dados_documento.
//   - enautica.matriculas / .agendamentos / .certificados (via `dbEnautica`):
//     o que é específico desta aplicação.

// As 3 opções de habilitação do rsnautica antigo — únicas que existem hoje,
// por isso a coluna `habilitacao` tem um CHECK travando nesses 3 valores.
export const HABILITACOES = [
  // Espaço fixo ( , não um espaço normal) entre "Arrais" e "Amador": o
  // botão da matrícula (TelaClienteENautica.jsx, .enautica-botao-habilitacao)
  // é justinho de largura de propósito (a foto ocupa a maior parte) — com
  // espaço normal, o navegador quebra a linha bem ali ("Arrais" numa linha,
  // "Amador" na outra); com hífen ("Arrais-Amador", o texto antigo) o
  // navegador NÃO quebra ali, então trocar só o hífen por espaço comum
  // quebrava o texto em duas linhas. Espaço fixo mantém a mesma aparência
  // visual (um espaço normal) mas sem esse ponto de quebra.
  { chave: 'arrais', label: 'Arrais Amador' },
  { chave: 'motonauta', label: 'Motonauta' },
  { chave: 'ambas', label: 'Habilitação Completa' },
]

export function labelHabilitacao(chave) {
  return HABILITACOES.find((h) => h.chave === chave)?.label || chave
}

// Campos que a Ficha de Cadastro inicial (FichaCadastro.jsx) NÃO pede, mas
// que os 4 documentos de matrícula (Requerimento de Habilitação, Declaração
// de Residência, Atestado de Treinamento, Procuração — mesmos modelos do
// rsnautica antigo) precisam. É essa lista que decide o que o formulário de
// matrícula pergunta: só o que ainda estiver vazio no cadastro do cliente.
export const CAMPOS_DOCUMENTO = [
  { chave: 'data_nascimento', label: 'Data de nascimento', tipo: 'date' },
  { chave: 'rg', label: 'RG', tipo: 'text' },
  { chave: 'orgao_expedidor', label: 'Órgão expedidor do RG', tipo: 'text' },
  { chave: 'naturalidade', label: 'Naturalidade (cidade onde nasceu)', tipo: 'text' },
  { chave: 'nacionalidade', label: 'Nacionalidade', tipo: 'text' },
  { chave: 'telefone', label: 'Telefone', tipo: 'text' },
  { chave: 'cep', label: 'CEP', tipo: 'text' },
  { chave: 'rua', label: 'Rua', tipo: 'text' },
  { chave: 'bairro', label: 'Bairro', tipo: 'text' },
  { chave: 'cidade', label: 'Cidade', tipo: 'text' },
  { chave: 'uf', label: 'UF', tipo: 'text' },
]

// Só os campos que o cliente ainda não preencheu (em nenhuma aplicação) —
// evita perguntar de novo o que ele já informou, seja no cadastro inicial,
// seja em "Minha conta" do RV Marine, seja numa matrícula anterior.
export function camposDocumentoFaltando(cliente) {
  if (!cliente) return CAMPOS_DOCUMENTO
  return CAMPOS_DOCUMENTO.filter((c) => !cliente[c.chave])
}

// --- Matrícula ---------------------------------------------------------

export async function buscarMinhaMatricula(clienteId) {
  if (!clienteId) return null
  const { data, error } = await dbEnautica.from('matriculas').select('*')
    .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (error) throw error
  return data
}

// Salva os campos de documento que faltavam (parcial — só os que vieram
// preenchidos) e, em seguida, cria o pedido de matrícula. As duas escritas
// não são atômicas (são tabelas/schemas diferentes), mas isso é aceitável
// aqui: na pior das hipóteses os dados do cliente ficam salvos e a
// matrícula falha — o formulário pode ser reenviado sem perder o que já
// foi preenchido.
export async function enviarMatricula({ clienteId, marinaId, habilitacao, dadosFaltando }) {
  if (dadosFaltando && Object.keys(dadosFaltando).length > 0) {
    const { error: erroCliente } = await db.from('clientes').update(dadosFaltando).eq('id', clienteId)
    if (erroCliente) throw erroCliente
  }
  const { error } = await dbEnautica.from('matriculas').insert({
    marina_id: marinaId, cliente_id: clienteId, habilitacao, status: 'pendente',
  })
  if (error) throw error
}

// --- Painel da escola (operador/admin) ----------------------------------

// PostgREST não resolve joins cross-schema (enautica → marina) via sintaxe
// `clientes:cliente_id(...)`. Solução: buscar as linhas sem join e mesclar
// os dados do cliente numa segunda query ao schema marina.
async function mesclarClientes(registros, campos = 'id, nome, email, telefone') {
  if (!registros || registros.length === 0) return registros
  const ids = [...new Set(registros.map((r) => r.cliente_id).filter(Boolean))]
  if (ids.length === 0) return registros
  const { data: clientes } = await db.from('clientes').select(campos).in('id', ids)
  const mapa = {}
  ;(clientes || []).forEach((c) => { mapa[c.id] = c })
  return registros.map((r) => ({ ...r, clientes: mapa[r.cliente_id] || null }))
}

export async function listarMatriculas(marinaId) {
  if (!marinaId) return []
  const { data, error } = await dbEnautica.from('matriculas')
    .select('*')
    .eq('marina_id', marinaId).order('created_at', { ascending: false })
  if (error) throw error
  return mesclarClientes(data || [], 'id, nome, email, telefone')
}

// Recebe a matrícula inteira (não só o id) porque precisa de marina_id e
// cliente_id pra criar a notificação do aluno logo em seguida (ver
// criarNotificacao abaixo) — TelaMatriculasENautica.jsx já tem a linha
// completa em mãos (veio do listarMatriculas), então não custa nada.
export async function aprovarMatricula(matricula) {
  const { error } = await dbEnautica.from('matriculas').update({
    status: 'aprovada', aprovada_em: new Date().toISOString(), motivo_recusa: null,
  }).eq('id', matricula.id)
  if (error) throw error
  await criarNotificacao({
    marinaId: matricula.marina_id, clienteId: matricula.cliente_id, tipo: 'matricula_aprovada',
    titulo: 'Matrícula aprovada',
    mensagem: `Sua matrícula para ${labelHabilitacao(matricula.habilitacao)} foi aprovada. Bem-vindo(a)!`,
  })
}

export async function recusarMatricula(matricula, motivo) {
  const { error } = await dbEnautica.from('matriculas').update({
    status: 'recusada', motivo_recusa: motivo || null,
  }).eq('id', matricula.id)
  if (error) throw error
  await criarNotificacao({
    marinaId: matricula.marina_id, clienteId: matricula.cliente_id, tipo: 'matricula_recusada',
    titulo: 'Matrícula recusada',
    mensagem: motivo ? `Sua matrícula foi recusada: ${motivo}` : 'Sua matrícula foi recusada. Fale com a escola para mais detalhes.',
  })
}

// "Estou pronto para a prova teórica" — o próprio aluno declara (sim/não),
// feature real do rsnautica (AreaAluno.jsx: alunos.pronto_teste) que tinha
// ficado de fora da primeira leva. NÃO é um pedido de agendamento — quem
// marca a avaliação continua sendo a escola, na Agenda; isto só dá à escola
// um sinal de quem já se sente pronto, visível na aba Aprovadas de
// Matrículas (badge) e reaproveitável na hora de escolher quem agendar.
export async function declararProntidaoTeste(matriculaId, resposta) {
  const { error } = await dbEnautica.from('matriculas').update({ pronto_teste: resposta }).eq('id', matriculaId)
  if (error) throw error
}

export async function listarMatriculasAprovadas(marinaId) {
  if (!marinaId) return []
  const { data, error } = await dbEnautica.from('matriculas')
    .select('*')
    .eq('marina_id', marinaId).eq('status', 'aprovada').order('created_at', { ascending: false })
  if (error) throw error
  return mesclarClientes(data || [], 'id, nome, email')
}

// --- Aulas preparatórias -------------------------------------------------
//
// Igual ao rsnautica antigo: conteúdo estático (3 módulos em vídeo), sem
// tabela própria no banco — não é agendamento nem documento, é só material
// de estudo que o aluno consome no próprio ritmo. A única customização por
// escola é o vídeo de cada módulo, guardado em `marina.marinas.config_json`
// (coluna que já existia, sem uso — ver `{ aulas: [{ id, youtubeId }] }`),
// mesmo mecanismo do rsnautica (lá era `escolas.config_json.aulas`). Sem
// vídeo configurado, mostra "Conteúdo em preparação" em vez de um link
// morto — a RV Invictus ainda não passou o material de nenhuma escola.
export const MODULOS_AULA = [
  { id: 1, titulo: 'Aula 01', desc: 'Introdução e legislação náutica' },
  { id: 2, titulo: 'Aula 02', desc: 'Segurança e regras de navegação' },
  { id: 3, titulo: 'Aula 03', desc: 'Nós, sinalização e emergências' },
]

export function modulosAulaComVideo(marina) {
  const overrides = marina?.config_json?.aulas || []
  return MODULOS_AULA.map((m) => {
    const cfg = overrides.find((o) => o.id === m.id)
    return { ...m, youtubeId: cfg?.youtubeId || '' }
  })
}

// Aceita o que a escola for colar no campo de configuração (Matrículas →
// engrenagem → Aulas preparatórias): um ID puro (11 caracteres) ou uma URL
// completa do YouTube, em qualquer um dos formatos comuns
// (watch?v=, youtu.be/, embed/, shorts/) — extrai só o ID, que é o que
// modulosAulaComVideo já espera salvar em config_json.aulas. Devolve string
// vazia se não reconhecer nada (o campo fica só sem link, sem travar o
// formulário com um erro).
export function extrairYoutubeId(entrada) {
  const valor = (entrada || '').trim()
  if (!valor) return ''
  if (/^[\w-]{11}$/.test(valor)) return valor
  const padroes = [
    /(?:youtube\.com\/watch\?v=|youtube\.com\/embed\/|youtube\.com\/shorts\/|youtu\.be\/)([\w-]{11})/,
  ]
  for (const p of padroes) {
    const m = valor.match(p)
    if (m) return m[1]
  }
  return ''
}

// Progresso do aluno nas aulas: só local (localStorage), igual ao rsnautica
// antigo — não é informação que a escola precisa consultar ou aprovar, é
// só o aluno lembrando o que já assistiu, então não vale o custo de uma
// tabela/coluna no banco pra isso.
function chaveAulasConcluidas(clienteId) {
  return `enautica-aulas-concluidas-${clienteId}`
}

export function aulasConcluidas(clienteId) {
  try {
    return new Set(JSON.parse(localStorage.getItem(chaveAulasConcluidas(clienteId)) || '[]'))
  } catch {
    return new Set()
  }
}

export function alternarAulaConcluida(clienteId, moduloId, concluida) {
  const atual = aulasConcluidas(clienteId)
  if (concluida) atual.add(moduloId)
  else atual.delete(moduloId)
  try {
    localStorage.setItem(chaveAulasConcluidas(clienteId), JSON.stringify([...atual]))
  } catch {
    // localStorage indisponível (aba anônima, storage cheio) — progresso só
    // não persiste entre sessões; não impede o uso da tela.
  }
  return atual
}

// --- Agenda (aulas práticas e avaliações) --------------------------------
//
// Diferente das Aulas acima: aqui são compromissos de verdade, marcados
// pela escola, com data/hora/local — o aluno só confirma presença, não
// consome conteúdo. Mesmo modelo do rsnautica antigo (tabela
// `agendamentos`, `alunos_ids` como array — um mesmo compromisso pode
// juntar vários alunos, ex. uma turma inteira na mesma avaliação).
export const TIPOS_AGENDAMENTO = [
  { chave: 'pratica', label: 'Aula prática' },
  { chave: 'teorica', label: 'Avaliação teórica' },
]

export function labelTipoAgendamento(chave) {
  return TIPOS_AGENDAMENTO.find((t) => t.chave === chave)?.label || chave
}

export async function listarMeusAgendamentos(clienteId) {
  if (!clienteId) return []
  const { data, error } = await dbEnautica.from('agendamentos').select('*')
    .contains('alunos_ids', [clienteId]).order('data', { ascending: true })
  if (error) throw error
  return data || []
}

export async function listarAgendamentosEscola(marinaId) {
  if (!marinaId) return []
  const { data, error } = await dbEnautica.from('agendamentos').select('*')
    .eq('marina_id', marinaId).order('data', { ascending: false })
  if (error) throw error
  return data || []
}

export async function criarAgendamento({ marinaId, tipo, data, hora, local, alunosIds }) {
  const { error } = await dbEnautica.from('agendamentos').insert({
    marina_id: marinaId, tipo, tipo_label: labelTipoAgendamento(tipo),
    data, hora, local, alunos_ids: alunosIds, status: 'confirmado',
  })
  if (error) throw error
  // No rsnautica antigo (referência), criar um evento disparava um e-mail
  // pra cada aluno selecionado — aqui vira uma notificação dentro da própria
  // plataforma (ver criarNotificacao abaixo), a pedido explícito do Alex.
  const dataFormatada = new Date(`${data}T12:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  await criarNotificacoesEmLote((alunosIds || []).map((clienteId) => ({
    marinaId, clienteId, tipo: 'agendamento',
    titulo: `${labelTipoAgendamento(tipo)} marcada`,
    mensagem: `${labelTipoAgendamento(tipo)} em ${dataFormatada} às ${hora}${local ? `, em ${local}` : ''}.`,
  })))
}

// --- Certificados ---------------------------------------------------------
//
// Igual ao rsnautica antigo: registro/recibo interno de conclusão, não o
// documento oficial (esse vem depois, direto da Marinha do Brasil pro
// Gov.br do aluno — ver aviso fixo na aba). "Baixar certificado" só gera um
// arquivo de texto simples com os dados, não um PDF de verdade.
export async function listarMeusCertificados(clienteId) {
  if (!clienteId) return []
  const { data, error } = await dbEnautica.from('certificados').select('*')
    .eq('cliente_id', clienteId).order('data_emissao', { ascending: false })
  if (error) throw error
  return data || []
}

export async function listarCertificadosEscola(marinaId) {
  if (!marinaId) return []
  const { data, error } = await dbEnautica.from('certificados')
    .select('*')
    .eq('marina_id', marinaId).order('created_at', { ascending: false })
  if (error) throw error
  return mesclarClientes(data || [], 'id, nome, email')
}

export async function emitirCertificado({ marinaId, clienteId, habilitacao }) {
  const { error } = await dbEnautica.from('certificados').insert({
    marina_id: marinaId, cliente_id: clienteId, habilitacao, status: 'disponível',
  })
  if (error) throw error
  await criarNotificacao({
    marinaId, clienteId, tipo: 'certificado',
    titulo: 'Certificado emitido',
    mensagem: `Seu certificado de ${labelHabilitacao(habilitacao)} já está disponível em "Meus certificados".`,
  })
}

export async function atualizarStatusCertificado(id, status) {
  const { error } = await dbEnautica.from('certificados').update({ status }).eq('id', id)
  if (error) throw error
}

// Quem já está apto a receber certificado (matrícula aprovada) mas ainda
// não tem um emitido pra aquela habilitação — é a lista que a tela da
// escola oferece pra emitir.
export async function listarAprovadosSemCertificado(marinaId) {
  const [matriculas, certs] = await Promise.all([
    listarMatriculasAprovadas(marinaId),
    listarCertificadosEscola(marinaId),
  ])
  const jaEmitidos = new Set((certs || []).map((c) => `${c.cliente_id}:${c.habilitacao}`))
  return (matriculas || []).filter((m) => !jaEmitidos.has(`${m.cliente_id}:${m.habilitacao}`))
}

// --- Notificações (dentro da plataforma, não por e-mail) -----------------
//
// No rsnautica (referência operacional), matrícula decidida, agendamento
// marcado e certificado emitido disparavam um e-mail (Resend). Aqui vira um
// aviso dentro do próprio painel do aluno — sino no cabeçalho, contador de
// não lidas, lista com marcar-como-lida — usando a mesma tabela/realtime que
// o resto do e-Náutica já usa, sem precisar de SMTP nem Edge Function nova.
//
// `criarNotificacao`/`criarNotificacoesEmLote` nunca derrubam a ação
// principal se falharem (aprovar matrícula, marcar agendamento, emitir
// certificado já aconteceram de verdade quando isto roda): erro aqui só é
// avisado no console, pra não fazer o administrador achar que a ação
// principal falhou por causa de um aviso secundário.
export async function criarNotificacao({ marinaId, clienteId, tipo, titulo, mensagem }) {
  const { error } = await dbEnautica.from('notificacoes').insert({
    marina_id: marinaId, cliente_id: clienteId, tipo, titulo, mensagem: mensagem || null,
  })
  if (error) console.error('Não foi possível criar a notificação:', error.message)
}

export async function criarNotificacoesEmLote(notificacoes) {
  if (!notificacoes || notificacoes.length === 0) return
  const linhas = notificacoes.map((n) => ({
    marina_id: n.marinaId, cliente_id: n.clienteId, tipo: n.tipo, titulo: n.titulo, mensagem: n.mensagem || null,
  }))
  const { error } = await dbEnautica.from('notificacoes').insert(linhas)
  if (error) console.error('Não foi possível criar as notificações:', error.message)
}

export async function listarMinhasNotificacoes(clienteId) {
  if (!clienteId) return []
  const { data, error } = await dbEnautica.from('notificacoes').select('*')
    .eq('cliente_id', clienteId).order('created_at', { ascending: false }).limit(30)
  if (error) throw error
  return data || []
}

export async function marcarNotificacaoLida(id) {
  const { error } = await dbEnautica.from('notificacoes').update({ lida: true }).eq('id', id)
  if (error) throw error
}

export async function marcarTodasNotificacoesLidas(clienteId) {
  const { error } = await dbEnautica.from('notificacoes').update({ lida: true })
    .eq('cliente_id', clienteId).eq('lida', false)
  if (error) throw error
}
