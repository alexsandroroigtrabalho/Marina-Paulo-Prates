import { useState } from 'react'
import { supabase } from '../lib/supabase'
import FichaCadastro from './FichaCadastro'

export default function AreaCliente({ onVoltar }) {
  const [etapa, setEtapa] = useState('escolha') // escolha | login | cadastro
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro(error.message)
    setCarregando(false)
  }

  if (etapa === 'cadastro') return <FichaCadastro onVoltar={() => setEtapa('escolha')} />

  if (etapa === 'login') {
    return (
      <div className="tela-central tela-login-rv">
        <img
          src="/rv-invictus-logo.png"
          alt="RV Invictus — Consultoria e Gestão de Processos"
          className="login-rv-logo"
        />
        <form className="card-login" onSubmit={entrar}>
          <h1>Já sou cadastrado</h1>
          <p>Entre com o e-mail e senha usados no cadastro.</p>
          <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
          {erro && <div className="erro">{erro}</div>}
          <button type="submit" disabled={carregando}>{carregando ? 'Entrando...' : 'Entrar'}</button>
          <button type="button" className="voltar" onClick={() => setEtapa('escolha')}>← Voltar</button>
        </form>
        <p className="login-rv-rodape">Desenvolvido por RV Invictus</p>
      </div>
    )
  }

  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />
      <div className="card-login">
        <h1>Área do cliente</h1>
        <p>Já tem cadastro na marina ou é a primeira vez por aqui?</p>
        <button className="btn-primario" onClick={() => setEtapa('login')}>Já sou cadastrado</button>
        <button className="btn-outline" onClick={() => setEtapa('cadastro')}>Fazer cadastro</button>
        <button type="button" className="voltar" onClick={onVoltar}>← Voltar</button>
      </div>
      <p className="login-rv-rodape">Desenvolvido por RV Invictus</p>
    </div>
  )
}
