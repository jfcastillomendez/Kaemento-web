// Public visual references. No pricing or payment authorization lives here.
((root,factory)=>{
  if(typeof module==='object' && module.exports)module.exports=factory();
  else root.KaementoBoquillaPreview=factory();
})(typeof window==='object'?window:globalThis,()=>{
  // Label swatch references; chocolate visually balanced toward neutral brown per KAEMENTO.
  const tones={
    'extra-blanca':{label:'Extra blanca',rgb:[243,230,228]},
    beige:{label:'Beige',rgb:[254,206,162]},
    chocolate:{label:'Chocolate',rgb:[139,96,65]},
    negra:{label:'Negra',rgb:[35,35,35]},
    gris:{label:'Gris',rgb:[197,172,169]}
  };
  const scenes={cocina:'Cocina',bano:'Baño',balcon:'Balcón',piscina:'Piscina',jacuzzi:'Jacuzzi','seis-estilos':'6 enchapes'};
  const assets={cocina:'cocina-replanteo-v2',bano:'bano-replanteo-v2',jacuzzi:'jacuzzi-azul-v2','seis-estilos':'seis-estilos-azul-v2'};
  const assetName=scene=>assets[scene]||scene;
  // Only the dedicated chroma annotation identifies grout. Never recolor the whole photo.
  function groutPixels(plate) {
    const pixels=[];
    for(let i=0;i<plate.length;i+=4){
      const r=plate[i],g=plate[i+1],b=plate[i+2];
      const chroma=Math.min(r,b)-g;
      if(chroma>20 && r>40 && b>35 && (Math.max(r,b)>150 || Math.min(r,b)>Math.max(r,b)*.68)){
        const alpha=Math.min(1,(chroma-20)/45);
        const light=Math.max(.45,Math.min(1.05,Math.max(r,b)/245));
        pixels.push([i,alpha,light]);
      }
    }
    return pixels;
  }
  function maskPixels(mask) {
    const pixels=[];
    for(let i=0;i<mask.length;i+=4)if(mask[i+3])pixels.push([i,mask[i+3]/255,mask[i]/240]);
    return pixels;
  }
  function recolor(original,pixels,tone) {
    if(!tones[tone])throw new Error('Unknown grout tone');
    const result=new Uint8ClampedArray(original),rgb=tones[tone].rgb;
    for(const [i,alpha,light] of pixels){
      for(let c=0;c<3;c++)result[i+c]=Math.round(original[i+c]*(1-alpha)+Math.min(255,rgb[c]*light)*alpha);
    }
    return result;
  }
  return {tones,scenes,assets,assetName,groutPixels,maskPixels,recolor};
});
