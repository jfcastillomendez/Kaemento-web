const fs = require('node:fs'), os = require('node:os'), path = require('node:path'), net = require('node:net');
const {spawn} = require('node:child_process');
async function redisFixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(),'kaemento-orders-')), socket = path.join(dir,'redis.sock');
  const child = spawn(process.env.REDIS_SERVER_BIN, ['--port','0','--unixsocket',socket,'--save','','--appendonly','no','--dir',dir], {stdio:'ignore'});
  let error; child.on('error',e=>{error=e;});
  async function close() {
    if (child.exitCode === null && child.signalCode === null) {
      const ended = new Promise(resolve=>child.once('exit',resolve)); child.kill('SIGTERM'); await ended;
    }
    fs.rmSync(dir,{recursive:true,force:true});
  }
  for (let n=0;n<150&&!fs.existsSync(socket)&&!error&&child.exitCode===null;n++) await new Promise(r=>setTimeout(r,20));
  if (!fs.existsSync(socket)) { await close(); throw error || new Error('Local Redis unavailable'); }
  const command = args=>new Promise((resolve,reject)=>{
    const connection = net.createConnection(socket); let data = Buffer.alloc(0);
    connection.setTimeout(3000,()=>connection.destroy(new Error('Redis test timeout')));
    connection.on('error',reject);
    connection.on('connect',()=>connection.write('*'+args.length+'\r\n'+args.map(arg=>{const value=String(arg);return '$'+Buffer.byteLength(value)+'\r\n'+value+'\r\n';}).join('')));
    connection.on('data',chunk=>{
      data=Buffer.concat([data,chunk]); const end=data.indexOf('\r\n'); if(end<0)return;
      const type=String.fromCharCode(data[0]), first=data.subarray(1,end).toString();
      if(type==='$'&&Number(first)>=0&&data.length<end+2+Number(first)+2)return;
      connection.destroy(); if(type==='-')return reject(new Error(first));
      resolve(type===':'?Number(first):type==='$'?(Number(first)<0?null:data.subarray(end+2,end+2+Number(first)).toString()):first);
    });
  });
  return {command,close,transport:async(_url,options)=>Response.json({result:await command(JSON.parse(options.body))})};
}
module.exports={redisFixture};
