import { useEffect, useState } from 'react'
import { salvarCliente } from '../lib/db'
import { maskCpf, maskTelefone } from '../lib/mascaras'

// Edição de um cliente já cadastrado, pelo Painel de Controle do
// Administrador (TelaClientes.jsx → botão "Editar" em cada card). Mesmos
// campos do formulário de "Adicionar cliente" (mesma tela), só que
// pré-preenchidos e salvos com update (salvarCliente com `id` já grava como
// UPDATE — ver lib/db.js) em vez de criar um cadastro novo.
//
// Diferente da edição pelo próprio cliente (TelaClienteDashboard.jsx →
// "Minha conta"): aqui é a policy "admin_marina_clientes" (FOR ALL) que
// autoriza a gravação, então TODOS os campos cadastrais ficam livres pro
// administrador — inclusive os que o trigger "protege_campos_admin_clientes"
// bloqueia quando é o próprio cliente tentando (esse trigger só age quando
// quem está logado não é admin/funcionario/operador, ver
// migration_cliente_edita_proprios_dados.sql).
//
// Só os campos administrativos/financeiros (cadastro_confirmado,
// acesso_suspenso, pagamento_confirmado etc.) ficam de fora deste form de
// propósito — continuam com seus próprios controles dedicados no card do
// cliente (botão "Suspender/Reativar acesso" etc.), pra não duplicar ação em
// dois lugares.
const CAMPOS_VAZIOS = { nome: '', email: '', telefone: '', cpf_cnpj: '', documento_identidade: '', endereco: '', observacoes: '' }

export default function EditarClienteModal({ cliente, onFechar, onSalvo }) {
  const [form, setForm] = useState(CAMPOS_VAZIOS)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  // Recarrega o formulário a cada abertura (troca de `cliente`) — evita que
  // o form de um cliente vaze pro próximo se o administrador abrir "Editar"
  // em dois cards seguidos sem fechar o modal antes.
  useEffect(() => {
    if (!cliente) return
    setForm({
      nome: cliente.nome || '',
      email: cliente.email || '',
      telefone: cliente.telefone || '',
      cpf_cnpj: cliente.cpf_cnpj || '',
      documento_identidade: cliente.documento_identidade || '',
      endereco: cliente.endereco || '',
      observacoes: cliente.observacoes || '',
    })
    setErro('')
  }, [cliente])

  async function salvar(e) {
    e.preventDefault()
    if (!form.nome.trim()) {
      setErro('Informe o nome do cliente.')
      return
    }
    setSalvando(true)
    setErro('')
    try {
      // Só os campos deste form vão no update — mantém intactos todos os
      // outros (marina_id, status de acesso/pagamento, embarcações etc.),
      // evitando o risco (citado no pedido de validação) de um salvamento
      // parcial apagar algo que já estava preenchido.
      await salvarCliente({ id: cliente.id, ...form })
      onSalvo?.()
      onFechar()
    } catch (err) {
      setErro('Não foi possível salvar as alterações: ' + err.message)
    } finally {
      setSalvando(false)
    }
  }

  if (!cliente) return null

  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 460 }}>
        <h3 style={{ marginTop: 0 }}>Editar cliente</h3>
        <form className="form-vertical" onSubmit={salvar}>
          <label>
            Nome
            <input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
          </label>
          <label>
            E-mail
            <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label>
            Telefone
            <input inputMode="numeric" maxLength={15} value={form.telefone}
              onChange={(e) => setForm({ ...form, telefone: maskTelefone(e.target.value) })} />
          </label>
          <label>
            CPF
            <input inputMode="numeric" maxLength={14} value={form.cpf_cnpj}
              onChange={(e) => setForm({ ...form, cpf_cnpj: maskCpf(e.target.value) })} />
          </label>
          <label>
            Nº da Carteira de Habilitação de Amador (CHA)
            <input value={form.documento_identidade}
              onChange={(e) => setForm({ ...form, documento_identidade: e.target.value })} />
          </label>
          <label>
            Endereço completo
            <input value={form.endereco} onChange={(e) => setForm({ ...form, endereco: e.target.value })} />
          </label>
          <label>
            Observações
            <input value={form.observacoes} onChange={(e) => setForm({ ...form, observacoes: e.target.value })} />
          </label>

          {erro && <p className="dica" style={{ color: 'var(--cor-alerta)', fontWeight: 600 }}>{erro}</p>}

          <div className="acoes-modal">
            <button type="button" onClick={onFechar} disabled={salvando}>Cancelar</button>
            <button type="submit" disabled={salvando}>{salvando ? 'Salvando...' : 'Salvar alterações'}</button>
          </div>
        </form>
      </div>
    </div>
  )
}
