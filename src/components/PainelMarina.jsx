import { IconClipboardList, IconTool, IconFileCertificate, IconGasStation } from '@tabler/icons-react'

const CARDS = [
  { chave: 'clientes', Icone: IconClipboardList, titulo: 'Planilha de cadastros', desc: 'Todos os cadastros por matrícula, pagamento e total arrecadado.' },
  { chave: 'financeiro', Icone: IconClipboardList, titulo: 'Financeiro', desc: 'Cobranças, mensalidades e status de pagamento.' },
  { chave: 'manutencao', Icone: IconTool, titulo: 'Manutenção', desc: 'Ordens de serviço das embarcações.' },
  { chave: 'documentacao', Icone: IconFileCertificate, titulo: 'Documentação / Despachos', desc: 'Vencimentos, laudos técnicos e regularização na Capitania.' },
  { chave: 'abastecimento', Icone: IconGasStation, titulo: 'Abastecimento', desc: 'Estoque, preço por litro e pedidos de abastecimento dos clientes.' },
]

export default function PainelMarina({ irPara }) {
  return (
    <div>
      <p style={{ color: 'var(--cor-texto-suave)', marginTop: 0 }}>Escolha uma área para gerenciar a marina.</p>
      <div className="painel-grid">
        {CARDS.map(({ chave, Icone, titulo, desc }) => (
          <button key={chave} className="painel-card" onClick={() => irPara(chave)}>
            <Icone className="icone" size={28} stroke={1.5} />
            <div>
              <strong>{titulo}</strong>
              <span>{desc}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
