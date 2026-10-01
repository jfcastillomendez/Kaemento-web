const campaign = require('../../../microcemento-launch-config.js');
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
-- A persisted request keeps its price; the campaign gate applies only to new orders.
if ARGV[9] ~= 'true' or tonumber(ARGV[4]) < tonumber(ARGV[5]) or tonumber(ARGV[4]) >= tonumber(ARGV[6])
  or redis.call('SCARD', KEYS[4]) + tonumber(ARGV[7]) >= tonumber(ARGV[8]) then
  return '{"status":"campaign_closed"}'
end
local count = redis.call('INCR', KEYS[3])
if count == 1 then redis.call('EXPIRE', KEYS[3], 3600) end
if count > 12 then return '{"status":"limited"}' end
local order = cjson.decode(ARGV[2])
if not redis.call('SET', KEYS[2], ARGV[2], 'NX') then return '{"status":"unavailable"}' end
redis.call('SET', KEYS[1], cjson.encode({fingerprint=ARGV[1],orderId=order.orderId}), 'EX', 86400)
return cjson.encode({status='created',order=order})
`;
function checkoutStore(command, prefix, clock = Date.now) {
  return {
    async claimCheckout(id, order, fingerprint, ipHash) {
      if (!/^[a-f0-9-]{36}$/.test(id) || !/^[a-f0-9]{64}$/.test(fingerprint) || !/^[a-f0-9]{64}$/.test(ipHash)) throw new Error('Invalid checkout request');
      return JSON.parse(await command(['EVAL',CLAIM,'4',prefix+'checkout:'+id,prefix+'order:'+order.orderId,
        prefix+'checkout-rate:'+ipHash,prefix+'campaign:confirmed-orders',fingerprint,JSON.stringify(order),prefix+'order:',
        String(clock()),String(Date.parse(campaign.startsAt)),String(Date.parse(campaign.endsAt)),
        String(campaign.historicalOrders),String(campaign.maxOrders),String(campaign.enabled)]));
    }
  };
}
module.exports = {checkoutStore};
