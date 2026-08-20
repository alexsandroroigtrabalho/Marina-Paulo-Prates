import { IconClipboardList, IconCalendarEvent, IconAnchor, IconTool, IconFileCertificate } from '@tabler/icons-react'

const CARDS = [
  { chave: 'clientes', Icone: IconClipboardList, titulo: 'Planilha de cadastros', desc: 'Todos os cadastros por matrícula, pagamento e total arrecadado.' },
  { chave: 'vagas', Icone: IconAnchor, titulo: 'Vagas / Agenda do dia', desc: 'Veja quem está agendado, com barco e horário.' },
  { chave: 'financeiro', Icone: IconClipboardList, titulo: 'Financeiro', desc: 'Cobranças, mensalidades e status de pagamento.' },
  { chave: 'manutencao', Icone: IconTool, titulo: 'Manutenção', desc: 'Ordens de serviço das embarcações.' },
  { chave: 'documentacao', Icone: IconFileCertificate, titulo: 'Documentação / Despachos', desc: 'Vencimentos, laudos técnicos e regularização na Capitania.' },
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
