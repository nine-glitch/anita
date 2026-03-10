// api/cron.js — dispara notificaciones al azar
// Vercel lo llama cada 3 horas, pero solo manda push ~40% de las veces

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Solo desde Vercel Cron
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  // 40% de probabilidad — efecto "al azar"
  if (Math.random() > 0.4) {
    return new Response(JSON.stringify({ skip: true, reason: 'azar' }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }

  // Acá iría la lógica para obtener subscriptions de Supabase
  // y llamar a /api/notify por cada usuario activo
  // Por ahora retorna ok para testear el cron
  return new Response(JSON.stringify({ ok: true }), {
    headers: { 'Content-Type': 'application/json' }
  });
}
