const { createHmac, timingSafeEqual, createHash } = require('node:crypto');
const variants = require('../../../bold-config.js');
const orders = require('./orders.cjs');
const {networkStore} = require('../../_lib/network-store.cjs');
const {emailStore} = require('./email-store.cjs');
const {checkoutStore} = require('./checkout-store.cjs');
const {adsConversionStore} = require('./ads-conversion-store.cjs');
const ORDER_ID = /^KAE-MICRO-\d{13}-[a-f0-9]{16}$/;
const EVENT_ID = /^[A-Za-z0-9_-]{1,100}$/;
const TYPES = new Set(['SALE_APPROVED', 'SALE_REJECTED', 'VOID_APPROVED', 'VOID_REJECTED']);
const UNIT_AMOUNT = 365500;

function enabled(env = process.env) { return env.BOLD_CONFIRMATION_ENABLED === 'true'; }
function authentic(raw, signature, secret) {
  if (!Buffer.isBuffer(raw) || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature) || !secret?.trim()) return false;
  // Bold signs the BASE64 of the exact body bytes, NOT reserialized JSON.
  const expected = createHmac('sha256', secret).update(raw.toString('base64')).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
function notification(body) {
  if (!body || typeof body.id !== 'string' || !EVENT_ID.test(body.id) || !TYPES.has(body.type)) return null;
  const data = body.data, reference = data?.metadata?.reference;
  if (typeof data?.payment_id !== 'string' || !EVENT_ID.test(data.payment_id) || typeof reference !== 'string' || !ORDER_ID.test(reference) ||
      data?.amount?.currency !== 'COP' || !Number.isSafeInteger(data.amount.total) || data.amount.total <= 0) return null;
  // Strict projection: never store the raw webhook, payer, card or contact data.
  const event = { id: body.id, type: body.type, paymentId: data.payment_id, orderId: reference,
    amount: data.amount.total, currency: 'COP' };
  if (['CARD', 'CARD_WEB', 'NEQUI', 'BOTON_BANCOLOMBIA', 'PSE', 'QR'].includes(data.payment_method)) event.paymentMethod = data.payment_method;
  return event;
}
function orderRecord(orderId, selection, customer) {
  const canonical = variants.restore(selection);
  if (!ORDER_ID.test(orderId) || !canonical) throw new Error('Invalid order');
  return { ...orders.record(orderId, canonical, customer), selection: canonical, amount: UNIT_AMOUNT * variants.kitCount(canonical),
    status:'pending', createdAt:Date.now(), campaign:'microcemento_kaemento_launch_2026' };
}
function purchaseEvent(order) {
  const selection = variants.restore(order?.selection);
  const unitPrice = selection ? order.amount / variants.kitCount(selection) : null;
  if (!selection || order.status !== 'approved' || !ORDER_ID.test(order.orderId || '') ||
      !EVENT_ID.test(order.paymentId || '') || order.currency !== 'COP' || ![variants.unitPrice,variants.regularPrice].includes(unitPrice)) return null;
  // This is an outbox payload, not a browser event and not an HTTP request to GA4.
  return { name:'purchase', params:{ transaction_id:order.orderId, currency:'COP', value:order.amount,
    items:variants.analyticsItems(selection,unitPrice) } };
}

