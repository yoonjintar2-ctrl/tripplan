/* Avatar composition is local. Only the selected IDs and adjustments are saved. */
(() => {
  'use strict';
  const SIZE = 448, cache = new Map(), images = new Map();
  const BASE = './assets/studio/';
  const CATALOG = [
    ['glasses','안경',[['sunglasses','선글라스'],['square-glasses','사각안경'],['gold-glasses','금테안경'],['rimless-glasses','무테안경']]],
    ['outfit','의상',[['hoodie','후디'],['shirt','셔츠'],['dress','드레스'],['offshoulder','오프숄더'],['power-shoulder','파워숄더'],['leather','가죽재킷'],['denim','청재킷']]],
    ['hat','모자',[['beret','화가모자'],['newsboy','빵모자'],['straw','밀짚모자'],['beanie','비니'],['head-sunglasses','머리에 올린 선글라스']]],
    ['earrings','귀걸이',[['hoop','링귀걸이'],['diamond','작은 큐빅 귀걸이']]],
    ['neck','목',[['scarf','머플러']]],
    ['ears','귀',[['earmuffs','양털 귀마개']]],
    ['makeup','메이크업',[['shadow','섀도우 화장']]]
  ];
  const COLORS = [['original','기본','#292525'],['yellow','노랑','#e3bc60'],['brown','갈색','#835336'],['white','흰색','#eeeae5']];
  const allowed = Object.fromEntries(CATALOG.map(([id,,options]) => [id, new Set(options.map(x=>x[0]))]));
  const clamp = (x,a,b) => Math.max(a,Math.min(b,Number(x)||0));
  const clean = value => {
    const source = value && typeof value === 'object' ? value : {}, result = {hair:COLORS.some(x=>x[0]===source.hair)?source.hair:'original',adjustments:{}};
    if (/^extra-(female|male)-(00[1-9]|01\d|02[0-5])$/.test(source.variant || '')) result.variant=source.variant;
    for(const [category] of CATALOG) {
      if(allowed[category].has(source[category])) result[category]=source[category];
      const a=source.adjustments?.[category];
      if(a)result.adjustments[category]={x:clamp(a.x,-.12,.12),y:clamp(a.y,-.12,.12),scale:clamp(a.scale||1,.75,1.25)};
    }
    return result;
  };
  const keyFor = person => /^(female|male)-(00[1-9]|0[1-9]\d|1\d\d|200)$/.test(person?.avatar||'')?person.avatar:'male-001';
  const sourceFor = person => {const look=clean(person.appearance);return look.variant?BASE+look.variant+'.webp':'./assets/avatars-clay/'+keyFor(person)+'.webp?v=3';};
  function load(url) {
    if(!images.has(url))images.set(url,new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>{images.delete(url);reject(Error('이미지를 불러오지 못했습니다.'));};img.src=url;}));
    return images.get(url);
  }
  function canvas() {const c=document.createElement('canvas');c.width=c.height=SIZE;return c;}
  function analyze(data,w=SIZE,h=SIZE) {
    const skin = (x,y) => {const p=(y*w+x)*4,r=data[p],g=data[p+1],b=data[p+2];return r>148&&r-g>9&&g-b>5&&r-b<110;};
    const rows=[];
    for(let y=0;y<h;y++){let left=w,right=-1;for(let x=Math.round(w*.18);x<w*.82;x++)if(skin(x,y)){left=Math.min(left,x);right=x;}rows.push({left,right,width:Math.max(0,right-left)});}
    const middle=rows.slice(Math.round(h*.32),Math.round(h*.7));
    const widest=middle.reduce((a,b)=>a.width>b.width?a:b,{width:0,left:w*.3,right:w*.7});
    const fw=clamp(widest.width/w,.30,.68), cx=(widest.left+widest.right)/2/w;
    let faceTop=rows.findIndex((r,y)=>y>h*.16&&r.width>fw*w*.46)/h;
    if(faceTop<.1)faceTop=.30;
    let neckY=.85;
    for(let y=Math.round(h*.55);y<h*.95;y++){let count=0;for(let x=Math.round(w*(cx-.055));x<w*(cx+.055);x++)if(skin(x,y))count++;if(count>w*.06)neckY=y/h;}
    let eyeY=faceTop+.20, best=0;
    for(let y=Math.round(h*.34);y<h*.67;y++) {
      let count=0;
      for(let x=Math.round(w*(cx-fw*.34));x<w*(cx+fw*.34);x++) {const p=(y*w+x)*4;if(data[p]<65&&data[p+1]<60&&data[p+2]<60&&rows[y].left<x-3&&rows[y].right>x+3)count++;}
      const weighted=count*(y>h*(faceTop+.09)?1:.2);
      if(weighted>best){best=weighted;eyeY=y/h;}
    }
    eyeY=clamp(eyeY,.36,.66);
    const mask=new Uint8Array(w*h),queue=new Int32Array(w*h);let tail=0,head=0;
    const dark=i=>data[i*4]<173&&data[i*4+1]<154&&data[i*4+2]<147&&data[i*4+3]>0;
    for(let y=0;y<h*.26;y++)for(let x=Math.round(w*.08);x<w*.92;x++){const i=y*w+x;if(dark(i)&&!mask[i]){mask[i]=1;queue[tail++]=i;}}
    while(head<tail){const i=queue[head++],x=i%w,y=Math.floor(i/w);for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&!mask[j]&&dark(j)){mask[j]=1;queue[tail++]=j;}}
    // Remove thin dark face outlines connected to the hair, keeping solid strands.
    const solid=new Uint8Array(w*h);for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(mask[i]&&mask[i-2]&&mask[i+2]&&mask[i-2*w]&&mask[i+2*w])solid[i]=1;}
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){const i=y*w+x;if(mask[i]&&!solid[i]&&!solid[i-1]&&!solid[i+1]&&!solid[i-w]&&!solid[i+w]&&!solid[i-2]&&!solid[i+2]&&!solid[i-2*w]&&!solid[i+2*w])mask[i]=0;}
    let hairLeft=w,hairRight=0,hairTop=h;
    for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%w,y=Math.floor(i/w);if(y<h*.6){hairLeft=Math.min(hairLeft,x);hairRight=Math.max(hairRight,x);hairTop=Math.min(hairTop,y);}}
    const hw=hairRight>hairLeft?clamp((hairRight-hairLeft)/w,fw,.88):fw*1.1;
    return {cx,fw,eyeY,faceTop,neckY:clamp(neckY,.60,.94),hairTop:hairTop<h?hairTop/h:faceTop,hw,mask};
  }
  async function compose(person) {
    const look=clean(person.appearance),id=sourceFor(person)+'|'+JSON.stringify(look);
    if(cache.has(id))return cache.get(id);
    const pending=(async()=>{
      const image=await load(sourceFor(person)),c=canvas(),ctx=c.getContext('2d',{willReadFrequently:true});
      ctx.fillStyle='#fff';ctx.fillRect(0,0,SIZE,SIZE);
      const dressed=Boolean(look.outfit||look.neck),scale=dressed?.84:1,offset=(1-scale)/2;
      ctx.drawImage(image,image.width*.035,0,image.width*.93,image.height,offset*SIZE,0,scale*SIZE,scale*SIZE);
      const pixels=ctx.getImageData(0,0,SIZE,SIZE),a=analyze(pixels.data),hairLayer=canvas(),hairCtx=hairLayer.getContext('2d'),hairPixels=hairCtx.createImageData(SIZE,SIZE);
      const target={yellow:[232,190,87],brown:[139,87,48],white:[243,238,229]}[look.hair];
      for(let i=0;i<a.mask.length;i++)if(a.mask[i]){
        const p=i*4;
        if(target){const light=(pixels.data[p]+pixels.data[p+1]+pixels.data[p+2])/3;const shade=.43+.57*Math.pow(clamp(light/120,0,1),.65);for(let k=0;k<3;k++)pixels.data[p+k]=Math.round(target[k]*shade);}
        for(let k=0;k<4;k++)hairPixels.data[p+k]=pixels.data[p+k];
      }
      ctx.putImageData(pixels,0,0);hairCtx.putImageData(hairPixels,0,0);
      const sprite=async(name,category,x,y,width,height)=>{
        if(!name)return;
        const im=await load(BASE+name+'.webp'),adj=look.adjustments[category]||{x:0,y:0,scale:1};
        width*=adj.scale; height=(height||width*im.height/im.width)*(height?adj.scale:1);
        ctx.drawImage(im,(x+adj.x-width/2)*SIZE,(y+adj.y)*SIZE,width*SIZE,height*SIZE);
      };
      if(look.outfit) {
        if(['dress','offshoulder'].includes(look.outfit)){
          // A shared shoulder mesh joins the detected neck; long hair is restored above it.
          const y=a.neckY-.025;
          ctx.fillStyle='#fff';ctx.fillRect(0,y*SIZE,SIZE,(1-y)*SIZE);
          const skin=ctx.createLinearGradient(0,y*SIZE,0,SIZE);skin.addColorStop(0,'#f2d5c1');skin.addColorStop(1,'#dfbca5');ctx.fillStyle=skin;
          ctx.beginPath();ctx.moveTo((a.cx-.09)*SIZE,y*SIZE);ctx.lineTo((a.cx+.09)*SIZE,y*SIZE);
          ctx.bezierCurveTo((a.cx+.15)*SIZE,(y+.065)*SIZE,(a.cx+.36)*SIZE,(y+.025)*SIZE,(a.cx+.43)*SIZE,(y+.19)*SIZE);
          ctx.lineTo((a.cx+.45)*SIZE,SIZE);ctx.lineTo((a.cx-.45)*SIZE,SIZE);
          ctx.bezierCurveTo((a.cx-.43)*SIZE,(y+.10)*SIZE,(a.cx-.18)*SIZE,(y+.07)*SIZE,(a.cx-.09)*SIZE,y*SIZE);ctx.closePath();ctx.fill();
        }
        const top=look.outfit==='offshoulder'?a.neckY-.008:a.neckY-.06;
        await sprite(look.outfit,'outfit',a.cx,top,.87,Math.max(.25,1.035-top));
        ctx.drawImage(hairLayer,0,0);
      }
      await sprite(look.neck,'neck',a.cx,a.neckY-.025,a.fw*.80,.22);
      if(look.makeup==='shadow')for(const sign of [-1,1]){
        const x=(a.cx+sign*a.fw*.235)*SIZE,y=(a.eyeY-.022)*SIZE,r=a.fw*.14*SIZE;
        const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,'rgba(143,91,95,.25)');g.addColorStop(1,'rgba(143,91,95,0)');ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
      }
      if(look.earrings)for(const sign of [-1,1])await sprite(look.earrings,'earrings',a.cx+sign*a.fw*.47,a.eyeY+a.fw*.20,look.earrings==='hoop'?a.fw*.11:a.fw*.052,look.earrings==='hoop'?a.fw*.15:a.fw*.052);
      await sprite(look.ears,'ears',a.cx,Math.max(.01,a.hairTop),a.fw*1.36,a.eyeY-a.hairTop+a.fw*.40);
      if(look.hat) {
        const im=await load(BASE+look.hat+'.webp'),width=look.hat==='head-sunglasses'?a.fw*.92:Math.min(.91,Math.max(a.hw*.92,a.fw*(look.hat==='beanie'?1.13:1.24)));
        const height=width*im.height/im.width;
        const fittedHeight=look.hat==='head-sunglasses'?height:Math.min(height,a.eyeY-.12);
        const top=look.hat==='head-sunglasses'?Math.max(.025,a.faceTop-.14):Math.max(.012,a.eyeY-.105-fittedHeight);
        await sprite(look.hat,'hat',a.cx,top,width,fittedHeight);
      }
      if(look.glasses){const im=await load(BASE+look.glasses+'.webp'),width=a.fw*.90,height=width*im.height/im.width;await sprite(look.glasses,'glasses',a.cx,a.eyeY-height*.47,width);}
      return {url:c.toDataURL('image/webp',.94),anchors:{...a,mask:undefined}};
    })();
    cache.set(id,pending);
    pending.catch(()=>cache.delete(id));
    if(cache.size>180)cache.delete(cache.keys().next().value);
    return pending;
  }
  function decorate(root=document) {
    const nodes=[...(root.matches?.('img[data-traveler-look]')?[root]:[]),...root.querySelectorAll?.('img[data-traveler-look]')||[]];
    for(const img of nodes){const stamp=img.dataset.travelerLook;if(img.dataset.renderedLook===stamp)continue;img.dataset.renderedLook=stamp;try{const person=JSON.parse(stamp);compose(person).then(({url})=>{if(img.dataset.travelerLook===stamp)img.src=url;}).catch(()=>{img.title='캐릭터 이미지 로딩 중 — 다시 열어주세요';});}catch{}}
  }
  let draft=null,apply=null,activeCategory='glasses',previewRequest=0;
  const $=id=>document.getElementById(id);
  function updatePreview() {
    const request=++previewRequest;
    $('lookStatus').textContent='스타일을 입히는 중…';
    compose(draft).then(({url})=>{if(request!==previewRequest)return;$('lookPreview').src=url;$('lookStatus').textContent='';}).catch(()=>{if(request===previewRequest)$('lookStatus').textContent='이미지 로딩에 실패했습니다. 다른 옵션을 눌러 다시 시도해 주세요.';});
    document.querySelectorAll('[data-look-option]').forEach(b=>b.setAttribute('aria-pressed',String((draft.appearance[b.dataset.lookCategory]||'')===b.dataset.lookOption)));
    document.querySelectorAll('[data-hair-color]').forEach(b=>b.setAttribute('aria-pressed',String(draft.appearance.hair===b.dataset.hairColor)));
  }
  function adjustmentUI() {
    const adj=draft.appearance.adjustments[activeCategory]||{x:0,y:0,scale:1};
    $('lookFitCategory').value=activeCategory;
    for(const axis of ['x','y','scale'])$('lookFit-'+axis).value=axis==='scale'?Math.round(adj[axis]*100):Math.round(adj[axis]*100);
  }
  function open(person,onApply) {
    draft={avatar:keyFor(person),appearance:clean(person.appearance)};apply=onApply;
    $('lookPreview').src=sourceFor(draft);
    $('hairColors').innerHTML=COLORS.map(([id,name,color])=>`<button type="button" data-hair-color="${id}" aria-pressed="false"><i style="background:${color}"></i>${name}</button>`).join('');
    $('lookOptions').innerHTML=CATALOG.map(([category,label,options])=>`<fieldset><legend>${label}</legend><div class="look-chips"><button type="button" data-look-category="${category}" data-look-option="" aria-pressed="false">없음</button>${options.map(([id,name])=>`<button type="button" data-look-category="${category}" data-look-option="${id}" aria-pressed="false">${name}</button>`).join('')}</div></fieldset>`).join('');
    $('lookFitCategory').innerHTML=CATALOG.filter(x=>x[0]!=='makeup').map(([id,name])=>`<option value="${id}">${name}</option>`).join('');
    document.querySelectorAll('[data-look-option]').forEach(b=>b.addEventListener('click',()=>{const category=b.dataset.lookCategory;draft.appearance[category]=b.dataset.lookOption;if(category!=='makeup'){activeCategory=category;adjustmentUI();}updatePreview();}));
    document.querySelectorAll('[data-hair-color]').forEach(b=>b.addEventListener('click',()=>{draft.appearance.hair=b.dataset.hairColor;updatePreview();}));
    adjustmentUI();updatePreview();$('lookDialog').showModal();
  }
  function init() {
    if(!$('lookDialog'))return;
    $('lookApply').addEventListener('click',()=>{apply?.({...draft,appearance:clean(draft.appearance)});$('lookDialog').close();});
    $('lookReset').addEventListener('click',()=>{const variant=draft.appearance.variant;draft.appearance=clean({variant});adjustmentUI();updatePreview();});
    $('lookFitCategory').addEventListener('change',e=>{activeCategory=e.target.value;adjustmentUI();});
    for(const axis of ['x','y','scale'])$('lookFit-'+axis).addEventListener('input',e=>{const adj=draft.appearance.adjustments[activeCategory]||{x:0,y:0,scale:1};adj[axis]=Number(e.target.value)/100;draft.appearance.adjustments[activeCategory]=adj;updatePreview();});
    const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')decorate(r.target);else for(const n of r.addedNodes)if(n.nodeType===1)decorate(n);}});
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-traveler-look']});decorate();
  }
  window.CaptainStudio={open,clean,sourceFor,compose,analyze,decorate,catalog:CATALOG};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
