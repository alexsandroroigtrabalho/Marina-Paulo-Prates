import { useEffect, useState } from 'react'
import { IconAnchor, IconLogout } from '@tabler/icons-react'
import { supabase, db } from '../lib/supabase'

export default function TelaClienteDashboard({ perfil }) {
  const [cliente, setCliente] = useState(null)
  const [reservas, setReservas] = useState([])
  const [cobrancas, setCobrancas] = useState([])

  useEffect(() => {
    async function carregar() {
      const { data: cli } = await db.from('clientes').select('*').eq('user_id', perfil.id).maybeSingle()
      setCliente(cli)
      if (!cli) return
      const { data: res } = await db.from('reservas').select('*, vagas(codigo)').eq('cliente_id', cli.id)
      setReservas(res || [])
      const { data: cob } = await db.from('cobrancas').select('*').eq('cliente_id', cli.id)
      setCobrancas(cob || [])
    }
    carregar()
  }, [perfil])

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: 24 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--cor-primaria)' }}>
          <IconAnchor /> <strong>Minha marina</strong>
        </div>
        <button className="nav-item" style={{ color: 'var(--cor-primaria)' }} onClick={() => supabase.auth.signOut()}>
          <IconLogout size={16} /> Sair
        </button>
      </header>

      {!cliente && <p>Seu cadastro ainda está em análise pela administração da marina.</p>}

      {cliente && (
        <>
          <h2>Olá, {cliente.nome}</h2>
          <p style={{ color: cliente.status === 'ativo' ? 'var(--cor-secundaria)' : 'var(--cor-alerta)' }}>
            Status: {cliente.status}
          </p>

          <h3>Minhas reservas</h3>
          <div className="lista-cards">
            {reservas.length === 0 && <p className="dica">Nenhuma reserva ainda.</p>}
            {reservas.map((r) => (
              <div key={r.id} className="cliente-card">
                <div className="linha"><b>Vaga:</b> {r.vagas?.codigo}</div>
                <div className="linha"><b>Início:</b> {r.data_inicio}</div>
                <span className={`status-texto ${r.status === 'confirmada' ? 'em-dia' : 'pendente'}`}>{r.status}</span>
              </div>
            ))}
          </div>

          <h3>Minhas cobranças</h3>
          <div className="lista-cards">
            {cobrancas.length === 0 && <p className="dica">Nenhuma cobrança ainda.</p>}
            {cobrancas.map((c) => (
              <div key={c.id} className="cliente-card">
                <div className="linha"><b>{c.descricao}</b></div>
                <div className="linha">Vencimento: {c.vencimento} — R$ {Number(c.valor).toFixed(2)}</div>
                <span className={`status-texto ${c.status === 'pago' ? 'em-dia' : 'pendente'}`}>
                  {c.status === 'pago' ? 'Pagamento em dia' : 'Pagamento pendente'}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
