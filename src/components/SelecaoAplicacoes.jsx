import { APLICACOES } from '../lib/apps'

// Tela que o cliente vê logo depois do login, antes de entrar em qualquer
// aplicação: Login → Seleção de aplicações → Aplicação escolhida.
//
// É um SELETOR, não um painel: não mostra dado nenhum, não resume nada, não
// tem cartão/ícone/contador — só a marca e a lista de aplicações. A
// linguagem visual é a mesma da tela de login (fundo azul-petróleo com a
// trama de losangos, logo dourada no topo, rodapé preto ônix com a hairline
// dourada), porque é o mesmo momento de entrada no sistema: reaproveita as
// classes .tela-login-rv / .login-rv-logo / .login-rv-footer já existentes,
// sem inventar um segundo visual de abertura.
//
// Os nomes usam exatamente o mesmo tratamento do seletor de aplicações do
// menu do administrador (.nav-app-item: "RV" menor e fixo, nome maior que
// cresce no hover, cinza que vira branco-gelo) — a mesma lista, o mesmo
// gesto, nos dois lugares onde se escolhe uma aplicação.
export default function SelecaoAplicacoes({ onSelecionar }) {
  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      <nav className="selecao-apps">
        {APLICACOES.map(({ chave, prefixo, nome }) => (
          <button
            key={chave}
            type="button"
            className="nav-app-item selecao-app-item"
            onClick={(e) => { e.currentTarget.blur(); onSelecionar(chave) }}
          >
            <span className="nav-app-item-prefixo">{prefixo}</span>
            <span className="nav-app-item-nome">{nome}</span>
          </button>
        ))}
      </nav>

      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
