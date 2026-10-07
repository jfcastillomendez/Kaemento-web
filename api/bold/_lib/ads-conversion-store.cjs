const {createHash, randomBytes} = require('node:crypto');
// The label is the exact public destination supplied by KAEMENTO from Google Ads.
const SEND_TO = 'AW-18358591293/UeCLCJPZtpQdEL2-h7JE';
const ORDER_ID = /^KAE-MICRO-\d{13}-[a-f0-9]{16}$/;
const HEX = /^[a-f0-9]{64}$/;
// Separate from payment/email records. No expiry after issuance: late returns stay harmless.
const CONVERSION = `
local raw = redis.call('GET', KEYS[1])
if not raw then return '{"status":"unavailable"}' end
local order = cjson.decode(raw)
if order.orderId ~= ARGV[2] then return '{"status":"unavailable"}' end
local now = tonumber(ARGV[3])
local state = redis.call('GET', KEYS[3])
if state then state = cjson.decode(state) end
if ARGV[1] == 'prepare' then
  if order.statusTokenHash ~= ARGV[4] or type(order.statusAccessUntil) ~= 'number' or order.statusAccessUntil <= now then
    return '{"status":"unavailable"}'
  end
elseif not state or state.ticket ~= ARGV[4] or type(state.expiresAt) ~= 'number' or state.expiresAt <= now then
  return '{"status":"unavailable"}'
end
if order.paymentStatus ~= 'paid' or order.status ~= 'approved' then return '{"status":"not_paid"}' end
local rawPurchase = redis.call('GET', KEYS[2])
if not rawPurchase then return '{"status":"not_paid"}' end
local purchase = cjson.decode(rawPurchase)
if purchase.status ~= 'approved' or purchase.orderId ~= order.orderId or purchase.paymentId ~= order.paymentId
  or type(order.paymentId) ~= 'string' or order.paymentId == '' or purchase.currency ~= 'COP' or order.currency ~= 'COP'
  or type(purchase.amount) ~= 'number' or purchase.amount <= 0 or purchase.amount > 9007199254740991
  or purchase.amount ~= math.floor(purchase.amount) or purchase.amount ~= order.amount then
  return '{"status":"not_paid"}'
end
if state and state.status == 'issued' then return '{"status":"already_issued"}' end
if ARGV[1] == 'prepare' then
  if not state or state.expiresAt <= now then
    state = {status='prepared',ticket=ARGV[5],expiresAt=now+300000}
    redis.call('SET', KEYS[3], cjson.encode(state))
  end
  return cjson.encode({status='prepared',orderId=order.orderId,ticket=state.ticket})
end
-- Consume before returning the only browser authorization. Never release this marker.
redis.call('SET', KEYS[3], cjson.encode({status='issued',issuedAt=now,sendTo=ARGV[6]}))
return cjson.encode({status='authorized',conversion={send_to=ARGV[6],value=purchase.amount,currency='COP',transaction_id=order.orderId}})
`;
function adsConversionStore(command, prefix, clock = Date.now) {
  return {
    async adsConversion(action, orderId, credential) {
      if (!['prepare','consume'].includes(action) || !ORDER_ID.test(orderId || '') || !HEX.test(credential || '')) throw new Error('Invalid conversion request');
      const proof = action === 'prepare' ? createHash('sha256').update(credential).digest('hex') : credential;
      return JSON.parse(await command(['EVAL',CONVERSION,'3',prefix+'order:'+orderId,prefix+'purchase:'+orderId,
        prefix+'ads-conversion:'+orderId,action,orderId,String(clock()),proof,randomBytes(32).toString('hex'),SEND_TO]));
    }
  };
}
module.exports = {adsConversionStore, SEND_TO};
