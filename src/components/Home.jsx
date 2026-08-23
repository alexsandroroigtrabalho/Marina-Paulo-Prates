import { IconUser, IconShieldLock } from '@tabler/icons-react'

export default function Home({ nomeMarina, onEscolherCliente, onEscolherAdmin }) {
  return (
    <div className="landing tela-login-rv">
      {/* Versão dourada do logo — combinação "fundo escuro + logo dourado" é a
          PREFERENCIAL no manual da marca, e é a que mantém boa legibilidade
          sobre o azul-petróleo da tela de login (ver .tela-login-rv no CSS). */}
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />
      <div className="landing-conteudo">
        <h1>{nomeMarina}</h1>
        <p className="subtitulo">Agenda de lançamento de barcos e jet skis</p>
        <div className="acoes">
          <button className="btn-primario" onClick={onEscolherCliente}>
            <IconUser size={18} /> Sou cliente
          </button>
          <button className="btn-outline" onClick={onEscolherAdmin}>
            <IconShieldLock size={18} /> Administração
          </button>
        </div>
      </div>
      <p className="login-rv-rodape">Desenvolvido por RV Invictus</p>
    </div>
  )
}
