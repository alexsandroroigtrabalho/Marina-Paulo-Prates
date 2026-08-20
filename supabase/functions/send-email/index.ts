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

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
    if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY não configurado')

    const { tipo, para, nome, descricao } = await req.json()

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
