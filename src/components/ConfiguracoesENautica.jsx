import { useEffect, useState } from 'react'
import { buscarMarina, atualizarConfigMarina } from '../lib/db'
import { MODULOS_AULA, extrairYoutubeId } from '../lib/enautica'

// Configurações do RV e-Náutica, mesmo padrão de ConfiguracoesPainel.jsx (RV
// Marine): abas por categoria, tudo gravado em marina.marinas.config_json —
// abre via engrenagem no cabeçalho (ver TelaMatriculasENautica.jsx/onAcoes),
// só admin edita de verdade (funcionário/operador só consultam, campos
// desabilitados — mesma regra e mesmo motivo do RV Marine: a policy
// "admin_atualiza_propria_marina" no banco só libera UPDATE de
// marina.marinas pra role='admin', então mesmo contornando a tela o banco
// recusaria a escrita).
//
// Duas categorias:
//   - Aulas preparatórias (config_json.aulas): vídeo de cada uma das 3
//     aulas. Sem isso preenchido, a aba do aluno nunca mostra vídeo nenhum.
//   - Documentos (config_json.documentos): dados institucionais da escola
//     que entram nos 4 documentos gerados por aluno (ver
//     lib/enauticaDocumentos.js e o botão "Documentos" na aba Aprovadas de
//     TelaMatriculasENautica.jsx) — CNPJ e responsável técnico não têm
//     coluna própria em marina.marinas (só nome/email/telefone/endereco),
//     por isso ficam aqui dentro do config_json, mesmo mecanismo já usado
//     pra "aulas".
const CATEGORIAS = [
  { chave: 'aulas', label: 'Aulas preparatórias' },
  { chave: 'documentos', label: 'Documentos' },
]

const DOC_CAMPOS_VAZIOS = {
  cnpj: '', responsavelNome: '', responsavelCargo: '', responsavelCpf: '', instrutorNome: '', instrutorCpf: '',
  // Usados só na Lista de Alunos para Aulas Práticas (agenda → aula
  // prática → botão "Lista de alunos"): o rsnautica tem esses dois valores
  // fixos no código ("TRAMANDAÍ" / "Agência da Capitania dos Portos em
  // Tramandaí") porque só atende uma cidade — a RV Invictus atende mais de
  // uma escola/marina, então isso precisa ser configurável por escola.
  municipio: '', capitania: '',
}

