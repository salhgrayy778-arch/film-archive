// Supabase Edge Function: sends a phone notification when someone follows you, likes your review or gives you a role.
// Called by database triggers (security/film-push.sql). Deploy with "Verify JWT" OFF; the shared secret header protects it.
// Secrets needed: PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const ROLE_FA: Record<string, string> = { critic: 'منتقد', moderator: 'مودریتور', admin: 'مدیر' };
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);

async function nameOf(id: string) {
  const { data } = await db.from('film_public_profiles').select('display_name').eq('user_id', id).maybeSingle();
  return clip(data?.display_name || 'یک نفر', 40);
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('forbidden', { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const rec = body?.record || {};
  let to = '', title = '', text = '';

  if (body.table === 'film_follows' && rec.followed_id && rec.follower_id) {
    to = rec.followed_id; title = 'دنبال‌کنندهٔ تازه';
    text = (await nameOf(rec.follower_id)) + ' تو را دنبال کرد';
  } else if (body.table === 'film_review_likes' && rec.review_id && rec.user_id) {
    const { data: rv } = await db.from('film_public_reviews').select('user_id,film_title').eq('id', rec.review_id).maybeSingle();
    if (!rv || rv.user_id === rec.user_id) return new Response('skip', { status: 200 });
    to = rv.user_id; title = 'نظرت لایک شد ❤️';
    text = (await nameOf(rec.user_id)) + ' نظرت دربارهٔ «' + clip(rv.film_title, 60) + '» را لایک کرد';
  } else if (body.table === 'film_roles' && rec.user_id && ROLE_FA[rec.role]) {
    if (rec.granted_by === rec.user_id) return new Response('skip', { status: 200 });
    to = rec.user_id; title = 'نقش تازه 🎬';
    text = 'حالا در سایت «' + ROLE_FA[rec.role] + '» هستی';
  } else return new Response('ignored', { status: 200 });

  const { data: subs } = await db.from('film_push_subs').select('id,endpoint,p256dh,auth').eq('user_id', to);
  if (!subs?.length) return new Response('no subscribers', { status: 200 });
  const payload = JSON.stringify({ title, body: text, url: './', tag: body.table });
  let sent = 0;
  await Promise.all(subs.map(async (s) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('film_push_subs').delete().eq('id', s.id);
    }
  }));
  return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
