const {randomBytes} = require('node:crypto');
const CLAIM = `
local raw = redis.call('GET', KEYS[1])
local now = tonumber(ARGV[1])
if raw then
  local job = cjson.decode(raw)
  if job.fingerprint ~= ARGV[2] then return '{"status":"conflict"}' end
  if job.status == 'sent' then return '{"status":"sent"}' end
  if now - job.firstAttemptAt > 82800000 then return '{"status":"expired"}' end
  if job.leaseUntil > now then return '{"status":"busy"}' end
  job.leaseUntil = now + 60000
  job.leaseToken = ARGV[4]
  redis.call('SET', KEYS[1], cjson.encode(job), 'EX', 604800)
  return cjson.encode({status='claimed',payload=job.payload,leaseToken=job.leaseToken})
end
local count = redis.call('INCR', KEYS[2])
if count == 1 then redis.call('EXPIRE', KEYS[2], 3600) end
if count > 5 then return '{"status":"limited"}' end
local job = {fingerprint=ARGV[2],payload=ARGV[3],status='sending',firstAttemptAt=now,leaseUntil=now+60000,leaseToken=ARGV[4]}
redis.call('SET', KEYS[1], cjson.encode(job), 'EX', 604800)
return cjson.encode({status='claimed',payload=job.payload,leaseToken=job.leaseToken})
`;
const FINISH = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 'missing' end
local job = cjson.decode(raw)
if job.leaseToken ~= ARGV[1] then return 'stale' end
job.status = ARGV[2]
job.leaseUntil = 0
job.leaseToken = ''
redis.call('SET', KEYS[1], cjson.encode(job), 'EX', 604800)
return job.status
`;
function networkStore(command,prefix,clock) {
  const key=id=>{if(!/^[a-f0-9-]{36}$/.test(id))throw new Error('Invalid request');return prefix+'network:'+id;};
  return {
    async claimNetwork(id,fingerprint,payload,ipHash) {
      if(!/^[a-f0-9]{64}$/.test(ipHash))throw new Error('Invalid rate key');
      return JSON.parse(await command(['EVAL',CLAIM,'2',key(id),prefix+'network-rate:'+ipHash,String(clock()),fingerprint,JSON.stringify(payload),randomBytes(16).toString('hex')]));
    },
    async finishNetwork(id,lease,ok) {return command(['EVAL',FINISH,'1',key(id),lease,ok?'sent':'failed']);}
  };
}
module.exports={networkStore};
