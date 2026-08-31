import { supabase } from '../lib/supabase'

// Bloqueio de tela cheia mostrado quando o RV Master suspende o acesso de
// um cliente (marina/escola) inteiro — ver TelaRvMaster.jsx (botão
// "Suspender acesso") e lib/rvMaster.js (alternarSuspensaoTenant, grava em
// marina.marinas.status). Diferente de AplicacaoNaoContratada (que é "essa
// aplicação não faz parte do plano"), aqui é "o cliente inteiro está
// suspenso" — vale pra QUALQUER aplicação e pra equipe E clientes finais
// desse tenant, então é checado uma vez só em App.jsx, antes de decidir
// entre a área da equipe e a área do cliente.
//
// Mesma linguagem visual de AplicacaoEmConstrucao/AplicacaoNaoContratada
// (.tela-central.tela-login-rv + .em-construcao-bloco) — não é uma tela
// nova de verdade, só reaproveita o "aviso de bloqueio" que já existe.
export default function AcessoSuspenso() {
  return (
    <div className="tela-central tela-login-rv">
      <img
        src="/rv-invictus-logo-dourado.png"
        alt="RV Invictus — Consultoria e Gestão de Processos"
        className="login-rv-logo"
      />

      <div className="em-construcao-bloco">
        <p className="em-construcao-app">Acesso suspenso</p>
        <p className="em-construcao-aviso">O acesso deste cliente está temporariamente suspenso</p>
        <p className="dica" style={{ maxWidth: 320, textAlign: 'center', margin: '4px auto 0' }}>
          Fale com a RV Invictus para regularizar e reativar o acesso.
        </p>
        <button type="button" className="nav-voltar em-construcao-voltar" onClick={() => supabase.auth.signOut()}>
          Sair
        </button>
      </div>

      <footer className="login-rv-footer">
        <a className="login-rv-rodape" href="https://rvinvictus.com.br" target="_blank" rel="noopener noreferrer">Developed by RVinvictus.com.br</a>
      </footer>
    </div>
  )
}
