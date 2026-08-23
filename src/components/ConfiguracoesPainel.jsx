import { useState } from 'react'
import { exportarClientesCsv, exportarManutencaoCsv, exportarDespachosCsv, exportarHistoricoManobrasCsv } from '../lib/exportarPlanilha'

// Todas as configurações do sistema, centralizadas aqui dentro do Painel de
// Controle (antes espalhadas em: engrenagem do Painel de Controle — aviso
// sonoro, apitos, combustíveis — e um bloco fixo na aba Despachos —
// relatório automático de documentos). Organizadas por categoria, igual
// pedido pela administração. Toda a alteração é gravada em
// marinas.config_json — inclusive o aviso sonoro (chave `avisoSonoroAtivado`,
// ligado por padrão) — e já é a mesma fonte que as outras telas leem; não
// existe uma cópia separada do valor em nenhum outro lugar, então não tem
// como dessincronizar.
//
// Só administradores podem alterar (perfil.role === 'admin') — funcionário/
// operador conseguem ABRIR e VER esta tela (útil pra conferir o que está
// configurado), mas os campos ficam desabilitados e aparece um aviso. Isso
// espelha a restrição já aplicada no banco (policy "admin_atualiza_propria_marina",
// FOR UPDATE, só libera pra role = 'admin') — mesmo que alguém tentasse
// contornar a tela, o banco recusaria a escrita.
const CATEGORIAS = [
  { chave: 'financeiro', label: 'Financeiro' },
  { chave: 'notificacoes', label: 'Notificações' },
  { chave: 'despacho', label: 'Despacho' },
  { chave: 'clientes', label: 'Clientes' },
  { chave: 'manutencao', label: 'Manutenção' },
  { chave: 'agenda', label: 'Agenda' },
  { chave: 'acessos', label: 'Acessos' },
]

