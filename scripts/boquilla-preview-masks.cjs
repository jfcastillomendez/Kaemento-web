// Compile imagegen's grout annotations into compact alpha masks for the requested recoloring tool.
// The base photographs are never rewritten. Requires Sharp in the local authoring environment.
const fs=require('node:fs'),path=require('node:path');
const sharp=require(process.env.KAEMENTO_SHARP_PATH || 'sharp');
const preview=require('../boquilla-simulador-config.js');
// Close short breaks and pinholes at seam intersections without globally widening the mask.
function closeSeams(alpha,width,height,radius) {
 const expanded=new Uint8Array(alpha.length),closed=new Uint8Array(alpha.length);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let value=0;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=x+dx,yy=y+dy;if(xx>=0 && xx<width && yy>=0 && yy<height)value=Math.max(value,alpha[yy*width+xx]);
  }
  expanded[y*width+x]=value;
 }
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  let value=255;
  for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
   const xx=Math.max(0,Math.min(width-1,x+dx)),yy=Math.max(0,Math.min(height-1,y+dy));value=Math.min(value,expanded[yy*width+xx]);
  }
  closed[y*width+x]=Math.max(alpha[y*width+x],value);
 }
 return closed;
}
(async()=>{
 const jobs=JSON.parse(fs.readFileSync(path.join(__dirname,'../docs/boquilla-simulador/anotaciones.json')));
 for(const job of jobs){
  const {data,info}=await sharp(job.path).resize(1536,1024,{fit:'fill'}).ensureAlpha().raw().toBuffer({resolveWithObject:true});
  const mask=Buffer.alloc(data.length);
  for(const [i,alpha,light] of preview.groutPixels(data)){
   const shade=Math.round(light*240);mask[i]=mask[i+1]=mask[i+2]=shade;mask[i+3]=Math.round(alpha*255);
  }
  const alpha=new Uint8Array(info.width*info.height);
  for(let i=0;i<alpha.length;i++)alpha[i]=mask[i*4+3];
  const closed=closeSeams(alpha,info.width,info.height,['cocina','bano','balcon','seis-estilos'].includes(job.name)?2:1);
  let repaired=0;
  for(let n=0;n<closed.length;n++)if(closed[n]>mask[n*4+3]){
   const i=n*4;let light=0,count=0;
   for(let dy=-2;dy<=2;dy++)for(let dx=-2;dx<=2;dx++){
    const x=n%info.width+dx,y=Math.floor(n/info.width)+dy;
    if(x>=0 && x<info.width && y>=0 && y<info.height){const j=(y*info.width+x)*4;if(mask[j+3]){light+=mask[j];count++;}}
   }
   const shade=count?Math.round(light/count):220;mask[i]=mask[i+1]=mask[i+2]=shade;mask[i+3]=closed[n];repaired++;
  }
  // Preserve sealant / movement joints at documented changes of plane.
  for(const exclusion of job.exclusions||[])for(let part=1;part<exclusion.points.length;part++){
   const [ax,ay]=exclusion.points[part-1],[bx,by]=exclusion.points[part],r=exclusion.radius;
   const length=(bx-ax)**2+(by-ay)**2;
   for(let y=Math.max(0,Math.floor(Math.min(ay,by)-r));y<=Math.min(info.height-1,Math.ceil(Math.max(ay,by)+r));y++){
    for(let x=Math.max(0,Math.floor(Math.min(ax,bx)-r));x<=Math.min(info.width-1,Math.ceil(Math.max(ax,bx)+r));x++){
     const t=length?Math.max(0,Math.min(1,((x-ax)*(bx-ax)+(y-ay)*(by-ay))/length)):0;
     if((x-ax-t*(bx-ax))**2+(y-ay-t*(by-ay))**2<=r*r)mask[(y*info.width+x)*4+3]=0;
    }
   }
  }
  const file=path.join(__dirname,'../assets/boquilla/simulador-2026-11',(job.asset||job.name)+'-mascara.webp');
  await sharp(mask,{raw:{width:info.width,height:info.height,channels:4}}).webp({lossless:true}).toFile(file);
  console.log(job.name,fs.statSync(file).size,'pixels with closed gaps:',repaired);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1;});
