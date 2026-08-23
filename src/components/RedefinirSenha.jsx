import { useState } from 'react'
import { IconLock, IconEye, IconEyeOff, IconLogin2 } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'

// Tela mostrada quando o usuário chega pelo link de redefinição de senha do
// e-mail (enviado pela Edge Function send-email, tipo 'recuperar_senha' —
// ver Home.jsx). O App.jsx detecta o evento 'PASSWORD_RECOVERY' do Supabase
// Auth e renderiza este componente no lugar de qualquer outra tela, mesmo
// já existindo uma sessão válida: essa sessão só serve pra autorizar a
// troca de senha, não pra liberar o resto do sistema ainda.
//
// Depois de salvar a nova senha, o usuário segue direto logado (a sessão de
// recuperação vira a sessão normal) — não pedimos um novo login. Se
// preferir forçar um login novo por segurança, é só chamar
// supabase.auth.signOut() antes de onConcluido().
export default function RedefinirSenha({ onConcluido }) {
  const [senha, setSenha] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [concluido, setConcluido] = useState(false)

  async function salvar(e) {
    e.preventDefault()
    setErro(null)
    if (senha.length < 6) { setErro('A senha precisa ter pelo menos 6 caracteres.'); return }
    if (senha !== confirmar) { setErro('As senhas não coincidem.'); return }

    setCarregando(true)
    const { error } = await supabase.auth.updateUser({ password: senha })
    setCarregando(false)
    if (error) { setErro(error.message); return }
    setConcluido(true)
  }

  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      <form className="card-login login-sem-painel login-card-centralizado" onSubmit={salvar}>
        <h1 className="login-titulo">Nova senha</h1>

        {concluido ? (
          <>
            <p className="login-subtitulo">Senha atualizada com sucesso.</p>
            <button type="button" className="login-botao-entrar" onClick={onConcluido}>
              <IconLogin2 size={18} /> Continuar
            </button>
          </>
        ) : (
          <>
            <p className="login-subtitulo">Escolha uma nova senha para sua conta.</p>

            <label className="login-rotulo" htmlFor="nova-senha">Nova senha</label>
            <div className="login-campo login-campo-senha">
              <IconLock size={18} />
              <input
                id="nova-senha"
                type={mostrarSenha ? 'text' : 'password'}
                placeholder="Digite a nova senha"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                minLength={6}
                required
              />
              <button
                type="button"
                className="login-botao-olho"
                onClick={() => setMostrarSenha((v) => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {mostrarSenha ? <IconEyeOff size={18} /> : <IconEye size={18} />}
              </button>
            </div>

            <label className="login-rotulo" htmlFor="confirmar-senha">Confirmar senha</label>
            <div className="login-campo">
              <IconLock size={18} />
              <input
                id="confirmar-senha"
                type={mostrarSenha ? 'text' : 'password'}
                placeholder="Repita a nova senha"
                value={confirmar}
                onChange={(e) => setConfirmar(e.target.value)}
                minLength={6}
                required
              />
            </div>

            {erro && <div className="erro">{erro}</div>}

            <button type="submit" className="login-botao-entrar" disabled={carregando}>
              <IconLogin2 size={18} /> {carregando ? 'Salvando...' : 'Salvar nova senha'}
            </button>
          </>
        )}
      </form>

      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
