import { useState } from 'react'
import { IconMail, IconLock, IconEye, IconEyeOff, IconLogin2 } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'

// Página de entrada única do sistema. Antes existiam 3 telas separadas
// (Home -> escolha "Sou cliente"/"Administração" -> AreaCliente ou
// AdminLogin, cada uma com seu próprio formulário de senha). Agora só existe
// esta: um único formulário de e-mail/senha. Depois de autenticar, o App.jsx
// consulta `marina.perfis.role` e decide sozinho pra qual ambiente já
// existente o usuário vai — não há mais nenhum seletor manual de tipo de
// acesso.
//
// Campos com ícone, rótulo, alternância de mostrar/ocultar senha e "Esqueci
// minha senha" seguem a linguagem de um modelo de referência enviado pelo
// cliente, adaptada à identidade visual da RV Invictus (tipografia Cinzel/
// Montserrat do manual da marca, paleta dourado/azul-petróleo) — sem copiar
// cores ou o cartão promocional "Garanta sua vaga" do modelo original.
//
// "Esqueci minha senha" chama a Edge Function send-email (tipo
// 'recuperar_senha') em vez de supabase.auth.resetPasswordForEmail direto —
// assim o e-mail sai pelo Resend, com a identidade visual da marca, em vez
// do e-mail genérico do Supabase. A function gera o link oficial de
// recovery pela Admin API (não dispara o e-mail padrão do GoTrue) e manda
// esse link pelo Resend. Do lado do cliente o comportamento é idêntico:
// nunca revela se o e-mail existe ou não, mesma mensagem sempre. Quem
// clica no link volta pro app com uma sessão de recuperação — App.jsx
// detecta o evento 'PASSWORD_RECOVERY' do Supabase Auth e mostra a tela
// RedefinirSenha.jsx antes de liberar qualquer outra coisa.
export default function Home({ onCadastro }) {
  const [modo, setModo] = useState('login') // login | recuperar
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [mostrarSenha, setMostrarSenha] = useState(false)
  const [erro, setErro] = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [recuperarEnviado, setRecuperarEnviado] = useState(false)

  async function entrar(e) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha })
    if (error) setErro(error.message)
    setCarregando(false)
  }

  async function recuperarSenha(e) {
    e.preventDefault()
    setErro(null)
    setCarregando(true)
    const { error } = await supabase.functions.invoke('send-email', {
      body: { tipo: 'recuperar_senha', para: email, redirectTo: window.location.origin },
    })
    if (error) setErro(error.message)
    else setRecuperarEnviado(true)
    setCarregando(false)
  }

  function voltarParaLogin() {
    setErro(null)
    setRecuperarEnviado(false)
    setModo('login')
  }

  return (
    <div className="tela-central tela-login-rv">
      {/* Logo horizontal oficial da RV Invictus, com a assinatura "Consultoria
          e Gestão de Processos" — mesma versão já usada na Ficha de Cadastro
          e na sidebar interna, dourada sobre fundo escuro (combinação
          PREFERENCIAL do manual da marca). Estava divergindo pra versão só
          vertical (sem a assinatura); restaurada aqui pra manter a mesma
          logo em todo ponto de entrada do sistema. */}
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      {modo === 'recuperar' ? (
        <form className="card-login login-sem-painel login-card-centralizado" onSubmit={recuperarSenha}>
          <h1 className="login-titulo">Recuperar senha</h1>
          {recuperarEnviado ? (
            <>
              <p className="login-subtitulo">Se esse e-mail estiver cadastrado, enviamos um link de redefinição.</p>
              <button type="button" className="btn-outline login-botao-cadastro" onClick={voltarParaLogin}>Voltar para o login</button>
            </>
          ) : (
            <>
              <label className="login-rotulo" htmlFor="email-recuperar">E-mail</label>
              <div className="login-campo">
                <IconMail size={18} />
                <input id="email-recuperar" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              {erro && <div className="erro">{erro}</div>}
              <button type="submit" className="login-botao-entrar" disabled={carregando}>
                <IconLogin2 size={18} /> {carregando ? 'Enviando...' : 'Enviar link'}
              </button>
              <button type="button" className="voltar" onClick={voltarParaLogin}>← Voltar para o login</button>
            </>
          )}
        </form>
      ) : (
        <form className="card-login login-sem-painel login-card-centralizado" onSubmit={entrar}>
          <label className="login-rotulo" htmlFor="email-login">E-mail</label>
          <div className="login-campo">
            <IconMail size={18} />
            <input id="email-login" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>

          <div className="login-linha-rotulo">
            <label className="login-rotulo" htmlFor="senha-login">Senha</label>
            <button type="button" className="login-esqueci" onClick={() => { setErro(null); setModo('recuperar') }}>Esqueci minha senha</button>
          </div>
          <div className="login-campo login-campo-senha">
            <IconLock size={18} />
            <input id="senha-login" type={mostrarSenha ? 'text' : 'password'} placeholder="Digite sua senha" value={senha} onChange={(e) => setSenha(e.target.value)} required />
            <button
              type="button"
              className="login-botao-olho"
              onClick={() => setMostrarSenha((v) => !v)}
              aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
            >
              {mostrarSenha ? <IconEyeOff size={18} /> : <IconEye size={18} />}
            </button>
          </div>

          {erro && <div className="erro">{erro}</div>}

          <button type="submit" className="login-botao-entrar" disabled={carregando}>
            <IconLogin2 size={18} /> {carregando ? 'Entrando...' : 'Entrar'}
          </button>

          <div className="login-divisor">Novo por aqui?</div>
          <button type="button" className="btn-outline login-botao-cadastro" onClick={onCadastro}>Realizar cadastro</button>
        </form>
      )}

      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
