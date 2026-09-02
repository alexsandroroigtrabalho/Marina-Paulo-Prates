import { useEffect, useState } from 'react'
import { buscarMarina, buscarCliente } from '../lib/db'
import { labelHabilitacao } from '../lib/enautica'
import { MODELOS_DOCUMENTO, abrirDocumento, baixarZipDocumentosAluno } from '../lib/enauticaDocumentos'

// Botão "Documentos" da aba Aprovadas (TelaMatriculasENautica.jsx) — a
// funcionalidade que o Alex pediu como fundamental: gerar, a partir do
// cadastro já preenchido pelo aluno na matrícula, os 4 documentos que a
// escola leva à Capitania dos Portos, sem precisar digitar tudo de novo à
// mão pra cada aluno. Mesmo conjunto de documentos do rsnautica (a
// referência operacional), ver lib/enauticaDocumentos.js. "Baixar tudo
// (.zip)" no rodapé é o mesmo botão do modal equivalente de lá.
export default function ModalDocumentosAluno({ matricula, onFechar }) {
  const [marina, setMarina] = useState(null)
  const [cliente, setCliente] = useState(null)
  const [carregando, setCarregando] = useState(true)
  const [baixandoZip, setBaixandoZip] = useState(false)

  useEffect(() => {
    if (!matricula) return
    setCarregando(true)
    // A matrícula (listarMatriculasAprovadas) só traz nome/email do cliente
    // — os campos de documento (CPF, RG, endereço etc.) moram em
    // marina.clientes mas não vêm nesse select; buscamos a linha completa
    // só quando o modal abre, pra não pesar a listagem principal.
    Promise.all([buscarMarina(matricula.marina_id), buscarCliente(matricula.cliente_id)])
      .then(([m, c]) => { setMarina(m); setCliente(c); setCarregando(false) })
  }, [matricula])

  if (!matricula) return null

  const docConfig = marina?.config_json?.documentos || {}

  async function baixarZip() {
    setBaixandoZip(true)
    try {
      await baixarZipDocumentosAluno({ ...cliente, __habilitacao: matricula.habilitacao }, marina, docConfig, labelHabilitacao)
    } catch (err) {
      alert('Não foi possível gerar o .zip: ' + err.message)
    } finally {
      setBaixandoZip(false)
    }
  }

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 480 }}>
        <h3 style={{ marginTop: 0 }}>Documentos — {matricula.clientes?.nome || cliente?.nome || 'aluno'}</h3>
        <p className="dica" style={{ margin: '0 0 12px' }}>
          Cada botão abre o documento pronto numa aba nova, já preenchido — use "Imprimir" (Ctrl+P) e escolha "Salvar como PDF".
          Confira os dados antes de protocolar: são modelos operacionais, não têm validade jurídica garantida.
        </p>
        {carregando && <p className="dica">Carregando dados da escola…</p>}
        {!carregando && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MODELOS_DOCUMENTO.map((modelo) => (
              <button key={modelo.chave} type="button" className="botao-secundario"
                onClick={() => abrirDocumento(modelo, { ...cliente, __habilitacao: matricula.habilitacao }, marina, docConfig, labelHabilitacao)}>
                {modelo.titulo}
              </button>
            ))}
          </div>
        )}
        <div className="acoes-modal">
          <button type="button" onClick={onFechar}>Fechar</button>
          <button type="button" disabled={carregando || baixandoZip} onClick={baixarZip}>
            {baixandoZip ? 'Gerando .zip…' : 'Baixar tudo (.zip)'}
          </button>
        </div>
      </div>
    </div>
  )
}
