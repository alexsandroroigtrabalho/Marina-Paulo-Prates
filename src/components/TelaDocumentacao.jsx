import { useEffect, useState } from 'react'
import {
  listarEmbarcacoes, listarClientes,
  listarDocumentos, salvarDocumento,
  listarLaudos, atualizarLaudo,
  listarDespachos, criarDespacho, atualizarDespacho,
} from '../lib/db'
import { SERVICOS_DESPACHO, CATEGORIAS_SERVICOS } from '../lib/servicosDespacho'

const TIPOS_DOCUMENTO = ['TIE', 'seguro', 'seguro_obrigatorio', 'habilitacao_condutor', 'vistoria', 'outro']

function diasParaVencer(dataValidade) {
  if (!dataValidade) return null
  const hoje = new Date()
  hoje.setHours(0, 0, 0, 0)
  const validade = new Date(dataValidade)
  return Math.round((validade - hoje) / (1000 * 60 * 60 * 24))
}

function statusVencimento(dataValidade) {
  const dias = diasParaVencer(dataValidade)
  if (dias === null) return { texto: 'Sem validade', classe: '' }
  if (dias < 0) return { texto: `Vencido há ${Math.abs(dias)} dia(s)`, classe: 'status-vencido' }
  if (dias <= 30) return { texto: `Vence em ${dias} dia(s)`, classe: 'status-vencendo' }
  return { texto: 'Em dia', classe: 'status-valido' }
}

