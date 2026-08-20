// supabase/functions/payment/index.ts
// Mercado Pago payment handler + Supabase cobrancas insert (service role, bypasses RLS)
// Env: MERCADOPAGO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Adaptado do padrão do projeto RV Invictus para o módulo financeiro da marina.

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  return res.json()
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  try {
    const ACCESS_TOKEN = Deno.env.get('MERCADOPAGO_ACCESS_TOKEN')
    if (!ACCESS_TOKEN) throw new Error('MERCADOPAGO_ACCESS_TOKEN não configurado')

    const body = await req.json()
    const { action } = body

    /* ── confirmar pagamento de uma cobrança ── */
    if (action === 'confirmar_pago') {
      const { cobranca_id, payment_id } = body
      await sbFetch(`cobrancas?id=eq.${cobranca_id}`, 'PATCH', {
        status: 'pago', payment_id, pago_em: new Date().toISOString(),
      })
      try {
        const rows = await sbFetch(`cobrancas?id=eq.${cobranca_id}&select=descricao,valor,clientes(nome,email)`)
        const cobranca = Array.isArray(rows) ? rows[0] : null
        const email = cobranca?.clientes?.email
        if (email) {
          const supabaseUrl = Deno.env.get('SUPABASE_URL')!
          const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
          await fetch(`${supabaseUrl}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${serviceKey}` },
            body: JSON.stringify({ tipo: 'pagamento_confirmado', para: email, nome: cobranca.clientes.nome, descricao: cobranca.descricao }),
          })
        }
      } catch (_) { /* falha no e-mail não bloqueia a confirmação */ }
      return json({ ok: true })
    }

    /* ── consultar status de pagamento ── */
    if (action === 'check') {
      const { payment_id } = body
      const res = await fetch(`https://api.mercadopago.com/v1/payments/${payment_id}`, {
        headers: { Authorization: `Bearer ${ACCESS_TOKEN}` },
      })
      const data = await res.json()
      return json({ status: data.status })
    }

    /* ── criar cobrança (PIX / cartão / boleto) ── */
    if (action === 'create') {
      const { tipo, valor, email, nome, cpf, token, payment_method_id, installments, descricao } = body

      const payload: any = {
        transaction_amount: Number(valor),
        description: descricao || 'Cobrança marina',
        payer: { email },
      }

      if (tipo === 'pix') {
        payload.payment_method_id = 'pix'
      } else if (tipo === 'cartao') {
        payload.token = token
        payload.payment_method_id = payment_method_id
        payload.installments = Number(installments) || 1
      } else if (tipo === 'boleto') {
        payload.payment_method_id = 'bolbradesco'
        const parts = (nome || '').trim().split(/\s+/)
        payload.payer = {
          email,
          first_name: parts[0] || '',
          last_name: parts.slice(1).join(' ') || '',
          identification: { type: 'CPF', number: (cpf || '').replace(/\D/g, '') },
          address: { zip_code: '01310100', street_name: 'Rua', street_number: '0', neighborhood: 'Centro', city: 'São Paulo', federal_unit: 'SP' },
        }
      }

      const res = await fetch('https://api.mercadopago.com/v1/payments', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data?.message || `MP API error ${res.status}`)

      const result: any = { payment_id: data.id, status: data.status }
      if (tipo === 'pix') {
        result.qr_code = data.point_of_interaction?.transaction_data?.qr_code
        result.qr_code_base64 = data.point_of_interaction?.transaction_data?.qr_code_base64
      }
      if (tipo === 'boleto') {
        result.boleto_url = data.transaction_details?.external_resource_url
        result.barcode = data.barcode?.content
      }
      return json(result)
    }

    throw new Error(`Ação inválida: ${action}`)
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400)
  }
})

function json(data: any, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}
