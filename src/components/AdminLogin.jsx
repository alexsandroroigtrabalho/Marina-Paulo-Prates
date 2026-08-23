import { useState } from 'react'
import { IconLock } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'

export default function AdminLogin({ onVoltar }) {
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

  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />
      <form className="card-login" onSubmit={entrar} style={{ alignItems: 'center', textAlign: 'center' }}>
        <IconLock size={36} color="var(--cor-primaria)" />
        <h1>Área da administração</h1>
        <input type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} required style={{ width: '100%' }} />
        <input type="password" placeholder="Senha" value={senha} onChange={(e) => setSenha(e.target.value)} required style={{ width: '100%' }} />
        {erro && <div className="erro">{erro}</div>}
        <button type="submit" disabled={carregando} style={{ width: '100%' }}>{carregando ? 'Entrando...' : 'Entrar'}</button>
        <button type="button" className="voltar" onClick={onVoltar}>← Voltar</button>
      </form>
      <p className="login-rv-rodape">Desenvolvido por RV Invictus</p>
    </div>
  )
}
