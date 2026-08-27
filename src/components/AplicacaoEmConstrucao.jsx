import { IconArrowLeft } from '@tabler/icons-react'
import { nomeCompleto } from '../lib/apps'

// O que o CLIENTE vê ao escolher, na tela de seleção, uma aplicação que
// ainda não foi desenvolvida (todas menos o RV Marine — ver `pronta` em
// lib/apps.js). Equivalente ao que o administrador já vê no lugar do
// conteúdo quando escolhe uma dessas aplicações no menu lateral, só que sem
// o shell/sidebar da área interna, que o cliente não tem.
//
// Mesma linguagem da tela de seleção (fundo azul-petróleo, logo dourada,
// rodapé) pra não introduzir um terceiro visual: o cliente continua
// claramente "na entrada do sistema", com um caminho óbvio de volta.
export default function AplicacaoEmConstrucao({ app, onVoltar }) {
  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      <div className="em-construcao-bloco">
        <p className="em-construcao-app">{nomeCompleto(app)}</p>
        <p className="em-construcao-aviso">Em construção</p>
        <button type="button" className="nav-voltar em-construcao-voltar" onClick={onVoltar}>
          <IconArrowLeft size={14} /> Aplicações
        </button>
      </div>

      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
