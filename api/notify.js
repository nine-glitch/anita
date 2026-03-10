// api/notify.js — Anita / Vercel Edge Function
// Genera notificaciones push como mensajes de amiga, al azar

export const config = { runtime: 'edge' };

const NOTIFY_PROMPT = `Sos Anita. Estabas haciendo otra cosa y de repente te acordaste de algo que te contaron.

Vas a mandar un mensaje corto — como un WhatsApp de amiga. No una notificación de app. Una frase sola, a veces dos. Sin saludos, sin "hola", sin preguntas abiertas vacías.

Puede ser:
- Una pregunta concreta sobre algo del historial
- Una observación que se te cruzó
- Algo que relacionás con lo que te dijeron antes

Tono: informal, directo, como si lo escribieras desde el celular en otro momento del día.

NO usés jerga terapéutica. NO digas "¿cómo estás?". NO seas genérica.

Si no hay historial, mandá algo que suene a que te acordaste de ella sin razón particular. Breve.

Respondé SOLO con el texto del mensaje. Sin JSON, sin comillas, sin explicación.`;

export default async function handler(req) {
  // Verificar que viene de un cron autorizado
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  let body;
  try { body = await req.json(); }
  catch { return new Response('Body inválido', { status: 400 }); }

  const { subscription, historial } = body;
  if (!subscription) return new Response('Sin subscription', { status: 400 });

  const anthropicKey = process.env.ANTHROPIC_API_KEY;
  if (!anthropicKey) return new Response('Sin API key', { status: 500 });

  // Construir contexto del historial
  const contexto = historial && historial.length > 0
    ? `Esto es lo que te contó últimamente:\n${historial.slice(-5).map(p => `- "${p}"`).join('\n')}`
    : 'No te ha contado nada todavía.';

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 100,
        system: NOTIFY_PROMPT,
        messages: [{
          role: 'user',
          content: contexto
        }]
      })
    });

    const data = await res.json();
    const mensaje = data.content?.[0]?.text?.trim();
    if (!mensaje) throw new Error('Sin respuesta de Claude');

    // Mandar push notification
    const vapidKey = process.env.VAPID_PRIVATE_KEY;
    const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    const vapidSubject = process.env.VAPID_SUBJECT || 'mailto:hola@anita.app';

    // Payload de la notificación
    const payload = JSON.stringify({
      title: 'anita',
      body: mensaje,
      icon: '/icon-192.png',
      badge: '/badge.png',
      tag: 'anita-nudge',
      renotify: true,
      data: { url: '/' }
    });

    // Usar web-push via fetch a la subscription endpoint
    // En Vercel Edge necesitamos implementar VAPID manualmente o usar un helper
    const pushRes = await sendPush(subscription, payload, {
      vapidPublic,
      vapidKey,
      vapidSubject
    });

    if (!pushRes.ok) throw new Error(`Push falló: ${pushRes.status}`);

    return new Response(JSON.stringify({ ok: true, mensaje }), {
      headers: { 'Content-Type': 'application/json' }
    });

  } catch (err) {
    console.error('notify error:', err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}

// Implementación mínima de VAPID push para Edge Runtime
async function sendPush(subscription, payload, { vapidPublic, vapidKey, vapidSubject }) {
  // En producción usar web-push como dependency o implementar VAPID signing
  // Por ahora delegamos a un endpoint externo si existe, o usamos el approach de Node
  const endpoint = subscription.endpoint;

  // Importar crypto para VAPID
  const encoder = new TextEncoder();

  // Headers básicos — en producción necesitás signing VAPID completo
  // Esto es un placeholder que funciona con servidores push que aceptan sin VAPID
  return await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Encoding': 'aes128gcm',
      'TTL': '86400',
    },
    body: payload
  });
}
