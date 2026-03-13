// api/webhook.js — Lemon Squeezy webhook para Mesa Chica

export const config = { runtime: 'edge' };

async function verificarFirma(body, signature, secret) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signed = await crypto.subtle.sign('HMAC', key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(signed))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
  return expected === signature;
}

async function supabasePatch(url, serviceKey, table, match, data) {
  const params = Object.entries(match).map(([k, v]) => `${k}=eq.${v}`).join('&');
  const res = await fetch(`${url}/rest/v1/${table}?${params}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

async function supabaseUpsert(url, serviceKey, table, data) {
  const res = await fetch(`${url}/rest/v1/${table}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': serviceKey,
      'Authorization': `Bearer ${serviceKey}`,
      'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(data),
  });
  return res.ok;
}

export default async function handler(req) {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  const secret = process.env.LEMON_SIGNING_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

  if (!secret || !supabaseUrl || !supabaseKey) {
    return new Response('Config missing', { status: 500 });
  }

  const signature = req.headers.get('x-signature');
  if (!signature) {
    return new Response('No signature', { status: 401 });
  }

  const rawBody = await req.text();

  const valid = await verificarFirma(rawBody, signature, secret);
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  const eventName = payload?.meta?.event_name;
  const userId = payload?.meta?.custom_data?.user_id;
  const email = payload?.data?.attributes?.user_email;
  const status = payload?.data?.attributes?.status;

  // Eventos que activan Pro
  const eventosActivos = ['order_created', 'subscription_created', 'subscription_payment_success'];
  // Eventos que desactivan Pro
  const eventosInactivos = ['subscription_cancelled', 'subscription_expired', 'subscription_paused'];

  if (eventosActivos.includes(eventName)) {
    if (userId) {
      // Upsert usuario y activar pro
      await supabaseUpsert(supabaseUrl, supabaseKey, 'usuarios', {
        id: userId,
        pro: true,
        pro_activado_en: new Date().toISOString(),
        ultimo_acceso: new Date().toISOString(),
      });
    }
  }

  if (eventosInactivos.includes(eventName)) {
    if (userId) {
      await supabasePatch(supabaseUrl, supabaseKey, 'usuarios', { id: userId }, {
        pro: false,
      });
    }
  }

  return new Response('ok', { status: 200 });
}
