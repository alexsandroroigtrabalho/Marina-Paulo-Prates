// Configuração da "Agenda da rampa" — horário de funcionamento, intervalo
// fixo entre solicitações e períodos de manutenção — tudo guardado em
// marinas.config_json (mesmo padrão dos apitos/mensalidade/etc., ver
// lib/db.js → buscarMarina/atualizarConfigMarina). Centralizado aqui porque
// tanto o Painel de Controle (Configurações → aba Agenda, onde o
// administrador edita) quanto o painel do cliente (onde o horário
// escolhido tem que respeitar essas mesmas regras) precisam da mesma
// lógica — pra nunca dessincronizar qual horário está disponível.
export const RAMPA_PADRAO = {
  abertura: '08:00',
  fechamento: '18:00',
  intervaloMinutos: 15,
  manutencoes: [],
  mensagemManutencao: 'Rampa em manutenção',
  mensagemProblema: 'Em caso de problema, aguarde',
}

// Lê a configuração da rampa a partir do registro da marina (o mesmo objeto
// que `buscarMarina` retorna), com os valores padrão pra quem ainda não
// configurou nada.
export function lerConfigRampa(marina) {
  const cfg = marina?.config_json || {}
  return {
    abertura: cfg.rampaAbertura || RAMPA_PADRAO.abertura,
    fechamento: cfg.rampaFechamento || RAMPA_PADRAO.fechamento,
    intervaloMinutos: Number(cfg.rampaIntervaloMinutos) || RAMPA_PADRAO.intervaloMinutos,
    manutencoes: Array.isArray(cfg.rampaManutencoes) ? cfg.rampaManutencoes : RAMPA_PADRAO.manutencoes,
    mensagemManutencao: cfg.rampaMensagemManutencao || RAMPA_PADRAO.mensagemManutencao,
    mensagemProblema: cfg.rampaMensagemProblema || RAMPA_PADRAO.mensagemProblema,
  }
}

// Uma data (string "YYYY-MM-DD") cai dentro de algum período de manutenção
// cadastrado? — usado pra decidir se mostra o aviso de manutenção mesmo
// antes do cliente escolher um horário específico.
export function diaTemManutencao(configRampa, dataYMD) {
  if (!dataYMD) return false
  const inicioDia = new Date(`${dataYMD}T00:00:00`)
  const fimDia = new Date(`${dataYMD}T23:59:59`)
  return configRampa.manutencoes.some((per) => {
    if (!per.inicio || !per.fim) return false
    return new Date(per.fim) > inicioDia && new Date(per.inicio) < fimDia
  })
}

// Gera os horários (strings "HH:mm") disponíveis pra uma data, respeitando:
// horário de funcionamento da rampa, o intervalo fixo entre solicitações
// (padrão 15min, configurável) e as manutenções programadas. Se a data for
// hoje, também tira os horários que já passaram. É esta função que faz o
// cliente nunca conseguir selecionar um horário indisponível — a lista de
// opções do seletor vem direto daqui, então não tem como escolher fora dela.
export function horariosDisponiveis(configRampa, dataYMD) {
  if (!dataYMD) return []
  const [hIni, mIni] = configRampa.abertura.split(':').map(Number)
  const [hFim, mFim] = configRampa.fechamento.split(':').map(Number)
  const inicioMin = hIni * 60 + mIni
  const fimMin = hFim * 60 + mFim
  const passo = Math.max(5, Number(configRampa.intervaloMinutos) || 15)

  const agora = new Date()
  const ehHoje = dataYMD === `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}-${String(agora.getDate()).padStart(2, '0')}`
  const agoraMin = agora.getHours() * 60 + agora.getMinutes()

  const horarios = []
  for (let min = inicioMin; min < fimMin; min += passo) {
    if (ehHoje && min <= agoraMin) continue
    const horaTexto = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`
    const candidato = new Date(`${dataYMD}T${horaTexto}`)
    const emManutencao = configRampa.manutencoes.some((per) => {
      if (!per.inicio || !per.fim) return false
      return candidato >= new Date(per.inicio) && candidato < new Date(per.fim)
    })
    if (emManutencao) continue
    horarios.push(horaTexto)
  }
  return horarios
}
