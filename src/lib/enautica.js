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
  { chave: 'ambas', label: 'Arrais-Amador + Motonauta' },
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
