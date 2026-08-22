// supabase/functions/send-email/index.ts
// Resend email sender — compartilhada entre o RV Invictus (escola nautica,
// identifica por escola_id) e a Marina Manager (identifica por marina_id).
// Um app nao mexe no outro: cada um so entra no seu proprio branch de tipo.
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const FROM = 'RV Invictus <noreply@rvinvictus.com.br>'
const PORTAL_URL = 'https://rvinvictus.com.br'

async function getEscolaConfig(escola_id: string) {
  if (!escola_id) return null
  const url = Deno.env.get('SUPABASE_URL')!
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const res = await fetch(`${url}/rest/v1/escolas?id=eq.${escola_id}&select=nome,config_json`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  })
  const rows = await res.json()
  return rows?.[0] || null
}

function interpolar(texto: string, vars: Record<string, string>) {
  return texto.replace(/\{(\w+)\}/g, (_, k) => vars[k] || '')
}

// deno-lint-ignore no-explicit-any
function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}

/* ============================================================
 * Marina Manager — usa marina_id (nunca escola_id). As tabelas do app
 * vivem no schema "marina" (nao "public"), por isso Accept-Profile /
 * Content-Profile em toda chamada abaixo.
 * ============================================================ */

// deno-lint-ignore no-explicit-any
async function sbFetchMarina(path: string, method = 'GET', body?: any) {
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

// Situacao de um documento: vencido (dias < 0) ou "vence em N dia(s)" (0 a
// 30). So entram aqui documentos ja filtrados por data_validade <= hoje+30.
function situacaoDocumento(dataValidade: string) {
  const hoje = new Date(); hoje.setHours(0, 0, 0, 0)
  const validade = new Date(dataValidade)
  const dias = Math.round((validade.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24))
  return dias < 0 ? `Vencido ha ${Math.abs(dias)} dia(s)` : `Vence em ${dias} dia(s)`
}

function cardMarina(titulo: string, corpo: string) {
  return `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">${titulo}</h2>
  <p style="margin:0 0 20px;line-height:1.6">${corpo}</p>
</div>`
}

// Planilha (CSV ; com BOM) de documentos vencidos ou a vencer em ate 30 dias
// para uma marina, enviada por e-mail via Resend com o CSV em anexo. Sem
// nenhum documento nessa situacao: no envio manual (forcarEnvio truthy)
// manda aviso de "tudo em dia"; no automatico (cron) nao manda nada.
async function enviarRelatorioDocumentos(RESEND_API_KEY: string, marinaId: string, forcarEnvio: boolean) {
  const marinas = await sbFetchMarina(`marinas?id=eq.${marinaId}&select=id,nome,config_json`)
  const marinaData = Array.isArray(marinas) ? marinas[0] : null
  if (!marinaData) throw new Error('Marina nao encontrada')

  const emailDestino = marinaData.config_json?.emailRelatorioDocumentos
  if (!emailDestino) {
    if (forcarEnvio) throw new Error('Configure um e-mail de destino antes de enviar o relatorio.')
    return { marina_id: marinaId, enviado: false, motivo: 'sem e-mail configurado' }
  }

  const limite = new Date()
  limite.setDate(limite.getDate() + 30)
  const limiteIso = limite.toISOString().slice(0, 10)

  const docs = await sbFetchMarina(
    `documentos_embarcacao?marina_id=eq.${marinaId}&data_validade=lte.${limiteIso}` +
    `&select=tipo,numero_documento,data_validade,embarcacoes(nome,clientes(nome))&order=data_validade.asc`
  )
  // deno-lint-ignore no-explicit-any
  const linhas: any[] = Array.isArray(docs) ? docs : []

  if (linhas.length === 0 && !forcarEnvio) {
    return { marina_id: marinaId, enviado: false, motivo: 'nenhum documento vencido ou a vencer' }
  }

  const nomeMarina = marinaData.nome || 'Marina'
  // deno-lint-ignore no-explicit-any
  let anexos: any[] | undefined
  let descricaoResumo: string

  if (linhas.length === 0) {
    descricaoResumo = 'Nenhum documento vencido ou a vencer nos proximos 30 dias. Tudo em dia!'
  } else {
    const cabecalho = ['Cliente', 'Embarcacao', 'Tipo de documento', 'No do documento', 'Validade', 'Situacao']
    const linhasCsv = linhas.map((d) => [
      d.embarcacoes?.clientes?.nome || '', d.embarcacoes?.nome || '',
      String(d.tipo || '').replace('_', ' '), d.numero_documento || '',
      d.data_validade || '', situacaoDocumento(d.data_validade),
    ])
    const csv = '\uFEFF' + [cabecalho, ...linhasCsv].map((l) => l.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(';')).join('\n')
    const nomeArquivo = `relatorio-documentos-${nomeMarina.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().slice(0, 10)}.csv`
    anexos = [{ filename: nomeArquivo, content: paraBase64(csv) }]
    descricaoResumo = `${linhas.length} documento(s) vencido(s) ou a vencer nos proximos 30 dias. A planilha completa esta em anexo.`
  }

  const html = cardMarina(`Relatorio de documentos — ${nomeMarina}`, descricaoResumo)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [emailDestino], subject: `Relatorio de documentos vencidos/a vencer — ${nomeMarina}`, html,
      ...(anexos ? { attachments: anexos } : {}),
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data?.message || `Resend error ${res.status}`)

  await sbFetchMarina(`marinas?id=eq.${marinaId}`, 'PATCH', {
    config_json: { ...(marinaData.config_json || {}), ultimoEnvioRelatorioDocumentos: new Date().toISOString() },
  })

  return { marina_id: marinaId, enviado: true, documentos: linhas.length }
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY nao configurado')

    // deno-lint-ignore no-explicit-any
    const body: Record<string, any> = await req.json()
    const { tipo, para, nome, habilitacao, escola_id, senha, descricao, marina_id } = body

    // Relatorio de documentos da marina: tela "Despachos" manda marina_id
    // (botao "Enviar relatorio agora" -> forca o envio mesmo se estiver tudo
    // em dia). O agendamento diario (Cron da Edge Function) chama sem
    // marina_id: roda para todas as marinas com e-mail configurado.
    if (tipo === 'relatorio_documentos') {
      if (marina_id) {
        const resultado = await enviarRelatorioDocumentos(RESEND_API_KEY, marina_id, true)
        return json(resultado)
      }
      const todasMarinas = await sbFetchMarina(`marinas?select=id,config_json`)
      // deno-lint-ignore no-explicit-any
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

    const escola = await getEscolaConfig(escola_id)
    const nomeEscola  = escola?.nome || 'Escola Nautica'
    const emailEscola = escola?.config_json?.escola?.email || ''
    const telefone    = escola?.config_json?.escola?.telefone || ''
    const linkGrupo   = escola?.config_json?.emails?.linkGrupo || ''
    const emailsCfg   = escola?.config_json?.emails || {}

    const vars: Record<string, string> = {
      nome:            nome || '',
      habilitacao:     habilitacao || '',
      nome_escola:     nomeEscola,
      email_escola:    emailEscola,
      telefone_escola: telefone,
      link_grupo:      linkGrupo,
    }

    let subject: string
    let html: string

    if (tipo === 'boas_vindas') {
      const cfg = emailsCfg?.boasVindas
      subject = cfg?.assunto ? interpolar(cfg.assunto, vars) : `Bem-vindo(a) a ${nomeEscola}! Sua matricula foi confirmada`
      const corpoCustom = cfg?.corpo ? interpolar(cfg.corpo, vars).replace(/\n/g, '<br>') : null
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">Ola, ${nome}!</h2>
  ${corpoCustom ? `<p style="margin:0 0 20px;line-height:1.7">${corpoCustom}</p>` : `<p style="margin:0 0 12px;line-height:1.6">Sua matricula foi confirmada com sucesso na <strong>${nomeEscola}</strong>.</p><p style="margin:0 0 20px;line-height:1.6">Acesse o portal com o e-mail <strong>${para}</strong>. Se ainda nao definiu sua senha, clique em Esqueci minha senha na tela de login.</p>`}
  ${linkGrupo ? `<div style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;padding:14px 18px;margin:0 0 20px"><p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#2E7D32">Grupo da turma no WhatsApp</p><a href="${linkGrupo}" style="color:#1565C0;font-size:13px;word-break:break-all">${linkGrupo}</a></div>` : ''}
  <a href="${PORTAL_URL}?escola=${escola_id || ''}" style="display:inline-block;padding:12px 28px;background:#0A2756;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Acessar meu portal</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="margin:0;font-size:12px;color:#888">${nomeEscola} - Portal powered by RV Invictus</p>
</div>`

    } else if (tipo === 'acesso') {
      subject = `Seu acesso ao portal - ${nomeEscola}`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">Ola, ${nome}!</h2>
  <p style="margin:0 0 12px;line-height:1.6">Seu acesso ao portal do aluno na <strong>${nomeEscola}</strong> foi liberado.</p>
  <div style="background:#F4F8FF;border:1px solid #B5D4F4;border-radius:8px;padding:16px 20px;margin:0 0 20px">
    <p style="margin:0 0 6px;font-size:13px"><strong>E-mail:</strong> ${para}</p>
    ${senha ? `<p style="margin:0;font-size:13px"><strong>Senha temporaria:</strong> <code style="background:#e5eeff;padding:2px 6px;border-radius:4px">${senha}</code></p>` : `<p style="margin:0;font-size:13px">Use Esqueci minha senha para definir sua senha.</p>`}
  </div>
  ${linkGrupo ? `<div style="background:#E8F5E9;border:1px solid #A5D6A7;border-radius:8px;padding:14px 18px;margin:0 0 20px"><p style="margin:0 0 8px;font-size:13px;font-weight:600;color:#2E7D32">Grupo no WhatsApp</p><a href="${linkGrupo}" style="color:#1565C0;font-size:13px">${linkGrupo}</a></div>` : ''}
  <a href="${PORTAL_URL}?escola=${escola_id || ''}" style="display:inline-block;padding:12px 28px;background:#0A2756;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Acessar portal</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="margin:0;font-size:12px;color:#888">${nomeEscola} - Portal powered by RV Invictus</p>
</div>`

    } else if (tipo === 'agendamento') {
      const { tipoEvento, data, hora, local: localEvento } = body
      const isPratica = (tipoEvento || '').toLowerCase().includes('pratica') || (tipoEvento || '').toLowerCase().includes('pr')
      const titulo = isPratica ? 'Aula Pratica' : 'Avaliacao Teorica'
      subject = `${titulo} agendada - ${nomeEscola}`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">Ola, ${nome}!</h2>
  <p style="margin:0 0 12px;line-height:1.6">Sua <strong>${titulo}</strong> na <strong>${nomeEscola}</strong> foi agendada:</p>
  <div style="background:#F4F8FF;border:1px solid #B5D4F4;border-radius:8px;padding:16px 20px;margin:0 0 20px">
    <p style="margin:0 0 6px;font-size:13px"><strong>Data:</strong> ${data}</p>
    <p style="margin:0 0 6px;font-size:13px"><strong>Horario:</strong> ${hora}</p>
    <p style="margin:0;font-size:13px"><strong>Local:</strong> ${localEvento}</p>
  </div>
  <a href="${PORTAL_URL}?escola=${escola_id || ''}" style="display:inline-block;padding:12px 28px;background:#0A2756;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Ver meus agendamentos</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="margin:0;font-size:12px;color:#888">${nomeEscola} - Portal powered by RV Invictus</p>
</div>`

    } else if (tipo === 'certificado') {
      const hab = body.habilitacao || habilitacao
      subject = `Seu certificado esta disponivel - ${nomeEscola}`
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">Parabens, ${nome}!</h2>
  <p style="margin:0 0 12px;line-height:1.6">Seu certificado de <strong>${hab}</strong> foi emitido pela <strong>${nomeEscola}</strong> e esta disponivel no portal.</p>
  <p style="margin:0 0 20px;line-height:1.6;font-size:13px;color:#555">Sua habilitacao nautica sera processada pela Marinha do Brasil e ficara disponivel na sua conta Gov.br em breve.</p>
  <a href="${PORTAL_URL}?escola=${escola_id || ''}" style="display:inline-block;padding:12px 28px;background:#0A2756;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px">Baixar certificado</a>
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="margin:0;font-size:12px;color:#888">${nomeEscola} - Portal powered by RV Invictus</p>
</div>`

    } else if (tipo === 'cobranca') {
      const cfg = emailsCfg?.cobranca
      subject = cfg?.assunto ? interpolar(cfg.assunto, vars) : `Sua matricula na ${nomeEscola} esta aguardando pagamento`
      const corpoCustom = cfg?.corpo ? interpolar(cfg.corpo, vars).replace(/\n/g, '<br>') : null
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">Ola, ${nome}!</h2>
  ${corpoCustom ? `<p style="margin:0 0 20px;line-height:1.7">${corpoCustom}</p>` : `<p style="margin:0 0 12px;line-height:1.6">Identificamos que sua matricula na <strong>${nomeEscola}</strong> ainda nao foi confirmada.</p><p style="margin:0 0 20px;line-height:1.6">Conclua o pagamento para garantir sua vaga.</p>`}
  <a href="${PORTAL_URL}?escola=${escola_id || ''}" style="display:inline-block;padding:12px 28px;background:#0A2756;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;margin-bottom:20px">Concluir minha matricula</a>
  ${emailEscola || telefone ? `<div style="background:#F4F8FF;border:1px solid #B5D4F4;border-radius:8px;padding:14px 18px;margin:0 0 20px"><p style="margin:0 0 6px;font-size:13px;font-weight:600">Duvidas? Fale com a escola:</p>${emailEscola ? `<p style="margin:0 0 4px;font-size:13px"><a href="mailto:${emailEscola}" style="color:#1565C0">${emailEscola}</a></p>` : ''}${telefone ? `<p style="margin:0;font-size:13px">${telefone}</p>` : ''}</div>` : ''}
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="margin:0;font-size:12px;color:#888">${nomeEscola} - Portal powered by RV Invictus</p>
</div>`

    } else if (tipo === 'pendencia') {
      const listaPendencias: string[] = body.pendencias || []
      const mensagemExtra: string = body.mensagemExtra || ''
      subject = `Pendencia na sua matricula - ${nomeEscola}`
      const itensHtml = listaPendencias.map(p => `<li style="margin-bottom:8px;line-height:1.5">${p}</li>`).join('')
      html = `<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:32px 24px;color:#1a1a1a">
  <h2 style="margin:0 0 16px;color:#0A2756">Ola, ${nome}!</h2>
  <p style="margin:0 0 12px;line-height:1.6">A <strong>${nomeEscola}</strong> identificou pendencias na sua matricula que precisam ser resolvidas:</p>
  <div style="background:#FFF8E1;border:1px solid #FFD54F;border-radius:8px;padding:16px 20px;margin:0 0 20px">
    <ul style="margin:0;padding-left:18px;font-size:13px;color:#5D4037">${itensHtml}</ul>
  </div>
  ${mensagemExtra ? `<p style="margin:0 0 20px;line-height:1.6;font-size:13px;background:#F4F8FF;border:1px solid #B5D4F4;border-radius:8px;padding:14px 18px">${mensagemExtra}</p>` : ''}
  <a href="${PORTAL_URL}?escola=${escola_id || ''}" style="display:inline-block;padding:12px 28px;background:#0A2756;color:#fff;text-decoration:none;border-radius:6px;font-weight:600;font-size:14px;margin-bottom:20px">Acessar meu portal</a>
  ${emailEscola || telefone ? `<div style="background:#F4F8FF;border:1px solid #B5D4F4;border-radius:8px;padding:14px 18px;margin:0 0 20px"><p style="margin:0 0 6px;font-size:13px;font-weight:600">Duvidas? Fale com a escola:</p>${emailEscola ? `<p style="margin:0 0 4px;font-size:13px"><a href="mailto:${emailEscola}" style="color:#1565C0">${emailEscola}</a></p>` : ''}${telefone ? `<p style="margin:0;font-size:13px">${telefone}</p>` : ''}</div>` : ''}
  <hr style="margin:32px 0;border:none;border-top:1px solid #e5e5e5" />
  <p style="margin:0;font-size:12px;color:#888">${nomeEscola} - Portal powered by RV Invictus</p>
</div>`

    } else if (tipo === 'pagamento_confirmado') {
      // Marina Manager: confirmacao de pagamento de uma cobranca (chamado
      // por supabase/functions/payment/index.ts). Independente da escola —
      // nao usa nomeEscola nem PORTAL_URL da escola.
      subject = 'Pagamento confirmado'
      html = cardMarina(`Ola, ${nome}!`, `Recebemos o pagamento referente a: <strong>${descricao}</strong>. Obrigado!`)

    } else {
      throw new Error(`Tipo de e-mail invalido: ${tipo}`)
    }

    const res = await fetch('https://api.resend.com/emails', {
      method:  'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: FROM, to: [para], subject, html }),
    })

    const data = await res.json()
    if (!res.ok) throw new Error(data?.message || `Resend error ${res.status}`)

    return json({ id: data.id })

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return json({ error: msg }, 400)
  }
})
