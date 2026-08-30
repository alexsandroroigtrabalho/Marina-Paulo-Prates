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
  { chave: 'arrais', label: 'Arrais-Amador' },
  { chave: 'motonauta', label: 'Motonauta' },
  { chave: 'ambas', label: 'Habilitação completa' },
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
  { chave: 'data_emissao_rg', label: 'Data de emissão do RG', tipo: 'date' },
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

export async function listarMatriculas(marinaId) {
  if (!marinaId) return []
  const { data, error } = await dbEnautica.from('matriculas')
    .select('*, clientes:cliente_id(nome, email, telefone)')
    .eq('marina_id', marinaId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function aprovarMatricula(id) {
  const { error } = await dbEnautica.from('matriculas').update({
    status: 'aprovada', aprovada_em: new Date().toISOString(), motivo_recusa: null,
  }).eq('id', id)
  if (error) throw error
}

export async function recusarMatricula(id, motivo) {
  const { error } = await dbEnautica.from('matriculas').update({
    status: 'recusada', motivo_recusa: motivo || null,
  }).eq('id', id)
  if (error) throw error
}

export async function listarMatriculasAprovadas(marinaId) {
  if (!marinaId) return []
  const { data, error } = await dbEnautica.from('matriculas')
    .select('*, clientes:cliente_id(nome, email)')
    .eq('marina_id', marinaId).eq('status', 'aprovada').order('created_at', { ascending: false })
  if (error) throw error
  return data || []
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
}

export async function atualizarStatusAgendamento(id, status) {
  const { error } = await dbEnautica.from('agendamentos').update({ status }).eq('id', id)
  if (error) throw error
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
    .select('*, clientes:cliente_id(nome, email)')
    .eq('marina_id', marinaId).order('created_at', { ascending: false })
  if (error) throw error
  return data || []
}

export async function emitirCertificado({ marinaId, clienteId, habilitacao }) {
  const { error } = await dbEnautica.from('certificados').insert({
    marina_id: marinaId, cliente_id: clienteId, habilitacao, status: 'disponível',
  })
  if (error) throw error
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
