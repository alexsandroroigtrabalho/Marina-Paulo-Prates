import { APLICACOES } from '../lib/apps'
import {
  IconAnchor, IconFileText, IconSchool, IconRuler2, IconTool, IconBoxMultiple, IconCoin,
} from '@tabler/icons-react'

// Tela que o cliente vê logo depois do login, antes de entrar em qualquer
// aplicação: Login → Seleção de aplicações → Aplicação escolhida.
//
// É um SELETOR, não um painel: não mostra dado nenhum, não resume nada — só
// a marca e a lista de aplicações. A linguagem visual é a mesma da tela de
// login (fundo azul-petróleo com a trama de losangos, logo dourada no topo,
// rodapé preto ônix com a hairline dourada): reaproveita as classes
// .tela-login-rv / .login-rv-logo / .login-rv-footer já existentes.
//
// Antes disto era uma lista de 7 barras idênticas (só "RV + NOME" em caixa
// alta), sem nada que diferenciasse uma aplicação da outra — lia como uma
// lista de configuração inacabada, não como um seletor de verdade (feedback
// direto do Alex: "ainda está com aspecto de desorganização"). Agora cada
// aplicação ganha um ÍCONE próprio (referência imediata do que ela faz) e
// uma descrição de uma linha — a mesma diferença entre uma lista de nomes e
// uma tela inicial de aplicativos. A grade de 2 colunas (.selecao-apps)
// também ajuda: 7 blocos quadrados em duas colunas fecham numa mancha
// compacta e organizada; a mesma lista numa coluna só vira uma parede de
// barras compridas, que é exatamente a sensação de desorganização
// reportada.
const ICONES = {
  marine: IconAnchor,
  nautdoc: IconFileText,
  enautica: IconSchool,
  enge: IconRuler2,
  manut: IconTool,
  stock: IconBoxMultiple,
  finance: IconCoin,
}

// Uma linha curta por aplicação, só pra dar contexto (o que ela faz), não
// pra repetir o nome. Fica junto da lista de aplicações (não em apps.js)
// porque é um texto só desta tela — apps.js é a fonte única usada também
// pelo menu do administrador, que não precisa desta descrição.
// Todas no singular (pedido do Alex) — "documentos"/"projetos"/"ordens"/
// "cobranças" no plural soavam como se cada aplicação lidasse com uma
// COLEÇÃO de itens, quando a ideia é nomear a ÁREA/processo que ela cobre,
// no singular, igual "Gestão de marina" e "Escola náutica" já estavam.
const DESCRICOES = {
  marine: 'Gestão de marina',
  nautdoc: 'Documento e regularização',
  enautica: 'Escola náutica',
  enge: 'Engenharia e projeto',
  manut: 'Ordem de serviço',
  stock: 'Estoque e inventário',
  finance: 'Financeiro e cobrança',
}

export default function SelecaoAplicacoes({ onSelecionar }) {
  return (
    // "tela-selecao-apps" (além das classes já usadas no login/cadastro) só
    // pra fixar o rodapé nesta tela específica (ver .tela-selecao-apps
    // .login-rv-footer no index.css) — as outras telas com
    // .tela-login-rv (Home, FichaCadastro) precisam do rodapé rolando
    // junto do conteúdo, então essa mudança não pode ir na classe
    // compartilhada.
    <div className="tela-central tela-login-rv tela-selecao-apps">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      {/* Envolve a grade num wrapper que ocupa o espaço INTEIRO entre a logo
          e o rodapé (flex:1) e centraliza o conteúdo dentro dele mesmo
          (align-items/justify-content:center) — antes a grade centralizava
          com margin:auto direto no <nav>, mas o rodapé virou position:fixed
          (fora do fluxo), então sobrava só a logo como "vizinho" no fluxo
          flex e a centralização por margem automática não batia mais com o
          espaço realmente livre na tela, deixando a grade mais pra baixo
          do que devia. Este wrapper mede o espaço certo (min-height:0 pra
          não travar o scroll em telas baixas com muitas aplicações) e
          centraliza ali dentro, sem depender de auto-margin. */}
      <div className="selecao-apps-meio">
        <nav className="selecao-apps">
          {APLICACOES.map(({ chave, prefixo, nome }) => {
            const Icone = ICONES[chave]
            return (
              <button
                key={chave}
                type="button"
                className="selecao-app-item"
                onClick={(e) => { e.currentTarget.blur(); onSelecionar(chave) }}
              >
                {/* stroke 1 (era 1.5, depois 1.25 — ainda "espesso" pro Alex) —
                    1 é o traço mais fino que o tabler-icons oferece sem
                    quebrar o desenho do ícone; mais fino que isso some no
                    tamanho pequeno do selo (22px). */}
                <span className="selecao-app-item-icone"><Icone size={22} stroke={1} /></span>
                <span className="selecao-app-item-nome">{prefixo} {nome}</span>
                <span className="selecao-app-item-desc">{DESCRICOES[chave]}</span>
              </button>
            )
          })}
        </nav>
      </div>

      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
