const {randomBytes} = require('node:crypto');
const ORDER_ID = /^KAE-MICRO-\d{13}-[a-f0-9]{16}$/;
const ROLES = new Set(['sales', 'customer']);
// Resend remembers idempotency keys for 24 hours. Stop at 23 hours if delivery is uncertain.
const SAFE_RETRY_MS = 23 * 60 * 60 * 1000;
const CLAIM = `
local raw = redis.call('GET', KEYS[1])
local orderRaw = redis.call('GET', KEYS[2])
if not raw or not orderRaw then return '{"status":"missing"}' end
local job, order = cjson.decode(raw), cjson.decode(orderRaw)
local now = tonumber(ARGV[1])
if job.status == 'sent' then return '{"status":"sent"}' end
if order.paymentStatus ~= 'paid' then
  redis.call('ZREM', KEYS[3], ARGV[5])
  return '{"status":"not_paid"}'
end
if job.status == 'manual_review' then return '{"status":"manual_review"}' end
if job.firstAttemptAt and now - job.firstAttemptAt >= tonumber(ARGV[6]) then
  job.status = 'manual_review'
  job.lastErrorCode = 'provider_deduplication_window_expired'
  order.emailStatus = 'failed'
  order.updatedAt = now
  redis.call('SET', KEYS[1], cjson.encode(job))
  redis.call('SET', KEYS[2], cjson.encode(order))
  redis.call('ZREM', KEYS[3], ARGV[5])
  return '{"status":"manual_review"}'
end
if job.leaseUntil and job.leaseUntil > now then return '{"status":"busy"}' end
if ARGV[7] ~= 'true' and job.nextAttemptAt and job.nextAttemptAt > now then return '{"status":"deferred"}' end
-- Preserve exact bytes: re-encoding objects in Redis can reorder keys between retries.
if not job.payload and ARGV[3] ~= 'null' then job.payload = ARGV[3] end
if job.payload and not job.firstAttemptAt then job.firstAttemptAt = now end
job.status = 'sending'
job.leaseToken = ARGV[2]
job.leaseUntil = now + 60000
job.attempts = job.attempts + 1
redis.call('SET', KEYS[1], cjson.encode(job))
redis.call('ZADD', KEYS[3], job.leaseUntil, ARGV[5])
return cjson.encode({status='claimed',job=job})
`;
const FINISH = `
local raw, orderRaw = redis.call('GET', KEYS[1]), redis.call('GET', KEYS[2])
if not raw or not orderRaw then return 'missing' end
local job, order = cjson.decode(raw), cjson.decode(orderRaw)
if job.leaseToken ~= ARGV[1] or job.status ~= 'sending' then return 'stale' end
job.status = ARGV[2]
job.leaseToken = nil
job.leaseUntil = nil
job.updatedAt = tonumber(ARGV[3])
if job.status == 'sent' then
  job.providerId = ARGV[4]
  job.sentAt = job.updatedAt
  job.lastErrorCode = nil
  redis.call('ZREM', KEYS[3], ARGV[6])
else
  job.lastErrorCode = ARGV[5]
  job.nextAttemptAt = job.updatedAt + math.min(3600000, 60000 * 2 ^ math.min(job.attempts - 1, 6))
  if order.paymentStatus == 'paid' then redis.call('ZADD', KEYS[3], job.nextAttemptAt, ARGV[6])
  else redis.call('ZREM', KEYS[3], ARGV[6]) end
end
local other = redis.call('GET', KEYS[4])
if other then other = cjson.decode(other) else other = {status='pending'} end
if job.status == 'sent' and other.status == 'sent' then order.emailStatus = 'sent'
elseif job.status == 'failed' or other.status == 'failed' or other.status == 'manual_review' then order.emailStatus = 'failed'
else order.emailStatus = 'pending' end
order.updatedAt = job.updatedAt
redis.call('SET', KEYS[1], cjson.encode(job))
redis.call('SET', KEYS[2], cjson.encode(order))
return job.status
`;
function emailStore(command, prefix, clock) {
  function keys(orderId, role) {
    if (!ORDER_ID.test(orderId || '') || !ROLES.has(role)) throw new Error('Invalid email job');
    return [prefix+'email:'+orderId+':'+role, prefix+'order:'+orderId, prefix+'email:due',
      prefix+'email:'+orderId+':'+(role === 'sales' ? 'customer' : 'sales')];
  }
  return {
    async claimEmail(orderId, role, payload, force = false) {
      const k = keys(orderId, role), token = randomBytes(16).toString('hex');
      return JSON.parse(await command(['EVAL', CLAIM, '3', ...k.slice(0,3), String(clock()), token,
        JSON.stringify(payload || null), '', orderId+'|'+role, String(SAFE_RETRY_MS), String(force)]));
    },
    async finishEmail(orderId, role, leaseToken, result) {
      const k = keys(orderId, role);
      return command(['EVAL', FINISH, '4', ...k, leaseToken, result.ok ? 'sent' : 'failed', String(clock()),
        result.providerId || '', result.errorCode || 'email_unavailable', orderId+'|'+role]);
    },
    async readEmail(orderId, role) {
      const raw = await command(['GET', keys(orderId, role)[0]]); return raw ? JSON.parse(raw) : null;
    },
    async dueEmails() {
      const lua = "return cjson.encode(redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', ARGV[1], 'LIMIT', 0, 10))";
      const value = JSON.parse(await command(['EVAL', lua, '1', prefix+'email:due', String(clock())]));
      return Array.isArray(value) ? value : [];
    }
  };
}
module.exports = {emailStore, SAFE_RETRY_MS};
