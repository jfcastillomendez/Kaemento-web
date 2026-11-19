/* Replace decorative arrow glyphs with vectors, including dynamically updated CTAs. */
(() => {
  const selector=/[↗↘↙↖→↓←↑↔⌄]/;
  const rotations={'↗':0,'↘':90,'↙':180,'↖':270,'→':45,'↓':135,'←':225,'↑':315};
  const skip='script,style,textarea,input,select,option,code,pre,svg,[contenteditable="true"]';
  function icon(glyph){
    const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
    for(const [key,value] of Object.entries({viewBox:'0 0 24 24',class:'site-icon',fill:'none',stroke:'currentColor','stroke-width':'1.6','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
    const path=document.createElementNS('http://www.w3.org/2000/svg','path');
    path.setAttribute('d',glyph==='⌄'?'m6 9 6 6 6-6':glyph==='↔'?'M4 12h16M8 8l-4 4 4 4m8-8 4 4-4 4':'M7 17 17 7M7 7h10v10');
    if(rotations[glyph])path.setAttribute('transform','rotate('+rotations[glyph]+' 12 12)');
    svg.append(path);return svg;
  }
  function render(root){
    if(!root.isConnected || root.parentElement?.closest(skip))return;
    const nodes=[];
    if(root.nodeType===Node.TEXT_NODE)nodes.push(root);
    else if(root.nodeType===Node.ELEMENT_NODE && !root.matches(skip)){
      const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
      while(walker.nextNode())nodes.push(walker.currentNode);
    }
    for(const node of nodes){
      if(!selector.test(node.data) || node.parentElement?.closest(skip))continue;
      const fragment=document.createDocumentFragment();
      for(const part of node.data.split(/([↗↘↙↖→↓←↑↔⌄])/))fragment.append(selector.test(part)?icon(part):document.createTextNode(part));
      node.replaceWith(fragment);
    }
  }
  render(document.body);
  new MutationObserver(records=>{
    for(const record of records){
      if(record.type==='characterData')render(record.target);
      else for(const node of record.addedNodes)render(node);
    }
  }).observe(document.body,{childList:true,characterData:true,subtree:true});
})();
