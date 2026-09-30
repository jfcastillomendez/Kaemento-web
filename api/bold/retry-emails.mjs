import {createHash, timingSafeEqual} from 'node:crypto';
import payments from './_lib/payments.cjs';
import emails from './_lib/order-emails.cjs';
const headers = {'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff'};
const reply = (status, code, extra = {}) => Response.json({status:code,...extra},{status,headers});
export async function handle(request, env = process.env, storeFactory = payments.createStore, deliver = emails.deliverOrder) {
  if (!['GET','POST'].includes(request.method)) return new Response('',{status:405,headers:{...headers,Allow:'GET, POST'}});
  // Vercel Cron uses GET + its own CRON_SECRET. Manual POST keeps the existing secret.
  const scheduled=request.method==='GET';
  const secret = scheduled ? env.CRON_SECRET : env.KAEMENTO_EMAIL_RETRY_SECRET;
  if (!payments.enabled(env) || typeof secret !== 'string' || secret.length < 32) return reply(503,'retry_unavailable');
  const supplied = request.headers.get('authorization') || '';
  const hash = value => createHash('sha256').update(value).digest();
  if (!timingSafeEqual(hash(supplied),hash('Bearer '+secret))) return reply(401,'unauthorized');
  if (!scheduled && !/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply(415,'invalid_content_type');
  let body={};
  if(!scheduled) try {
    const reader = request.body?.getReader(); let raw = '', size = 0;
    if (reader) try {
      while (true) { const {done,value} = await reader.read(); if (done) break; size += value.length;
        if (size > 256) { await reader.cancel(); return reply(413,'body_too_large'); } raw += Buffer.from(value).toString('utf8'); }
    } finally { reader.releaseLock(); }
    body = JSON.parse(raw);
  } catch (_) { return reply(400,'invalid_request'); }
  if (!body || Array.isArray(body) || Object.keys(body).some(k=>k !== 'orderId') ||
      (body.orderId !== undefined && !/^KAE-MICRO-\d{13}-[a-f0-9]{16}$/.test(body.orderId))) return reply(400,'invalid_request');
  try {
    const store = storeFactory(env);
    // One order per invocation keeps the authenticated manual retry within Function duration.
    const orderId = body.orderId || (await store.dueEmails())[0]?.split('|')[0];
    if (!orderId) return reply(200,'nothing_due');
    const results = await deliver(orderId,store,env,fetch,Boolean(body.orderId));
    return reply(200,'processed',{results});
  } catch (_) { return reply(503,'retry_unavailable'); }
}
export default {fetch:request=>handle(request)};
