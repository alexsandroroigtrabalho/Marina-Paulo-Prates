// supabase/functions/send-email/index.ts
// Resend email sender — adaptado do padrão RV Invictus para a marina.
// Env: RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM = 'Marina Manager <noreply@seudominio.com>' // ← adapte para seu domínio verificado no Resend
const PORTAL_URL = 'https://seusite.com.br'             // ← adapte para a URL do seu sistema

// Consulta direta ao PostgREST (mesmo padrão do supabase/functions/payment),
// usando a service role — roda só no servidor, nunca é exposta ao navegador.
// As tabelas do app vivem no schema "marina" (não "public"), por isso os
// headers Accept-Profile/Content-Profile em toda chamada abaixo.
async function sbFetch(path: string, method = 'GET', body?: any) {
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      'Accept-Profile': 'marina',
      'Content-Profile': 'marina',
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

function paraBase64(texto: string) {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  bytes.forEach((b) => { binario += String.fromCharCode(b) })
  return btoa(binario)
}

// Situação de um documento (mesma regra usada na tela Documentação):
// vencido (dias < 0) ou "vence em N dia(s)" (0 a 30). Só entram aqui
// documentos que já passaram pelo filtro data_validade <= hoje+30.
function situacaoDocumento(dataValidade: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const validade = new Date(dataValidade)
  const dias = Math.round((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  return dias < 0 ? `Vencido há ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`
}

// Monta a planilha (CSV ; com BOM, mesmo padrão usado na exportação do
// Financeiro) de documentos vencidos ou a vencer em até 30 dias para uma
// marina, e dispara por e-mail via Resend com o CSV em anexo. Se não houver
// nenhum documento nessa situação: no envio manual (forcarEnvio truthy)
// manda um e-mail avisando que está tudo em dia; no envio automático (cron)
// não manda nada, pra não gerar e-mail vazio todo dia.
async function enviarRelatorioDocumentos(RESEND_API_KEY: string, marinaId: string, forcarEnvio: boolean) {
  const marinas = await sbFetch(`marinas?id=eq.${marinaId}&select=id,nome,config_json`)
  const marinaData = Array.isArray(marinas) ? marinas[0] : null
  if (!marinaData) throw new Error('Marina não encontrada')

  const emailDestino = marinaData.config_json?.emailRelatorioDocumentos
  if (!emailDestino) {
    if (forcarEnvio) throw new Error('Configure um e-mail de destino antes de enviar o relatório.')
    return { marina_id: marinaId, enviado: false, motivo: 'sem e-mail configurado' }
  }

  const limite = new Date()
  limite.setDate(limite.getDate() + 30)
  const limiteIso = limite.toISOString().slice(0, 10)

  const docs = await sbFetch(
    `documentos_embarcacao?marina_id=eq.${marinaId}&data_validade=lte.${limiteIso}` +
    `&select=tipo,numero_documento,data_validade,embarcacoes(nome,clientes(nome))&order=data_validade.asc`
  )
  const linhas: any[] = Array.isArray(docs) ? docs : []

  if (linhas.length === 0 && !forcarEnvio) {
    return { marina_id: marinaId, enviado: false, motivo: 'nenhum documento vencido ou a vencer' }
  }

  const nomeMarina = marinaData.nome || 'Marina'
  let anexos: any[] | undefined
  let descricaoResumo: string

  if (linhas.length === 0) {
    descricaoResumo = 'Nenhum documento vencido ou a vencer nos próximos 30 dias. Tudo em dia! ✅'
  } else {
    const cabecalho = ['Cliente', 'Embarcação', 'Tipo de documento', 'Nº do documento', 'Validade', 'Situação']
    const linhasCsv = linhas.map((d) => [
      d.embarcacoes?.clientes?.nome || '', d.embarcacoes?.nome || '',
      String(d.tipo || '').replace('_', ' '), d.numero_documento || '',
      d.data_validade || '', situacaoDocumento(d.data_validade),
    ])
    const csv = '\uFEFF' + [cabecalho, ...linhasCsv].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const nomeArquivo = `relatorio-documentos-${nomeMarina.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    anexos = [{ filename: nomeArquivo, content: paraBase64(csv) }]
    descricaoResumo = `${linhas.length} documento(s) vencido(s) ou a vencer nos próximos 30 dias. A planilha completa está em anexo.`
  }

  const html = card(`Relatório de documentos — ${nomeMarina}`, descricaoResumo)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [emailDestino], subject: `Relatório de documentos vencidos/a vencer — ${nomeMarina}`, html,
      ...(anexos ? { attachments: anexos } : {}),
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `Resend error ${res.status}`)

  // Guarda quando foi o último envio, pra mostrar na tela de Documentação.
  await sbFetch(`marinas?id=eq.${marinaId}`, 'PATCH', {
    config_json: { ...(marinaData.config_json || {}), ultimoEnvioRelatorioDocumentos: new Date().toISOString() },
  })

  return { marina_id: marinaId, enviado: true, documentos: linhas.length }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurado')

    const { tipo, para, nome, descricao, marina_id } = await req.json()

    // Relatório de documentos: tela "Despachos" manda marina_id (botão
    // "Enviar relatório agora" → força o envio mesmo se estiver tudo em
    // dia). O agendamento diário (Cron da Edge Function) chama sem
    // marina_id: aí roda para todas as marinas que já configuraram um
    // e-mail de destino, e pula silenciosamente quem não tem nada vencendo.
    if (tipo === 'relatorio_documentos') {
      if (marina_id) {
        const resultado = await enviarRelatorioDocumentos(RESEND_API_KEY, marina_id, true)
        return json(resultado)
      }
      const todasMarinas = await sbFetch(`marinas?select=id,config_json`)
      const lista: any[] = Array.isArray(todasMarinas) ? todasMarinas : []
      const comEmail = lista.filter((m) => m.config_json?.emailRelatorioDocumentos)
      const resultados = []
      for (const m of comEmail) {
        try {
          resultados.push(await enviarRelatorioDocumentos(RESEND_API_KEY, m.id, false))
        } catch (err) {
          resultados.push({ marina_id: m.id, enviado: false, erro: err instanceof Error ? err.message : String(err) })
        }
      }
      return json({ processadas: resultados.length, resultados })
    }

    let subject: string
    let html: string

    if (tipo === 'boas_vindas') {
      subject = `Bem-vindo(a) à marina!`
      html = card(`Olá, ${nome}! 🎉`, `Sua conta foi criada com sucesso. Acesse com o e-mail <strong>${para}</strong>.`)
    } else if (tipo === 'pagamento_confirmado') {
      subject = `Pagamento confirmado`
      html = card(`Olá, ${nome}!`, `Recebemos o pagamento referente a: <strong>${descricao}</strong>. Obrigado!`)
    } else if (tipo === 'cobranca') {
      subject = `Cobrança pendente`
      html = card(`Olá, ${nome}!`, `Você tem uma cobrança pendente: <strong>${descricao}</strong>. Acesse o portal para regularizar.`)
    } else if (tipo === 'os_concluida') {
      subject = `Serviço concluído`
      html = card(`Olá, ${nome}!`, `O serviço "<strong>${descricao}</strong>" foi concluído.`)
    } else {
      throw new Error(`Tipo de e-mail inválido: ${tipo}`)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [para], subject, html }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data?.message || `Resend error ${res.status}`)
    return json({ id: data.id })
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

function card(titulo: string, corpo: string) {
  return `
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="color:#0A2756">${titulo}</h2>
  <p>${corpo}</p>
  <a href="${PORTAL_URL}" style="display:inline-block;padding:12px 28px;background:#0A2756;
     color:#fff;text-decoration:none;border-radius:6px;font-weight:600">
    Acessar →
  </a>
</div>`
}

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