export default function ConfiguracoesENautica({ aberto, onFechar, ehAdmin, marinaId }) {
  const [categoria, setCategoria] = useState('aulas')
  const [formAulas, setFormAulas] = useState(() => MODULOS_AULA.map((m) => ({ id: m.id, valor: '' })))
  const [formDocumentos, setFormDocumentos] = useState(DOC_CAMPOS_VAZIOS)
  const [salvando, setSalvando] = useState(false)
  const [mensagem, setMensagem] = useState('')

  async function carregar() {
    if (!marinaId) return
    const marina = await buscarMarina(marinaId)
    const overridesAulas = marina?.config_json?.aulas || []
    setFormAulas(MODULOS_AULA.map((m) => ({ id: m.id, valor: overridesAulas.find((o) => o.id === m.id)?.youtubeId || '' })))
    setFormDocumentos({ ...DOC_CAMPOS_VAZIOS, ...(marina?.config_json?.documentos || {}) })
    setMensagem('')
  }
  useEffect(() => { if (aberto) carregar() }, [aberto, marinaId])

  function mudarCampoAula(id, valor) {
    setFormAulas((f) => f.map((c) => (c.id === id ? { ...c, valor } : c)))
  }

  function mudarCategoria(c) {
    setCategoria(c)
    setMensagem('')
  }

  async function salvarAulas(e) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')
    try {
      // Extrai o ID de cada campo na hora de salvar (não a cada tecla) —
      // assim o admin pode colar a URL inteira e ver ela normal no campo
      // até confirmar; só o que vai pro banco é o ID puro.
      const aulas = formAulas
        .map((c) => ({ id: c.id, youtubeId: extrairYoutubeId(c.valor) }))
        .filter((c) => c.youtubeId)
      await atualizarConfigMarina(marinaId, { aulas })
      setMensagem('Vídeos das aulas preparatórias salvos com sucesso.')
    } catch (err) {
      setMensagem('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  async function salvarDocumentos(e) {
    e.preventDefault()
    setSalvando(true)
    setMensagem('')
    try {
      await atualizarConfigMarina(marinaId, { documentos: formDocumentos })
      setMensagem('Dados dos documentos salvos com sucesso.')
    } catch (err) {
      setMensagem('Não foi possível salvar: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (!aberto) return null

  return (
    <div className="modal-fundo configuracoes-modal-dourado" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', maxWidth: 560 }}>
        <h3 style={{ marginTop: 0 }}>Configurações do e-Náutica</h3>

        {!ehAdmin && (
          <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>
            Somente administradores podem alterar estas configurações. Você pode conferir os valores atuais, mas os campos abaixo estão desabilitados para o seu perfil.
          </p>
        )}

        <div className="abas" style={{ marginBottom: 16 }}>
          {CATEGORIAS.map((c) => (
            <button key={c.chave} type="button" className={categoria === c.chave ? 'ativo' : ''} onClick={() => mudarCategoria(c.chave)}>
              {c.label}
            </button>
          ))}
        </div>

        {categoria === 'aulas' && (
          <form onSubmit={salvarAulas} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="dica" style={{ margin: '0 0 12px' }}>
                Cole o link (ou só o ID) do vídeo do YouTube de cada aula. Sem link, o aluno vê "Conteúdo em preparação pela escola" no lugar.
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {MODULOS_AULA.map((m) => (
                  <label key={m.id}>
                    {m.titulo} — {m.desc}
                    <input
                      type="text" placeholder="https://youtube.com/watch?v=..." disabled={!ehAdmin}
                      value={formAulas.find((c) => c.id === m.id)?.valor || ''}
                      onChange={(e) => mudarCampoAula(m.id, e.target.value)}
                    />
                  </label>
                ))}
              </div>
            </div>
            {mensagem && <p className="dica" style={{ margin: 0, fontWeight: 600 }}>{mensagem}</p>}
            <div className="acoes-modal">
              <button type="button" onClick={onFechar}>Fechar</button>
              <button type="submit" disabled={!ehAdmin || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}

        {categoria === 'documentos' && (
          <form onSubmit={salvarDocumentos} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <p className="dica" style={{ margin: '0 0 12px' }}>
                Esses dados entram automaticamente nos 4 documentos gerados para cada aluno aprovado (Requerimento, Declaração de Residência, Atestado de Treinamento e Procuração — botão "Documentos" na aba Aprovadas de Matrículas) e na Lista de Alunos para Aulas Práticas (botão na Agenda, em compromissos do tipo "Aula prática").
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label>
                  CNPJ da escola
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.cnpj}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, cnpj: e.target.value })} />
                </label>
                <label>
                  Nome do responsável técnico
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.responsavelNome}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, responsavelNome: e.target.value })} />
                </label>
                <label>
                  Cargo do responsável técnico
                  <input type="text" placeholder="Ex: Diretor técnico" disabled={!ehAdmin} value={formDocumentos.responsavelCargo}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, responsavelCargo: e.target.value })} />
                </label>
                <label>
                  CPF do responsável técnico
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.responsavelCpf}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, responsavelCpf: e.target.value })} />
                </label>
                <label>
                  Nome do instrutor
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.instrutorNome}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, instrutorNome: e.target.value })} />
                </label>
                <label>
                  CPF do instrutor
                  <input type="text" disabled={!ehAdmin} value={formDocumentos.instrutorCpf}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, instrutorCpf: e.target.value })} />
                </label>
                <label>
                  Município (para a Lista de Alunos de aulas práticas)
                  <input type="text" placeholder="Ex: Torres" disabled={!ehAdmin} value={formDocumentos.municipio}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, municipio: e.target.value })} />
                </label>
                <label>
                  Capitania/Agência responsável
                  <input type="text" placeholder="Ex: Agência da Capitania dos Portos em Torres" disabled={!ehAdmin} value={formDocumentos.capitania}
                    onChange={(e) => setFormDocumentos({ ...formDocumentos, capitania: e.target.value })} />
                </label>
              </div>
            </div>
            {mensagem && <p className="dica" style={{ margin: 0, fontWeight: 600 }}>{mensagem}</p>}
            <div className="acoes-modal">
              <button type="button" onClick={onFechar}>Fechar</button>
              <button type="submit" disabled={!ehAdmin || salvando}>{salvando ? 'Salvando…' : 'Salvar'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