export default function TelaDocumentacao({ marinaId }) {
  // Começa sem nenhuma aba ativa: as 3 (Documentos, Laudos técnicos,
  // Despachos (Capitania)) estão temporariamente em construção — ver
  // comentário logo abaixo, nos botões.
  const [aba, setAba] = useState(null) // null | documentos | laudos | despachos
  const [embarcacoes, setEmbarcacoes] = useState([])
  const [clientes, setClientes] = useState([])
  const [documentos, setDocumentos] = useState([])
  const [laudos, setLaudos] = useState([])
  const [despachos, setDespachos] = useState([])

  const [formDoc, setFormDoc] = useState({ embarcacao_id: '', tipo: 'TIE', numero_documento: '', data_emissao: '', data_validade: '' })
  // Mesmo catálogo de serviços que o cliente usa pra pedir um despacho
  // (lib/servicosDespacho.js) — assim um despacho aberto aqui pela equipe
  // usa exatamente os mesmos valores de `tipo` que um pedido feito pelo
  // cliente, em vez de uma lista solta e diferente.
  const [formDespacho, setFormDespacho] = useState({ cliente_id: '', embarcacao_id: '', tipo: SERVICOS_DESPACHO[0].key, numero_protocolo: '', data_protocolo: '' })
  const [salvandoDoc, setSalvandoDoc] = useState(false)
  const [salvandoDespacho, setSalvandoDespacho] = useState(false)

  async function carregar() {
    if (!marinaId) return
    const [e, c, d, l, desp] = await Promise.all([
      listarEmbarcacoes(marinaId), listarClientes(marinaId),
      listarDocumentos(marinaId), listarLaudos(marinaId), listarDespachos(marinaId),
    ])
    setEmbarcacoes(e); setClientes(c); setDocumentos(d); setLaudos(l); setDespachos(desp)
  }

  useEffect(() => { carregar() }, [marinaId])

  async function salvarNovoDocumento(e) {
    e.preventDefault()
    setSalvandoDoc(true)
    try {
      await salvarDocumento({ marina_id: marinaId, ...formDoc })
      setFormDoc({ embarcacao_id: '', tipo: 'TIE', numero_documento: '', data_emissao: '', data_validade: '' })
      await carregar()
    } catch (err) {
      alert('Não foi possível registrar o documento: ' + err.message)
    } finally {
      setSalvandoDoc(false)
    }
  }

  async function abrirNovoDespacho(e) {
    e.preventDefault()
    setSalvandoDespacho(true)
    try {
      await criarDespacho({ marina_id: marinaId, ...formDespacho })
      setFormDespacho({ cliente_id: '', embarcacao_id: '', tipo: SERVICOS_DESPACHO[0].key, numero_protocolo: '', data_protocolo: '' })
      await carregar()
    } catch (err) {
      alert('Não foi possível abrir o despacho: ' + err.message)
    } finally {
      setSalvandoDespacho(false)
    }
  }

  return (
    <div>
      <div className="abas">
        {/* "Documentos", "Laudos técnicos" e "Despachos (Capitania)" — as 3
            desativadas temporariamente a pedido da administração: continuam
            visíveis, no mesmo padrão visual (nunca ficam "ativo", já que
            `aba` nunca passa a valer 'documentos'/'laudos'/'despachos' por
            aqui), mas o clique não navega mais pra nenhuma delas, só avisa
            "Em construção". As telas (JSX mais abaixo, `aba === 'documentos'`
            / `'laudos'` / `'despachos'`) e o carregamento de dados continuam
            intactos, prontos pra reativar — basta trocar o onClick de volta
            pra `() => setAba('documentos')` / `'laudos'` / `'despachos'`. */}
        <button className={aba === 'documentos' ? 'ativo' : ''} onClick={() => alert('Em construção')}>Documentos</button>
        <button className={aba === 'laudos' ? 'ativo' : ''} onClick={() => alert('Em construção')}>Laudos técnicos</button>
        <button className={aba === 'despachos' ? 'ativo' : ''} onClick={() => alert('Em construção')}>Despachos (Capitania)</button>
      </div>

      {!aba && <p className="dica">Em construção.</p>}

      {aba === 'documentos' && (
        <>
          <form className="form-inline" onSubmit={salvarNovoDocumento}>
            <select required value={formDoc.embarcacao_id} onChange={(e) => setFormDoc({ ...formDoc, embarcacao_id: e.target.value })}>
              <option value="">Embarcação</option>
              {embarcacoes.map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <select value={formDoc.tipo} onChange={(e) => setFormDoc({ ...formDoc, tipo: e.target.value })}>
              {TIPOS_DOCUMENTO.map((t) => <option key={t} value={t}>{t.replace('_', ' ')}</option>)}
            </select>
            <input placeholder="Número do documento" value={formDoc.numero_documento} onChange={(e) => setFormDoc({ ...formDoc, numero_documento: e.target.value })} />
            <input type="date" placeholder="Emissão" value={formDoc.data_emissao} onChange={(e) => setFormDoc({ ...formDoc, data_emissao: e.target.value })} />
            <input type="date" required placeholder="Validade" value={formDoc.data_validade} onChange={(e) => setFormDoc({ ...formDoc, data_validade: e.target.value })} />
            <button type="submit" disabled={salvandoDoc}>{salvandoDoc ? 'Salvando...' : '+ Registrar documento'}</button>
          </form>

          <table className="tabela">
            <thead><tr><th>Embarcação</th><th>Cliente</th><th>Tipo</th><th>Nº</th><th>Validade</th><th>Situação</th></tr></thead>
            <tbody>
              {documentos.length === 0 && <tr><td colSpan={6}>Nenhum documento registrado ainda.</td></tr>}
              {documentos.map((d) => {
                const sit = statusVencimento(d.data_validade)
                return (
                  <tr key={d.id}>
                    <td>{d.embarcacoes?.nome}</td>
                    <td>{d.embarcacoes?.clientes?.nome}</td>
                    <td>{d.tipo?.replace('_', ' ')}</td>
                    <td>{d.numero_documento || '-'}</td>
                    <td>{d.data_validade || '-'}</td>
                    <td><span className={`badge ${sit.classe}`}>{sit.texto}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </>
      )}

      {aba === 'laudos' && (
        <>
          <p className="dica">Laudos técnicos de vistoria/avaliação emitidos pela marina (diferencial: engenheiro responsável próprio). O cliente solicita pela área dele; aqui você conduz o atendimento.</p>
          <table className="tabela">
            <thead><tr><th>Embarcação</th><th>Cliente</th><th>Tipo</th><th>Finalidade</th><th>Solicitado em</th><th>Status</th><th>Responsável técnico</th><th></th></tr></thead>
            <tbody>
              {laudos.length === 0 && <tr><td colSpan={8}>Nenhum laudo solicitado ainda.</td></tr>}
              {laudos.map((l) => (
                <tr key={l.id}>
                  <td>{l.embarcacoes?.nome}</td>
                  <td>{l.clientes?.nome}</td>
                  <td>{l.tipo}</td>
                  <td>{l.finalidade || '-'}</td>
                  <td>{l.data_solicitacao ? new Date(l.data_solicitacao).toLocaleDateString('pt-BR') : '-'}</td>
                  <td><span className={`badge status-${l.status}`}>{l.status}</span></td>
                  <td>
                    <input
                      placeholder="Nome / CREA"
                      defaultValue={l.responsavel_tecnico || ''}
                      onBlur={(e) => e.target.value !== (l.responsavel_tecnico || '') && atualizarLaudo(l.id, { responsavel_tecnico: e.target.value }).then(carregar).catch((err) => alert('Não foi possível salvar o responsável técnico: ' + err.message))}
                    />
                  </td>
                  <td>
                    {l.status !== 'emitido' && l.status !== 'cancelado' && (
                      <select value={l.status} onChange={(e) => {
                        const patch = { status: e.target.value }
                        if (e.target.value === 'emitido') patch.data_emissao = new Date().toISOString()
                        atualizarLaudo(l.id, patch).then(carregar).catch((err) => alert('Não foi possível atualizar o laudo: ' + err.message))
                      }}>
                        <option value="solicitado">Solicitado</option>
                        <option value="agendado">Agendado</option>
                        <option value="em_andamento">Em andamento</option>
                        <option value="emitido">Emitido</option>
                        <option value="cancelado">Cancelado</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {aba === 'despachos' && (
        <>
          <p className="dica">Acompanhamento de regularização junto à Capitania dos Portos (registro, transferência, baixa, renovação de TIE).</p>
          <p className="dica" style={{ marginTop: -8, marginBottom: 20 }}>
            O e-mail do relatório automático de documentos vencidos foi movido para <b>Painel de Controle → engrenagem de Configurações → Despacho</b>.
          </p>

          <form className="form-inline" onSubmit={abrirNovoDespacho}>
            <select required value={formDespacho.cliente_id} onChange={(e) => setFormDespacho({ ...formDespacho, cliente_id: e.target.value })}>
              <option value="">Cliente</option>
              {clientes.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <select value={formDespacho.embarcacao_id} onChange={(e) => setFormDespacho({ ...formDespacho, embarcacao_id: e.target.value })}>
              <option value="">Embarcação (opcional)</option>
              {embarcacoes.filter((e) => e.cliente_id === formDespacho.cliente_id).map((e) => <option key={e.id} value={e.id}>{e.nome}</option>)}
            </select>
            <select value={formDespacho.tipo} onChange={(e) => setFormDespacho({ ...formDespacho, tipo: e.target.value })}>
              {CATEGORIAS_SERVICOS.map((cat) => (
                <optgroup key={cat.key} label={cat.titulo}>
                  {SERVICOS_DESPACHO.filter((s) => s.categoria === cat.key).map((s) => (
                    <option key={s.key} value={s.key}>{s.titulo}</option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input placeholder="Nº protocolo (opcional)" value={formDespacho.numero_protocolo} onChange={(e) => setFormDespacho({ ...formDespacho, numero_protocolo: e.target.value })} />
            <input type="date" value={formDespacho.data_protocolo} onChange={(e) => setFormDespacho({ ...formDespacho, data_protocolo: e.target.value })} />
            <button type="submit" disabled={salvandoDespacho}>{salvandoDespacho ? 'Salvando...' : '+ Abrir despacho'}</button>
          </form>

          <table className="tabela">
            <thead><tr><th>Cliente</th><th>Embarcação</th><th>Tipo</th><th>Protocolo</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {despachos.length === 0 && <tr><td colSpan={6}>Nenhum despacho aberto ainda.</td></tr>}
              {despachos.map((d) => (
                <tr key={d.id}>
                  <td>{d.clientes?.nome}</td>
                  <td>{d.embarcacoes?.nome || '-'}</td>
                  <td>{d.tipo?.replace('_', ' ')}</td>
                  <td>{d.numero_protocolo || '-'}</td>
                  <td><span className={`badge status-${d.status}`}>{d.status?.replace('_', ' ')}</span></td>
                  <td>
                    {d.status !== 'concluido' && d.status !== 'indeferido' && (
                      <select value={d.status} onChange={(e) => {
                        const patch = { status: e.target.value }
                        if (e.target.value === 'concluido') patch.data_conclusao = new Date().toISOString().slice(0, 10)
                        atualizarDespacho(d.id, patch).then(carregar).catch((err) => alert('Não foi possível atualizar o despacho: ' + err.message))
                      }}>
                        <option value="protocolado">Protocolado</option>
                        <option value="em_analise">Em análise</option>
                        <option value="exigencia">Exigência</option>
                        <option value="aprovado">Aprovado</option>
                        <option value="indeferido">Indeferido</option>
                        <option value="concluido">Concluído</option>
                      </select>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  )
}
