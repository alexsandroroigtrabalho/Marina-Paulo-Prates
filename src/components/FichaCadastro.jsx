import { useState } from 'react'
import { supabase, db } from '../lib/supabase'
import { maskCpf } from '../lib/mascaras'

// Cadastro inicial: cria a CONTA de acesso à plataforma RV Invictus, e nada
// além disso. Só nome, CPF, e-mail (com confirmação) e senha (com
// confirmação).
//
// Os dados específicos de cada aplicação passaram a ser pedidos dentro da
// própria aplicação, quando fizerem falta — não mais aqui. O motivo é que
// este formulário atende as 7 aplicações, e exigir de antemão os dados de
// uma delas barrava quem vinha pelas outras: alguém que quer abrir um
// processo no RV NautDoc não tem, necessariamente, uma embarcação atracada
// pra informar. Por isso saíram daqui telefone, documento de identidade,
// endereço e embarcações — tudo isso é do RV Marine e agora é completado
// dentro dele (ver "Minha conta" no painel do cliente).
//
// A linha em `clientes` continua sendo criada aqui, só que com os campos
// básicos; os demais ficam nulos até serem completados. É o que mantém o
// painel do cliente funcionando exatamente como antes — ele encontra o
// cliente por `user_id` e já lida com campos vazios.
export default function FichaCadastro({ onVoltar }) {
  const [form, setForm] = useState({
    nome: '', cpf: '', email: '', confirmarEmail: '', senha: '', confirmarSenha: '',
  })
  const [enviando, setEnviando] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const [erro, setErro] = useState(null)

  function validar() {
    if (form.email.trim().toLowerCase() !== form.confirmarEmail.trim().toLowerCase()) {
      return 'Os e-mails não coincidem.'
    }
    if (form.senha !== form.confirmarSenha) {
      return 'As senhas não coincidem.'
    }
    if (form.senha.length < 6) {
      return 'A senha precisa ter pelo menos 6 caracteres.'
    }
    return null
  }

  async function concluirCadastro(e) {
    e.preventDefault()
    setErro(null)

    const problema = validar()
    if (problema) { setErro(problema); return }

    setEnviando(true)
    try {
      const email = form.email.trim()
      // `options.data.nome` alimenta o gatilho que cria marina.perfis
      // (criar_perfil, em auth.users) — é assim que o nome fica registrado
      // no perfil da plataforma, não só na linha de cliente.
      const { data, error } = await supabase.auth.signUp({
        email,
        password: form.senha,
        options: { data: { nome: form.nome.trim() } },
      })
      if (error) throw error

      const marinaId = import.meta.env.VITE_MARINA_ID // marina padrão configurada no .env
      const { error: erroCliente } = await db.from('clientes').insert({
        marina_id: marinaId,
        user_id: data.user?.id,
        nome: form.nome.trim(),
        email,
        cpf_cnpj: form.cpf.trim(),
      })
      if (erroCliente) throw erroCliente

      // Se o Supabase já devolveu sessão (confirmação de e-mail desligada),
      // o usuário JÁ ESTÁ LOGADO: não faz sentido mostrar uma tela de
      // "cadastro enviado" e pedir que ele volte e entre de novo. O App.jsx
      // percebe a sessão nova sozinho e leva direto pra seleção de
      // aplicações. A tela de aviso abaixo só aparece no outro caso, em que
      // ainda falta confirmar o e-mail antes de conseguir entrar.
      if (!data.session) setConcluido(true)
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
          <h1 className="login-titulo">Conta criada!</h1>
          <p className="login-subtitulo">Sua conta foi criada. Confirme o e-mail que enviamos para entrar na plataforma.</p>
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
        <h1 className="login-titulo cadastro-titulo">Criar conta</h1>

        <input placeholder="Nome completo" autoComplete="name" required
          value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
        <input placeholder="CPF" inputMode="numeric" required maxLength={14}
          value={form.cpf} onChange={(e) => setForm({ ...form, cpf: maskCpf(e.target.value) })} />

        <input type="email" placeholder="E-mail" autoComplete="email" required
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input type="email" placeholder="Confirmar e-mail" autoComplete="email" required
          value={form.confirmarEmail} onChange={(e) => setForm({ ...form, confirmarEmail: e.target.value })} />

        <input type="password" placeholder="Crie uma senha" autoComplete="new-password" minLength={6} required
          value={form.senha} onChange={(e) => setForm({ ...form, senha: e.target.value })} />
        <input type="password" placeholder="Confirmar senha" autoComplete="new-password" minLength={6} required
          value={form.confirmarSenha} onChange={(e) => setForm({ ...form, confirmarSenha: e.target.value })} />

        {erro && <div className="erro">{erro}</div>}
        <button type="submit" disabled={enviando}>{enviando ? 'Enviando...' : 'Criar conta'}</button>
        <button type="button" className="voltar" onClick={onVoltar}>← Voltar</button>
      </form>
      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
