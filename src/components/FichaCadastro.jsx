import { useState } from 'react'
import { supabase, db } from '../lib/supabase'

const EMBARCACAO_VAZIA = { tipo: 'Barco', nome: '', numero_inscricao: '' }

export default function FichaCadastro({ onVoltar }) {
  const [form, setForm] = useState({ carteira: '', telefone: '', email: '', senha: '', endereco: '' })
  const [embarcacoes, setEmbarcacoes] = useState([{ ...EMBARCACAO_VAZIA }])
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const [erro, setErro] = useState(null)

  function atualizarEmbarcacao(i, campo, valor) {
    const copia = [...embarcacoes]
    copia[i] = { ...copia[i], [campo]: valor }
    setEmbarcacoes(copia)
  }

  async function concluirCadastro(e) {
    e.preventDefault()
    setErro(null)
    setEnviando(true)
    try {
      const { data, error } = await supabase.auth.signUp({ email: form.email, password: form.senha })
      if (error) throw error

      const marinaId = import.meta.env.VITE_MARINA_ID // marina padrão configurada no .env
      const { data: clienteRows, error: erroCliente } = await db.from('clientes').insert({
        marina_id: marinaId,
        user_id: data.user?.id,
        nome: form.email.split('@')[0],
        email: form.email,
        telefone: form.telefone,
        cpf_cnpj: form.carteira,
        endereco: form.endereco,
      }).select()
      if (erroCliente) throw erroCliente
      const clienteId = clienteRows[0].id

      for (const emb of embarcacoes) {
        if (!emb.nome) continue
        await db.from('embarcacoes').insert({
          marina_id: marinaId,
          cliente_id: clienteId,
          nome: emb.nome,
          tipo: emb.tipo,
          registro: emb.numero_inscricao,
        })
      }
      setConcluido(true)
    } catch (err) {
      setErro(err.message)
    } finally {
      setEnviando(false)
    }
  }

  if (concluido) {
    return (
      <div className="tela-central">
        <div className="card-login">
          <h1>Cadastro enviado!</h1>
          <p>Depois de enviado, a administração da marina confirma o cadastro e libera seu acesso.</p>
          <button className="btn-primario" onClick={onVoltar}>Voltar ao início</button>
        </div>
      </div>
    )
  }

  return (
    <div className="tela-central">
      <form className="card-login" style={{ width: 400 }} onSubmit={concluirCadastro}>
        <h1>Ficha de cadastro</h1>
        <input placeholder="Número da carteira de habilitação" required
          value={form.carteira} onChange={(e) => setForm({ ...form, carteira: e.target.value })} />
        <input placeholder="Telefone (WhatsApp)" required
          value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        <input type="email" placeholder="E-mail" required
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="password" placeholder="Crie uma senha" required
          value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
        <input placeholder="Endereço completo" required
          value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />

        <p style={{ margin: '8px 0 0', fontWeight: 600, color: 'var(--cor-primaria)' }}>Embarcação(ões)</p>
        {embarcacoes.map((emb, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'var(--cor-fundo)', borderRadius: 10 }}>
            <select value={emb.tipo} onChange={(e) => atualizarEmbarcacao(i, 'tipo', e.target.value)}>
              <option>Barco</option>
              <option>Veleiro</option>
              <option>Jet Ski</option>
              <option>Iate</option>
            </select>
            <input placeholder="Nome da embarcação" value={emb.nome} onChange={(e) => atualizarEmbarcacao(i, 'nome', e.target.value)} />
            <input placeholder="Número de inscrição" value={emb.numero_inscricao} onChange={(e) => atualizarEmbarcacao(i, 'numero_inscricao', e.target.value)} />
          </div>
        ))}
        <button type="button" className="voltar" style={{ alignSelf: 'flex-start' }}
          onClick={() => setEmbarcacoes([...embarcacoes, { ...EMBARCACAO_VAZIA }])}>
          + Adicionar outra embarcação
        </button>

        {erro && <div className="erro">{erro}</div>}
        <button type="submit" disabled={enviando}>{enviando ? 'Enviando...' : 'Concluir cadastro'}</button>
        <p style={{ fontSize: 12, color: 'var(--cor-texto-suave)' }}>Depois de enviado, a administração confirma e libera o acesso.</p>
        <button type="button" className="voltar" onClick={onVoltar}>← Voltar</button>
      </form>
    </div>
  )
}