export default function ConfiguracoesPainel({
  aberto, onFechar, ehAdmin, marinaId,
  // Financeiro — mensalidade
  formMensalidade, onMudarMensalidade, onSalvarMensalidade, salvandoMensalidade,
  // Financeiro — combustíveis
  combustiveis, formCombustivel, onMudarFormCombustivel, onSalvarNovoCombustivel, onAtualizarCampoCombustivel,
  // Notificações — aviso sonoro + apitos
  sonsAtivados, onAlternarSons, salvandoAvisoSonoro, formApitos, onMudarApitos, onSalvarApitos, salvandoApitos,
  // Despacho — relatório automático de documentos
  emailRelatorio, onMudarEmailRelatorio, onSalvarEmailRelatorio, salvandoEmailRelatorio,
  ultimoEnvioRelatorio, onEnviarRelatorioAgora, enviandoRelatorio, mensagemRelatorio,
}) {
  const [categoria, setCategoria] = useState('financeiro')
  const [exportando, setExportando] = useState('')
  const [mensagemExportacao, setMensagemExportacao] = useState('')

  function mudarCategoria(c) {
    setCategoria(c)
    setMensagemExportacao('')
  }

  async function exportar(fn, chave, rotulo) {
    setExportando(chave)
    setMensagemExportacao('')
    try {
      await fn(marinaId)
      setMensagemExportacao(`Planilha de ${rotulo} baixada com sucesso.`)
    } catch (err) {
      alert('Não foi possível exportar a planilha: ' + err.message)
    } finally {
      setExportando('')
    }
  }

  if (!aberto) return null

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '85vh', overflowY: 'auto', maxWidth: 720 }}>
        <h3 style={{ marginTop: 0 }}>Configurações do sistema</h3>

        {!ehAdmin && (
          <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>
            Somente administradores podem alterar estas configurações. Você pode conferir os valores atuais, mas os campos abaixo estão desabilitados para o seu perfil.
          </p>
        )}

        <div className="abas" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
          {CATEGORIAS.map((c) => (
            <button key={c.chave} type="button" className={categoria === c.chave ? 'ativo' : ''} onClick={() => mudarCategoria(c.chave)}>
              {c.label}
            </button>
          ))}
        </div>

        {categoria === 'financeiro' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Valor da mensalidade</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Valor de referência da mensalidade da marina, usado como padrão em todo o sistema.
              </p>
              <form className="form-inline" onSubmit={onSalvarMensalidade}>
                <input
                  type="number" min="0" step="0.01" required placeholder="Valor (R$)" style={{ maxWidth: 160 }}
                  value={formMensalidade} onChange={(e) => onMudarMensalidade(e.target.value)}
                  disabled={!ehAdmin}
                />
                <button type="submit" disabled={!ehAdmin || salvandoMensalidade}>
                  {salvandoMensalidade ? 'Salvando…' : 'Salvar'}
                </button>
              </form>
            </div>

            <div>
              <strong>Combustíveis (preço e estoque)</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Usados no pedido de abastecimento feito pelo cliente pelo app — mesmos valores da aba Abastecimento.
              </p>
              <form className="form-inline" onSubmit={onSalvarNovoCombustivel} style={{ marginBottom: 10 }}>
                <input required placeholder="Nome (ex: Gasolina, Diesel Marítimo)" value={formCombustivel.nome}
                  disabled={!ehAdmin}
                  onChange={(e) => onMudarFormCombustivel({ ...formCombustivel, nome: e.target.value })} />
                <input required type="number" step="0.01" placeholder="Preço por litro (R$)" value={formCombustivel.preco_litro}
                  disabled={!ehAdmin}
                  onChange={(e) => onMudarFormCombustivel({ ...formCombustivel, preco_litro: e.target.value })} />
                <input required type="number" step="0.01" placeholder="Estoque (litros)" value={formCombustivel.estoque_litros}
                  disabled={!ehAdmin}
                  onChange={(e) => onMudarFormCombustivel({ ...formCombustivel, estoque_litros: e.target.value })} />
                <button type="submit" disabled={!ehAdmin}>+ Adicionar combustível</button>
              </form>
              <table className="tabela">
                <thead><tr><th>Combustível</th><th>Preço/litro</th><th>Estoque (L)</th><th>Ativo</th></tr></thead>
                <tbody>
                  {combustiveis.length === 0 && <tr><td colSpan={4}>Nenhum combustível cadastrado ainda.</td></tr>}
                  {combustiveis.map((c) => (
                    <tr key={c.id}>
                      <td>{c.nome}</td>
                      <td>
                        <input type="number" step="0.01" defaultValue={c.preco_litro} style={{ width: 90 }} disabled={!ehAdmin}
                          onBlur={(e) => Number(e.target.value) !== Number(c.preco_litro) && onAtualizarCampoCombustivel(c, 'preco_litro', e.target.value)} />
                      </td>
                      <td>
                        <input type="number" step="0.01" defaultValue={c.estoque_litros} style={{ width: 90 }} disabled={!ehAdmin}
                          onBlur={(e) => Number(e.target.value) !== Number(c.estoque_litros) && onAtualizarCampoCombustivel(c, 'estoque_litros', e.target.value)} />
                      </td>
                      <td>
                        <label className="toggle">
                          <input type="checkbox" checked={c.ativo} disabled={!ehAdmin}
                            onChange={(e) => onAtualizarCampoCombustivel(c, 'ativo', e.target.checked)} />
                          <span className="trilho" />
                        </label>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {categoria === 'notificacoes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Aviso sonoro do Painel de Controle</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Apito ao chegar uma nova notificação de descida/subida na Fila de Rampa. Vem <b>ligado por padrão</b>{' '}
                para todos os usuários. Somente o administrador pode desativar ou reativar — a alteração é salva e
                aplicada imediatamente em todo o sistema, para todos os perfis conectados.
              </p>
              <button type="button" onClick={onAlternarSons} disabled={!ehAdmin || salvandoAvisoSonoro}>
                {salvandoAvisoSonoro ? 'Salvando…' : sonsAtivados ? '🔕 Desabilitar aviso sonoro' : '🔔 Habilitar aviso sonoro'}
              </button>
            </div>

            <div>
              <strong>Apitos por manobra</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Quantas vezes o sinal sonoro toca ao confirmar cada manobra na Fila de Rampa. Vale para toda a equipe.
              </p>
              <form className="form-vertical" onSubmit={onSalvarApitos} style={{ maxWidth: 320 }}>
                <label>
                  Apitos na saída (descida)
                  <input required type="number" min={1} step={1} value={formApitos.descida} disabled={!ehAdmin}
                    onChange={(e) => onMudarApitos({ ...formApitos, descida: e.target.value })} />
                </label>
                <label>
                  Apitos na chegada (retorno)
                  <input required type="number" min={1} step={1} value={formApitos.retorno} disabled={!ehAdmin}
                    onChange={(e) => onMudarApitos({ ...formApitos, retorno: e.target.value })} />
                </label>
                <button type="submit" disabled={!ehAdmin || salvandoApitos} style={{ alignSelf: 'flex-start' }}>
                  {salvandoApitos ? 'Salvando…' : 'Salvar'}
                </button>
              </form>
            </div>
          </div>
        )}

        {categoria === 'despacho' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <strong>Relatório automático de documentos vencidos</strong>
              <p className="dica" style={{ margin: '4px 0 14px' }}>
                Todo dia o sistema confere quem está com TIE, seguro, habilitação do condutor ou vistoria vencidos (ou
                vencendo em até 1 mês) e envia uma planilha para o e-mail cadastrado abaixo.
              </p>
              <form className="form-inline" onSubmit={onSalvarEmailRelatorio} style={{ marginBottom: 8 }}>
                <input
                  type="email" required placeholder="e-mail@exemplo.com" style={{ minWidth: 240 }} disabled={!ehAdmin}
                  value={emailRelatorio} onChange={(e) => onMudarEmailRelatorio(e.target.value)}
                />
                <button type="submit" disabled={!ehAdmin || salvandoEmailRelatorio}>{salvandoEmailRelatorio ? 'Salvando…' : 'Salvar e-mail'}</button>
                <button type="button" onClick={onEnviarRelatorioAgora} disabled={!ehAdmin || enviandoRelatorio || !emailRelatorio}>
                  {enviandoRelatorio ? 'Enviando…' : 'Enviar relatório agora'}
                </button>
              </form>
              <p className="dica" style={{ margin: 0 }}>
                {ultimoEnvioRelatorio ? `Último envio: ${new Date(ultimoEnvioRelatorio).toLocaleString('pt-BR')}` : 'Ainda não foi enviado nenhum relatório para este e-mail.'}
              </p>
              {mensagemRelatorio && <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemRelatorio}</p>}
            </div>

            <div>
              <strong>Exportar planilha de despacho</strong>
              <p className="dica" style={{ margin: '4px 0 10px' }}>
                Baixa uma planilha com todos os dados de despacho, completos e atualizados.
              </p>
              <button type="button" onClick={() => exportar(exportarDespachosCsv, 'despacho', 'despacho')} disabled={exportando === 'despacho'}>
                {exportando === 'despacho' ? 'Exportando…' : 'Exportar planilha de despacho'}
              </button>
              {mensagemExportacao && exportando === '' && (
                <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
              )}
            </div>
          </div>
        )}

        {categoria === 'clientes' && (
          <div>
            <strong>Exportar planilha de clientes</strong>
            <p className="dica" style={{ margin: '4px 0 10px' }}>
              Baixa uma planilha com todos os dados de clientes cadastrados, completos e atualizados.
            </p>
            <button type="button" onClick={() => exportar(exportarClientesCsv, 'clientes', 'clientes')} disabled={exportando === 'clientes'}>
              {exportando === 'clientes' ? 'Exportando…' : 'Exportar planilha de clientes'}
            </button>
            {mensagemExportacao && exportando === '' && (
              <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
            )}
          </div>
        )}
        {categoria === 'manutencao' && (
          <div>
            <strong>Exportar planilha de manutenção</strong>
            <p className="dica" style={{ margin: '4px 0 10px' }}>
              Baixa uma planilha com todos os dados de manutenção, completos e atualizados.
            </p>
            <button type="button" onClick={() => exportar(exportarManutencaoCsv, 'manutencao', 'manutenção')} disabled={exportando === 'manutencao'}>
              {exportando === 'manutencao' ? 'Exportando…' : 'Exportar planilha de manutenção'}
            </button>
            {mensagemExportacao && exportando === '' && (
              <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
            )}
          </div>
        )}
        {categoria === 'agenda' && (
          <div>
            <strong>Exportar histórico de manobras</strong>
            <p className="dica" style={{ margin: '4px 0 10px' }}>
              Baixa uma planilha com o histórico de manobras (descidas e subidas já confirmadas) disponível no
              momento, com cliente, embarcação ou jet, tipo de manobra, data e horário.
            </p>
            <button type="button" onClick={() => exportar(exportarHistoricoManobrasCsv, 'historico_manobras', 'histórico de manobras')} disabled={exportando === 'historico_manobras'}>
              {exportando === 'historico_manobras' ? 'Exportando…' : 'Exportar histórico de manobras'}
            </button>
            {mensagemExportacao && exportando === '' && (
              <p className="dica" style={{ margin: '8px 0 0', fontWeight: 600 }}>{mensagemExportacao}</p>
            )}
          </div>
        )}
        {categoria === 'acessos' && (
          <p className="dica">
            Somente o perfil <b>Administrador</b> pode alterar qualquer configuração desta tela — vale tanto na
            interface quanto no banco de dados (funcionário e operador não conseguem gravar mudanças aqui mesmo
            chamando a API diretamente).
          </p>
        )}

        <div className="acoes-modal" style={{ marginTop: 20 }}>
          <button type="button" onClick={onFechar}>Fechar</button>
        </div>
      </div>
    </div>
  )
}
