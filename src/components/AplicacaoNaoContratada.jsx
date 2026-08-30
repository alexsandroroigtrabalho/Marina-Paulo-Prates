import { IconArrowLeft } from '@tabler/icons-react'
import { nomeCompleto } from '../lib/apps'

// O que o CLIENTE vê ao escolher uma aplicação que EXISTE e já está pronta,
// mas que não faz parte do contrato da própria marina/escola —
// `apps_contratados` em marina.marinas. Diferente de AplicacaoEmConstrucao
// (que é "ainda não existe"), esta é "existe, mas não é sua" — mostrada de
// propósito, não escondida: a lista de aplicações continua completa pra
// todo mundo, servindo de vitrine (a pedido explícito), só o acesso de
// verdade é que fica trancado.
//
// Só a RV Master decide quem contratou o quê (trava já existe no banco) —
// por isso o texto aqui aponta pra "fale com a RV Invictus", nunca oferece
// um jeito de o próprio tenant liberar isso sozinho.
export default function AplicacaoNaoContratada({ app, onVoltar }) {
  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      <div className="em-construcao-bloco">
        <p className="em-construcao-app">{nomeCompleto(app)}</p>
        <p className="em-construcao-aviso">Esta aplicação não faz parte do seu plano atual</p>
        <p className="dica" style={{ maxWidth: 320, textAlign: 'center', margin: '4px auto 0' }}>
          Fale com a RV Invictus para contratar o {nomeCompleto(app)}.
        </p>
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
