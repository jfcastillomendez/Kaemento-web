import payments from './_lib/payments.cjs';
import emails from './_lib/order-emails.cjs';
import {waitUntil} from '@vercel/functions';
const headers = { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' };
const reply = (status, code) => new Response(JSON.stringify({ status:code }), {status,headers});
const MAX_BYTES = 65536;
async function rawBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BYTES) return null;
  const reader = request.body?.getReader();
  if (!reader) return Buffer.alloc(0);
  const chunks = []; let size = 0;
  try {
    while (true) {
      const {done,value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { await reader.cancel(); return null; }
      chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks);
  } finally { reader.releaseLock(); }
}
export async function handle(request, env = process.env, storeFactory = payments.createStore, background = null) {
  if (request.method !== 'POST') return new Response('', {status:405,headers:{...headers,Allow:'POST'}});
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return reply(415,'invalid_content_type');
  if (!payments.enabled(env) || !env.BOLD_SECRET_KEY?.trim()) return reply(503,'confirmation_unavailable');
  let raw;
  try { raw = await rawBody(request); } catch (_) { return reply(400,'invalid_body'); }
  if (!raw) return reply(413,'body_too_large');
  if (!payments.authentic(raw,request.headers.get('x-bold-signature'),env.BOLD_SECRET_KEY)) return reply(401,'invalid_signature');
  let event;
  try { event = payments.notification(JSON.parse(raw.toString('utf8'))); } catch (_) { return reply(400,'invalid_json'); }
  if (!event) return reply(422,'invalid_event');
  try {
    const store = storeFactory(env);
    const result = await store.process(event);
    if (['unknown_order','mismatch','payment_conflict','event_conflict','order_conflict'].includes(result)) return reply(422,result);
    // The outbox and payment are durable before ACK. Provider latency never blocks Bold's ACK.
    if (background && event.type === 'SALE_APPROVED' && ['confirmed','duplicate','duplicate_payment'].includes(result)) {
      background(emails.deliverOrder(event.orderId,store,env).catch(()=>{}));
    }
    // No analytics request here. The private purchase outbox remains awaiting configuration.
    return reply(200,result);
  } catch (_) {
    // Generic only: do not log provider payload, environment, signatures or PII.
    return reply(503,'storage_unavailable');
  }
}
export default { fetch: request => handle(request,process.env,payments.createStore,waitUntil) };
