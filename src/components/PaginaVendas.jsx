import { IconCheck } from '@tabler/icons-react'
import { nomeCompleto, ICONES_APLICACAO, DESCRICOES_APLICACAO, RECURSOS_APLICACAO } from '../lib/apps'

// Página de vendas mostrada no lugar da marca d'água (PaginaMarcaDagua.jsx)
// quando a equipe escolhe, no menu lateral, uma aplicação que ainda não
// existe ("Em construção") OU que já existe mas não faz parte do plano
// contratado da marina — pedido do Alex (06/09/2026): "vamos criar uma
// página de vendas dentro das aplicações não contratadas ou ainda não
// construídas". Mesma página nos dois casos (decisão explícita do Alex: só
// uma versão, sem distinguir "não existe" de "existe mas não é sua") —
// quem chama (App.jsx) só passa a aplicação, sem dizer qual dos dois
// motivos é.
//
// Ícone, tagline e lista de recursos vêm de lib/apps.js (ICONES_APLICACAO /
// DESCRICOES_APLICACAO / RECURSOS_APLICACAO) — a mesma fonte usada no
// seletor de aplicações, pra nunca divergir de lá. Uma aplicação sem
// entrada em RECURSOS_APLICACAO (hoje: só marine/enautica, que já vêm
// prontas e contratadas) cai pro texto genérico em vez de quebrar.
export default function PaginaVendas({ app }) {
  const Icone = ICONES_APLICACAO[app.chave]
  const recursos = RECURSOS_APLICACAO[app.chave]

  return (
    <div className="pagina-vendas">
      <div className="pagina-vendas-card">
        {Icone && (
          <span className="pagina-vendas-icone"><Icone size={26} stroke={1} /></span>
        )}
        <h2 className="pagina-vendas-titulo">{nomeCompleto(app)}</h2>
        <p className="pagina-vendas-tagline">{DESCRICOES_APLICACAO[app.chave]}</p>

        {recursos ? (
          <ul className="pagina-vendas-recursos">
            {recursos.map((recurso) => (
              <li key={recurso}>
                <IconCheck size={15} stroke={2} />
                <span>{recurso}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pagina-vendas-aviso">Esta aplicação ainda não está disponível.</p>
        )}

        <p className="pagina-vendas-cta-texto">
          Agende uma demonstração com a RV Invictus.
        </p>
        <a
          className="btn-primario pagina-vendas-cta"
          href="https://rvinvictus.com.br"
          target="_blank"
          rel="noopener noreferrer"
        >
          Fale Conosco
        </a>
      </div>
    </div>
  )
}
