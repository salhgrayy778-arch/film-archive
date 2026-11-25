// Supabase Edge Function: phone/desktop notifications for follows, likes on a review, new roles and admin announcements.
// Called by database triggers (security/film-push.sql + film-push-v2.sql). Deploy with "Verify JWT" OFF; the shared secret protects it.
// Secrets needed: PUSH_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:you@example.com).
import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
webpush.setVapidDetails(Deno.env.get('VAPID_SUBJECT') || 'mailto:admin@example.com', Deno.env.get('VAPID_PUBLIC_KEY')!, Deno.env.get('VAPID_PRIVATE_KEY')!);

const ROLE_FA: Record<string, string> = { critic: 'منتقد', moderator: 'مودریتور', admin: 'مدیر' };
const clip = (s: unknown, n: number) => String(s ?? '').slice(0, n);
const HOURLY_CAP = 20; // personal notifications (follow / like) per person per hour, so nobody can be flooded

async function nameOf(id: string) {
  const { data } = await db.from('film_public_profiles').select('display_name').eq('user_id', id).maybeSingle();
  return clip(data?.display_name || 'یک نفر', 40);
}

type Sub = { id: number; endpoint: string; p256dh: string; auth: string; prefs: Record<string, unknown> | null };

async function deliver(subs: Sub[], kind: string, payload: string) {
  let sent = 0;
  const run = async (s: Sub) => {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 86400 });
      sent++;
    } catch (e: any) {
      console.log('push failed', e?.statusCode, String(e?.body || e?.message || e).slice(0, 200));
      if (e?.statusCode === 404 || e?.statusCode === 410) await db.from('film_push_subs').delete().eq('id', s.id);
    }
  };
  for (let i = 0; i < subs.length; i += 40) await Promise.all(subs.slice(i, i + 40).map(run));
  console.log('sent', sent, 'of', subs.length, 'for', kind);
  return sent;
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });
  if (req.headers.get('x-push-secret') !== Deno.env.get('PUSH_SECRET')) return new Response('forbidden', { status: 403 });
  let body: any;
  try { body = await req.json(); } catch { return new Response('bad json', { status: 400 }); }
  const rec = body?.record || {};
  const wants = (s: Sub, kind: string) => (s.prefs || {})[kind] !== false;

  // Admin announcement: everybody who turned notifications on (and did not mute announcements)
  if (body.table === 'film_announcements') {
    if (!rec.active || !rec.message) return new Response('skip', { status: 200 });
    const all: Sub[] = [];
    for (let from = 0; from < 5000; from += 1000) {
      const { data } = await db.from('film_push_subs').select('id,endpoint,p256dh,auth,prefs').range(from, from + 999);
      if (!data?.length) break;
      all.push(...(data as Sub[]));
      if (data.length < 1000) break;
    }
    const subs = all.filter((s) => wants(s, 'announce'));
    if (!subs.length) { console.log('no subscribers for announcement'); return new Response('no subscribers', { status: 200 }); }
    const sent = await deliver(subs, 'announcement', JSON.stringify({ title: 'اعلامیهٔ سایت 📢', body: clip(rec.message, 140), tag: 'announce' }));
    return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  let to = '', title = '', text = '', kind = '', tag = '';
  if (body.table === 'film_follows' && rec.followed_id && rec.follower_id) {
    kind = 'follow'; to = rec.followed_id; title = 'دنبال‌کنندهٔ تازه'; tag = 'follow-' + rec.follower_id;
    text = (await nameOf(rec.follower_id)) + ' تو را دنبال کرد';
  } else if (body.table === 'film_review_likes' && rec.review_id && rec.user_id) {
    const { data: rv } = await db.from('film_public_reviews').select('user_id,film_title').eq('id', rec.review_id).maybeSingle();
    if (!rv || rv.user_id === rec.user_id) { console.log('skip: own or missing review'); return new Response('skip', { status: 200 }); }
    kind = 'like'; to = rv.user_id; title = 'نظرت لایک شد ❤️'; tag = 'like-' + rec.review_id + '-' + rec.user_id;
    text = (await nameOf(rec.user_id)) + ' نظرت دربارهٔ «' + clip(rv.film_title, 60) + '» را لایک کرد';
  } else if (body.table === 'film_roles' && rec.user_id && ROLE_FA[rec.role]) {
    if (rec.granted_by === rec.user_id) { console.log('skip: role given to self'); return new Response('skip', { status: 200 }); }
    kind = 'role'; to = rec.user_id; title = 'نقش تازه 🎬'; tag = 'role-' + rec.role;
    text = 'حالا در سایت «' + ROLE_FA[rec.role] + '» هستی';
  } else { console.log('ignored', body?.table); return new Response('ignored', { status: 200 }); }

  if (kind === 'follow' || kind === 'like') {
    const since = new Date(Date.now() - 3600_000).toISOString();
    const { count } = await db.from('film_push_log').select('id', { count: 'exact', head: true }).eq('user_id', to).gte('created_at', since);
    if ((count || 0) >= HOURLY_CAP) { console.log('skip: hourly cap reached for', to); return new Response('capped', { status: 200 }); }
    await db.from('film_push_log').insert({ user_id: to, kind });
    if (Math.random() < 0.02) await db.from('film_push_log').delete().lt('created_at', new Date(Date.now() - 86400_000).toISOString());
  }

  const { data: subs } = await db.from('film_push_subs').select('id,endpoint,p256dh,auth,prefs').eq('user_id', to);
  const want = ((subs || []) as Sub[]).filter((s) => wants(s, kind));
  if (!want.length) { console.log('no subscribers (or muted) for', kind, 'recipient', to); return new Response('no subscribers', { status: 200 }); }
  const sent = await deliver(want, kind, JSON.stringify({ title, body: text, url: './', tag }));
  return new Response(JSON.stringify({ sent }), { status: 200, headers: { 'Content-Type': 'application/json' } });
});
