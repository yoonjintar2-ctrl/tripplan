/* Local hair-color rendering. Legacy clothing/accessory settings are ignored. */
(() => {
  'use strict';
  const SIZE = 448, cache = new Map(), images = new Map();
  const BASE = './assets/studio/';
  const prepared=new Map();
  const COLORS = [['original','기본','#292525'],['yellow','노랑','#e3bc60'],['brown','갈색','#835336'],['white','흰색','#eeeae5']];
  const clamp = (x,a,b) => Math.max(a,Math.min(b,Number(x)||0));
  const clean = value => {
    const source=value && typeof value==='object'?value:{};
    const result={hair:COLORS.some(x=>x[0]===source.hair)?source.hair:'original'};
    if(/^extra-(female|male)-(00[1-9]|01\d|02[0-5])$/.test(source.variant||''))result.variant=source.variant;
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
    // Detect the two separate dark eye components, not the widest eyebrow scanline.
    const seen=new Uint8Array(w*h),components=[];
    const eyeDark=i=>data[i*4]<108&&data[i*4+1]<90&&data[i*4+2]<84;
    for(let y=Math.round(h*.29);y<h*.70;y++)for(let x=Math.round(w*.21);x<w*.79;x++){
      const start=y*w+x;if(seen[start]||!eyeDark(start))continue;
      const q=[start];seen[start]=1;let head=0,minX=x,maxX=x,minY=y,maxY=y,sx=0,sy=0;
      while(head<q.length){const i=q[head++],px=i%w,py=Math.floor(i/w);sx+=px;sy+=py;minX=Math.min(minX,px);maxX=Math.max(maxX,px);minY=Math.min(minY,py);maxY=Math.max(maxY,py);
        for(const j of [i-1,i+1,i-w,i+w]){const jx=j%w,jy=Math.floor(j/w);if(jx<w*.19||jx>w*.81||jy<h*.25||jy>h*.72||seen[j]||!eyeDark(j))continue;seen[j]=1;q.push(j);}}
      const area=q.length,bw=maxX-minX+1,bh=maxY-minY+1;
      if(area>=w*h*.00009&&area<w*h*.008&&bw<w*.16&&bh<h*.115)components.push({x:sx/area/w,y:sy/area/h,width:bw/w,height:bh/h,area});
    }
    let eyeL={x:cx-fw*.235,y:.5},eyeR={x:cx+fw*.235,y:.5},score=-Infinity;
    for(const l of components)for(const r of components){const d=r.x-l.x;
      if(l.x>.50||r.x<.52||d<.15||d>.36||Math.abs(l.y-r.y)>.026||l.area/r.area<.35||l.area/r.area>2.85||Math.abs((l.x+r.x)/2-.53)>.08)continue;
      const y=(l.y+r.y)/2;if(y<.33||y>.62)continue;
      const tall=(Math.min(l.height/l.width,1.5)+Math.min(r.height/r.width,1.5));
      const value=tall*2+y*5-Math.abs(l.y-r.y)*70-Math.abs((l.x+r.x)/2-.5)*15-Math.abs(d-.25)*7;
      if(value>score){score=value;eyeL=l;eyeR=r;}
    }
    const eyeY=(eyeL.y+eyeR.y)/2,eyeX=(eyeL.x+eyeR.x)/2,eyeDistance=eyeR.x-eyeL.x;
    const neckRow=rows[Math.min(h-1,Math.round(neckY*h)-3)],neckX=(neckRow.left+neckRow.right)/2/w;
    let chinY=neckY-.12;
    for(let y=Math.round((eyeY+.10)*h);y<neckY*h;y++)if(rows[y].width>0&&rows[y].width<fw*w*.46){chinY=y/h;break;}
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
    return {cx,fw,eyeX,eyeY,eyeL:eyeL.x,eyeR:eyeR.x,eyeDistance,eyeTilt:Math.atan2(eyeR.y-eyeL.y,eyeDistance),eyeScore:score,faceTop,neckX:Number.isFinite(neckX)?neckX:cx,neckWidth:clamp(neckRow.width/w,.12,.32),chinY:Math.min(chinY,neckY-.13),neckY:clamp(neckY,.60,.94),hairTop:hairTop<h?hairTop/h:faceTop,hw,mask};
  }
  async function prepare(person){
    const source=sourceFor(person);if(prepared.has(source))return prepared.get(source);
    const job=(async()=>{
      const im=await load(source),raw=canvas(),rc=raw.getContext('2d',{willReadFrequently:true});rc.drawImage(im,0,0,SIZE,SIZE);
      const pixels=rc.getImageData(0,0,SIZE,SIZE),detected=analyze(pixels.data),key=clean(person.appearance).variant||keyFor(person);
      const a={...detected,...window.CaptainAvatarFits?.[key]};
      if(/^extra-male-(001|006|011|016|021)$/.test(key))a.mask.fill(0);
      // One normalized coordinate system is shared by all wardrobe choices.
      const scale=Math.min(1,.235/a.eyeDistance,.36/Math.max(.25,a.neckY-a.eyeY),.405/Math.max(.3,a.eyeY-a.hairTop));
      const dx=.5-a.eyeX*scale,dy=.445-a.eyeY*scale;
      return {raw,pixels,a,scale,dx,dy};
    })();prepared.set(source,job);job.catch(()=>prepared.delete(source));if(prepared.size>36)prepared.delete(prepared.keys().next().value);return job;
  }
  // Gaussian feathering has a continuous edge on both sides of the hair mask.
  // Color confidence excludes warm skin so the forehead keeps its original tone.
  function featherMask(mask,w,h,radius=7){
    const kernel=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*(radius/2.4)**2)));
    const sum=kernel.reduce((a,b)=>a+b,0);for(let i=0;i<kernel.length;i++)kernel[i]/=sum;
    const temp=new Float32Array(w*h),out=new Float32Array(w*h);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-radius;k<=radius;k++)temp[y*w+x]+=mask[y*w+Math.max(0,Math.min(w-1,x+k))]*kernel[k+radius];
    for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let k=-radius;k<=radius;k++)out[y*w+x]+=temp[Math.max(0,Math.min(h-1,y+k))*w+x]*kernel[k+radius];
    return out;
  }
  async function compose(person) {
    const look=clean(person.appearance),id=sourceFor(person)+'|5|'+JSON.stringify(look);
    if(cache.has(id))return cache.get(id);
    const pending=(async()=>{
      const base=await prepare(person),c=canvas(),ctx=c.getContext('2d'),original=base.pixels;
      const p=ctx.createImageData(SIZE,SIZE);p.data.set(original.data);
      const target={yellow:[232,190,87],brown:[139,87,48],white:[243,238,229]}[look.hair];
      if(target){
        const mask=base.a.mask,soft=featherMask(mask,SIZE,SIZE);
        for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
          const i=y*SIZE+x,k=i*4,r=original.data[k],g=original.data[k+1],b=original.data[k+2];
          if(!original.data[k+3]||soft[i]<.002)continue;
          const skin=clamp((r-105)/65,0,1)*clamp((r-g-8)/18,0,1)*clamp((g-b-3)/12,0,1);
          const confidence=mask[i]?1:clamp((180-Math.max(r,g,b))/50,0,1);
          // Keep eyes and eyebrows unchanged even when their dark pixels touch hair.
          const eyeY=base.a.eyeY-.018,rx=Math.max(.06,base.a.eyeDistance*.30),ry=.085;
          const d=Math.min(...[base.a.eyeL,base.a.eyeR].map(ex=>Math.hypot((x/SIZE-ex)/rx,(y/SIZE-eyeY)/ry)));
          const eyeFade=clamp((d-.9)/.35,0,1);
          const alpha=clamp(soft[i]*1.08,0,1)*confidence*(1-skin)*eyeFade;
          const lum=(r+g+b)/3,shade=.43+.57*Math.pow(clamp(lum/120,0,1),.65);
          for(let z=0;z<3;z++)p.data[k+z]=Math.round(original.data[k+z]*(1-alpha)+target[z]*shade*alpha);
        }
      }
      ctx.putImageData(p,0,0);
      return {url:c.toDataURL('image/webp',.94),anchors:{...base.a,mask:undefined},placements:[]};
    })();cache.set(id,pending);pending.catch(()=>cache.delete(id));if(cache.size>180)cache.delete(cache.keys().next().value);return pending;
  }
  function decorate(root=document) {
    const nodes=[...(root.matches?.('img[data-traveler-look]')?[root]:[]),...root.querySelectorAll?.('img[data-traveler-look]')||[]];
    for(const img of nodes){const stamp=img.dataset.travelerLook;if(img.dataset.renderedLook===stamp)continue;img.dataset.renderedLook=stamp;try{const person=JSON.parse(stamp);compose(person).then(({url})=>{if(img.dataset.travelerLook===stamp)img.src=url;}).catch(()=>{img.title='캐릭터 이미지 로딩 중 — 다시 열어주세요';});}catch{}}
  }
  let draft=null,apply=null,previewRequest=0;
  const $=id=>document.getElementById(id);
  function updatePreview() {
    const request=++previewRequest;
    $('lookStatus').textContent='머리색 적용 중…';
    compose(draft).then(({url})=>{if(request!==previewRequest)return;$('lookPreview').src=url;$('lookStatus').textContent='';}).catch(()=>{if(request===previewRequest)$('lookStatus').textContent='이미지 로딩에 실패했습니다. 다른 옵션을 눌러 다시 시도해 주세요.';});
    document.querySelectorAll('[data-hair-color]').forEach(b=>b.setAttribute('aria-pressed',String(draft.appearance.hair===b.dataset.hairColor)));
  }
  function open(person,onApply) {
    draft={avatar:keyFor(person),appearance:clean(person.appearance)};apply=onApply;
    $('lookPreview').src=sourceFor(draft);
    $('hairColors').innerHTML=COLORS.map(([id,name,color])=>`<button type="button" data-hair-color="${id}" aria-pressed="false"><i style="background:${color}"></i>${name}</button>`).join('');
    document.querySelectorAll('[data-hair-color]').forEach(b=>b.addEventListener('click',()=>{draft.appearance.hair=b.dataset.hairColor;updatePreview();}));
    updatePreview();$('lookDialog').showModal();
  }
  function init() {
    if(!$('lookDialog'))return;
    $('lookApply').addEventListener('click',()=>{apply?.({...draft,appearance:clean(draft.appearance)});$('lookDialog').close();});
    $('lookReset').addEventListener('click',()=>{const variant=draft.appearance.variant;draft.appearance=clean({variant});updatePreview();});
    const observer=new MutationObserver(records=>{for(const r of records){if(r.type==='attributes')decorate(r.target);else for(const n of r.addedNodes)if(n.nodeType===1)decorate(n);}});
    observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['data-traveler-look']});decorate();
  }
  window.CaptainStudio={open,clean,sourceFor,compose,analyze,decorate,featherMask};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