// One Redis transaction checks and changes all state. It survives restarts and concurrent Functions.
// No expiry on confirmed payments / deduplication keys: late replays must remain harmless.
const PROCESS_EVENT = `
local existing = redis.call('GET', KEYS[1])
if not existing then return 'unknown_order' end
local order = cjson.decode(existing)
local event = cjson.decode(ARGV[1])
if order.amount ~= event.amount or order.currency ~= event.currency or order.orderId ~= event.orderId then return 'mismatch' end
local owner = redis.call('GET', KEYS[3])
if owner and owner ~= event.orderId then return 'payment_conflict' end
local previous = redis.call('GET', KEYS[2])
if previous then
  if previous == ARGV[2] then return 'duplicate' else return 'event_conflict' end
end
local payment = redis.call('GET', KEYS[4])
if payment then payment = cjson.decode(payment) else payment = {} end
local outcome = 'recorded'
if event.type == 'SALE_APPROVED' then
  if order.paymentId and order.paymentId ~= event.paymentId then return 'order_conflict' end
  if payment.status == 'voided' or order.status == 'voided' then
    outcome = 'ignored_voided'
  elseif order.status == 'approved' then
    outcome = 'duplicate_payment'
  else
    order.status = 'approved'
    order.paymentId = event.paymentId
    order.confirmedAt = tonumber(ARGV[3])
    order.updatedAt = tonumber(ARGV[3])
    order.paymentStatus = 'paid'
    order.orderStatus = 'paid'
    order.paidAt = tonumber(ARGV[3])
    order.boldPaymentId = event.paymentId
    order.boldStatus = event.type
    order.paymentMethod = event.paymentMethod or cjson.null
    payment.status = 'approved'
    local purchase = {orderId=order.orderId, paymentId=event.paymentId, amount=order.amount,
      currency=order.currency, selection=order.selection, status='approved', confirmedAt=order.confirmedAt,
      campaign=order.campaign, analyticsStatus='awaiting_configuration'}
    redis.call('SET', KEYS[5], cjson.encode(purchase))
    if order.campaign == 'microcemento_kaemento_launch_2026' then redis.call('SADD', KEYS[6], order.orderId) end
    if (order.schemaVersion == 2 or order.schemaVersion == 3) and order.customerEmail then
      for index=7,8 do
        local role = index == 7 and 'sales' or 'customer'
        local job = {orderId=order.orderId, role=role, status='pending', attempts=0, nextAttemptAt=tonumber(ARGV[3])}
        if redis.call('SET', KEYS[index], cjson.encode(job), 'NX') then
          redis.call('ZADD', KEYS[9], ARGV[3], order.orderId .. '|' .. role)
        end
      end
      order.emailStatus = 'pending'
    else
      order.emailStatus = 'failed'
      order.emailErrorCode = 'legacy_order_missing_customer'
    end
    outcome = 'confirmed'
  end
elseif event.type == 'VOID_APPROVED' then
  payment.status = 'voided'
  if not order.paymentId or order.paymentId == event.paymentId then
    order.status = 'voided'
    order.updatedAt = tonumber(ARGV[3])
    order.paymentStatus = 'refunded'
    order.orderStatus = 'cancelled'
    order.boldStatus = event.type
    redis.call('ZREM', KEYS[9], order.orderId .. '|sales', order.orderId .. '|customer')
    redis.call('SREM', KEYS[6], order.orderId)
    local purchase = redis.call('GET', KEYS[5])
    if purchase then
      purchase = cjson.decode(purchase)
      purchase.status = 'voided'
      purchase.analyticsStatus = 'cancelled'
      redis.call('SET', KEYS[5], cjson.encode(purchase))
    end
  end
elseif event.type == 'SALE_REJECTED' then
  if payment.status ~= 'approved' and payment.status ~= 'voided' then payment.status = 'rejected' end
  if order.status == 'pending' then
    order.status = 'rejected'
    order.paymentStatus = 'failed'
    order.boldStatus = event.type
    order.updatedAt = tonumber(ARGV[3])
  end
end
redis.call('SET', KEYS[1], cjson.encode(order))
redis.call('SET', KEYS[2], ARGV[2])
redis.call('SET', KEYS[3], event.orderId)
redis.call('SET', KEYS[4], cjson.encode(payment))
return outcome
`;
function createStore(env = process.env, transport = fetch, clock = Date.now) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const namespace = env.BOLD_STORAGE_NAMESPACE;
  if (!/^https:\/\/[a-z0-9.-]+\.upstash\.io\/?$/i.test(url || '') || !token?.trim() ||
      !/^[a-z0-9:-]{1,64}$/.test(namespace || '')) throw new Error('Payment storage unavailable');
  const prefix = `kaemento:${namespace}:`;
  async function command(args) {
    // One regional HTTPS round trip; leave time to ACK Bold within its 2-second window.
    const response = await transport(url, {method:'POST',headers:{Authorization:`Bearer ${token}`,
      'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(1200),redirect:'error'});
    if (!response.ok) throw new Error('Payment storage unavailable');
    const data = await response.json();
    if (data.error || !Object.hasOwn(data,'result')) throw new Error('Payment storage unavailable');
    return data.result;
  }
  return {
    ...adsConversionStore(command, prefix, clock),
    ...emailStore(command, prefix, clock),
    ...networkStore(command, prefix, clock),
    ...checkoutStore(command, prefix, clock),
    async saveOrder(record) {
      if (await command(['SET', prefix+'order:'+record.orderId, JSON.stringify(record), 'NX']) !== 'OK') throw new Error('Order not stored');
    },
    async process(event) {
      const fingerprint = createHash('sha256').update(JSON.stringify(event)).digest('hex');
      const keys = ['order:'+event.orderId,'event:'+event.id,'payment-owner:'+event.paymentId,
        'payment:'+event.paymentId,'purchase:'+event.orderId,'campaign:confirmed-orders',
        'email:'+event.orderId+':sales','email:'+event.orderId+':customer','email:due'].map(k=>prefix+k);
      return command(['EVAL',PROCESS_EVENT,String(keys.length),...keys,JSON.stringify(event),fingerprint,String(clock())]);
    },
    async confirmedCampaignOrders() {
      return command(['SCARD',prefix+'campaign:confirmed-orders']);
    },
    async readOrder(orderId) {
      if (!ORDER_ID.test(orderId || '')) return null;
      const data = await command(['GET',prefix+'order:'+orderId]); return data ? JSON.parse(data) : null;
    }
  };
}
module.exports = { enabled, authentic, notification, orderRecord, purchaseEvent, createStore, PROCESS_EVENT };
