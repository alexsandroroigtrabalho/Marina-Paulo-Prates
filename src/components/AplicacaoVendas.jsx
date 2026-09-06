import { IconArrowLeft, IconCheck } from '@tabler/icons-react'
import { nomeCompleto, ICONES_APLICACAO, DESCRICOES_APLICACAO, RECURSOS_APLICACAO } from '../lib/apps'

// Página de vendas mostrada pro CLIENTE quando ele escolhe, na seleção de
// aplicações, uma que ainda não existe ("Em construção") OU que já existe
// mas não faz parte do plano contratado da própria marina/escola — pedido
// do Alex (06/09/2026): "vamos criar uma página de vendas dentro das
// aplicações não contratadas ou ainda não construídas". Mesma página nos
// dois casos (decisão explícita do Alex, sem distinguir "não existe" de
// "existe mas não é sua") — AplicacaoEmConstrucao.jsx e
// AplicacaoNaoContratada.jsx (mantidos por compatibilidade dos dois pontos
// de uso em App.jsx) agora só repassam pra este componente.
//
// Mesma linguagem visual da tela de seleção (fundo azul-petróleo + losangos,
// logo dourada, rodapé) — o cliente continua "na entrada do sistema".
export default function AplicacaoVendas({ app, onVoltar }) {
  const Icone = ICONES_APLICACAO[app.chave]
  const recursos = RECURSOS_APLICACAO[app.chave]

  return (
    <div className="tela-central tela-login-rv tela-em-construcao">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      <div className="em-construcao-bloco aplicacao-vendas-bloco">
        {Icone && (
          <span className="selecao-app-item-icone aplicacao-vendas-icone"><Icone size={26} stroke={1} /></span>
        )}
        <p className="em-construcao-app">{nomeCompleto(app)}</p>
        <p className="em-construcao-aviso">{DESCRICOES_APLICACAO[app.chave]}</p>

        {recursos && (
          <ul className="aplicacao-vendas-recursos">
            {recursos.map((recurso) => (
              <li key={recurso}>
                <IconCheck size={14} stroke={2} />
                <span>{recurso}</span>
              </li>
            ))}
          </ul>
        )}

        <a
          className="btn-primario aplicacao-vendas-cta"
          href="https://rvinvictus.com.br"
          target="_blank"
          rel="noopener noreferrer"
        >
          Fale Conosco
        </a>

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
