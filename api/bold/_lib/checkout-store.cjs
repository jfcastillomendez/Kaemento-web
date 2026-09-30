// Atomic order creation: a network retry must return the original order.
const CLAIM = `
local previous = redis.call('GET', KEYS[1])
if previous then
  local entry = cjson.decode(previous)
  if entry.fingerprint ~= ARGV[1] then return '{"status":"conflict"}' end
  local order = redis.call('GET', ARGV[3] .. entry.orderId)
  if not order then return '{"status":"unavailable"}' end
  return cjson.encode({status='existing',order=cjson.decode(order)})
end
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('EXPIRE', KEYS[3], 3600) end
if count > 12 then return '{"status":"limited"}' end
local order = cjson.decode(ARGV[2])
if not redis.call('SET', KEYS[2], ARGV[2], 'NX') then return '{"status":"unavailable"}' end
redis.call('SET', KEYS[1], cjson.encode({fingerprint=ARGV[1],orderId=order.orderId}), 'EX', 86400)
return cjson.encode({status='created',order=order})
`;
function checkoutStore(command, prefix) {
  return {
    async claimCheckout(id, order, fingerprint, ipHash) {
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(fingerprint) || !/^[a-f0-9]{64}$/.test(ipHash)) throw new Error('Invalid checkout request');
      return JSON.parse(await command(['EVAL',CLAIM,'3',prefix+'checkout:'+id,prefix+'order:'+order.orderId,
        prefix+'checkout-rate:'+ipHash,fingerprint,JSON.stringify(order),prefix+'order:']));
    }
  };
}
module.exports = {checkoutStore};
