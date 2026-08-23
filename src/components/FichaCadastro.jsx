import { useState } from 'react'
import { supabase, db } from '../lib/supabase'

const EMBARCACAO_VAZIA = { tipo: 'Barco', nome: '', numero_inscricao: '' }

export default function FichaCadastro({ onVoltar }) {
  const [form, setForm] = useState({
    nome: '', cpf: '', documentoIdentidade: '', telefone: '', email: '', senha: '',
    endereco: '', numeroCasa: '', complemento: '',
  })
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
        nome: form.nome,
        email: form.email,
        telefone: form.telefone,
        cpf_cnpj: form.cpf,
        documento_identidade: form.documentoIdentidade,
        endereco: form.endereco,
        numero_casa: form.numeroCasa,
        complemento: form.complemento,
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
      <div className="tela-central tela-login-rv">
        <img
          src="/rv-invictus-logo-dourado.png"
          alt="RV Invictus — Consultoria e Gestão de Processos"
          className="login-rv-logo"
        />
        <div className="card-login login-sem-painel">
          <h1 className="login-titulo">Cadastro enviado!</h1>
          <p className="login-subtitulo">Depois de enviado, a administração da marina confirma o cadastro e libera seu acesso.</p>
          <button className="btn-primario" onClick={onVoltar}>Voltar ao início</button>
        </div>
        <footer className="login-rv-footer">
          <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
        </footer>
      </div>
    )
  }

  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />
      <form className="card-login login-sem-painel cadastro-card" onSubmit={concluirCadastro}>
        <h1 className="login-titulo cadastro-titulo">Ficha de Cadastro</h1>
        <input placeholder="Nome completo" required
          value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <input placeholder="CPF" required
          value={form.cpf} onChange={(e) => setForm({ ...form, cpf: e.target.value })} />
        <input placeholder="Documento de identidade (RG)" required
          value={form.documentoIdentidade} onChange={(e) => setForm({ ...form, documentoIdentidade: e.target.value })} />
        <input type="email" placeholder="E-mail" required
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input placeholder="Telefone (WhatsApp)" required
          value={form.telefone} onChange={(e) => setForm({ ...form, telefone: e.target.value })} />
        <input type="password" placeholder="Crie uma senha" required
          value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />

        <input placeholder="Endereço (rua, bairro)" required
          value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
        <div className="cadastro-linha-endereco">
          <input placeholder="Número" required
            value={form.numeroCasa} onChange={(e) => setForm({ ...form, numeroCasa: e.target.value })} />
          <input placeholder="Complemento"
            value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
        </div>

        <p className="login-rotulo cadastro-embarcacao-titulo">Embarcação</p>
        {embarcacoes.map((emb, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 10, background: 'rgba(245,245,240,0.05)', border: '1px solid rgba(212,175,55,0.2)', borderRadius: 10 }}>
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
        <button type="button" className="voltar" onClick={onVoltar}>← Voltar</button>
      </form>
      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
