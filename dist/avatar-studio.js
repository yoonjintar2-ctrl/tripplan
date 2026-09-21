/* Avatar composition is local. Only the selected IDs and adjustments are saved. */
(() => {
  'use strict';
  const SIZE = 448, cache = new Map(), images = new Map();
  const BASE = './assets/studio/';
  const prepared=new Map();
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
  async function compose(person) {
    const look=clean(person.appearance),id=sourceFor(person)+'|4|'+JSON.stringify(look);
    if(cache.has(id))return cache.get(id);
    const pending=(async()=>{
      const base=await prepare(person),{raw,scale,dx,dy}=base,original=base.pixels,a={...base.a},c=canvas(),ctx=c.getContext('2d');
      for(const k of ['cx','eyeX','eyeL','eyeR','neckX'])a[k]=dx+a[k]*scale;
      for(const k of ['eyeY','faceTop','neckY','chinY','hairTop'])a[k]=dy+a[k]*scale;
      for(const k of ['fw','hw','eyeDistance','neckWidth'])a[k]*=scale;
      const colored=canvas(),cc=colored.getContext('2d'),p=cc.createImageData(SIZE,SIZE);p.data.set(original.data);
      const hairLayer=canvas(),hc=hairLayer.getContext('2d'),hp=hc.createImageData(SIZE,SIZE),neckLayer=canvas(),nc=neckLayer.getContext('2d'),np=nc.createImageData(SIZE,SIZE);
      const target={yellow:[232,190,87],brown:[139,87,48],white:[243,238,229]}[look.hair],mask=base.a.mask;
      // A 5px soft root transition replaces the old hard color boundary.
      const blendAt=(x,y)=>{let weight=0,sum=0;for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){const px=x+ox,py=y+oy;if(px<0||px>=SIZE||py<0||py>=SIZE)continue;const w=(3-Math.abs(ox))*(3-Math.abs(oy));sum+=w;weight+=mask[py*SIZE+px]*w;}return weight/sum;};
      for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){
        const i=y*SIZE+x,k=i*4,r=original.data[k],g=original.data[k+1],b=original.data[k+2];
        const faceInterior=y/SIZE>base.a.eyeY-.11&&y/SIZE<base.a.chinY&&x/SIZE>base.a.eyeL-.035&&x/SIZE<base.a.eyeR+.035;
        let alpha=0;if(!faceInterior&&mask[i])alpha=blendAt(x,y);
        if(alpha>0){if(target){const lum=(r+g+b)/3,shade=.43+.57*Math.pow(clamp(lum/120,0,1),.65);for(let z=0;z<3;z++)p.data[k+z]=Math.round(original.data[k+z]*(1-alpha)+target[z]*shade*alpha);}for(let z=0;z<3;z++)hp.data[k+z]=p.data[k+z];hp.data[k+3]=Math.round(alpha*255);}
        const skin=r>100&&r-g>7&&g-b>4&&r-b<155;
        if(skin&&!mask[i]&&y/SIZE<=base.a.neckY+.006){for(let z=0;z<4;z++)np.data[k+z]=original.data[k+z];}
      }
      cc.putImageData(p,0,0);hc.putImageData(hp,0,0);nc.putImageData(np,0,0);
      const drawLayer=layer=>ctx.drawImage(layer,dx*SIZE,dy*SIZE,scale*SIZE,scale*SIZE);
      ctx.fillStyle='#fff';ctx.fillRect(0,0,SIZE,SIZE);drawLayer(colored);
      const placements=[];
      const sprite=async(name,category,x,y,width,height,options={})=>{
        if(!name)return;
        const im=await load(BASE+(name==='head-sunglasses'?'sunglasses':name)+'.webp?v=4'),adj=look.adjustments[category]||{x:0,y:0,scale:1};
        width*=adj.scale;height=(height||width*im.height/im.width)*(height?adj.scale:1);
        const left=(x+adj.x-width/2)*SIZE,top=(y+adj.y)*SIZE;
        ctx.save();
        if(options.frontCollar){ctx.beginPath();ctx.rect(0,0,SIZE,SIZE);ctx.rect(left+width*SIZE*.30,top-1,width*SIZE*.40,height*SIZE*.13+1);ctx.clip('evenodd');}
        if(options.tilt){ctx.translate((x+adj.x)*SIZE,top+height*SIZE*.5);ctx.rotate(options.tilt);ctx.drawImage(im,-width*SIZE/2,-height*SIZE/2,width*SIZE,height*SIZE);}
        else ctx.drawImage(im,left,top,width*SIZE,height*SIZE);
        ctx.restore();placements.push({name,category,x:x+adj.x,y:y+adj.y,width,height});
      };
      if(look.outfit){
        // Remove the old shirt behind the new garment, preserving the face and hair later.
        const cut=a.chinY+.025;ctx.fillStyle='#fff';ctx.fillRect(0,cut*SIZE,SIZE,(1-cut)*SIZE);
        if(['dress','offshoulder'].includes(look.outfit)){
          const y=a.neckY-.035,skin=ctx.createLinearGradient(0,y*SIZE,0,SIZE);skin.addColorStop(0,'#f2d5c1');skin.addColorStop(1,'#dfbca5');ctx.fillStyle=skin;
          ctx.beginPath();ctx.moveTo((a.neckX-a.neckWidth*.45)*SIZE,y*SIZE);ctx.lineTo((a.neckX+a.neckWidth*.45)*SIZE,y*SIZE);ctx.bezierCurveTo((a.neckX+.14)*SIZE,(y+.055)*SIZE,(a.neckX+.34)*SIZE,(y+.025)*SIZE,(a.neckX+.40)*SIZE,(y+.14)*SIZE);ctx.lineTo((a.neckX+.43)*SIZE,SIZE);ctx.lineTo((a.neckX-.43)*SIZE,SIZE);ctx.bezierCurveTo((a.neckX-.40)*SIZE,(y+.09)*SIZE,(a.neckX-.17)*SIZE,(y+.06)*SIZE,(a.neckX-a.neckWidth*.45)*SIZE,y*SIZE);ctx.closePath();ctx.fill();
        }
        const top=look.outfit==='offshoulder'?a.neckY+.04:a.neckY-(look.outfit==='shirt'?.10:.065);
        await sprite(look.outfit,'outfit',a.neckX,top,.84,1.055-top,{frontCollar:!['dress','offshoulder'].includes(look.outfit)});
        drawLayer(neckLayer);drawLayer(hairLayer);
      }
      if(look.neck){await sprite(look.neck,'neck',a.neckX,a.neckY-.07,a.neckWidth*2.2,.23,{frontCollar:true});drawLayer(neckLayer);drawLayer(hairLayer);}
      if(look.makeup==='shadow')for(const x of [a.eyeL,a.eyeR]){const y=(a.eyeY-.025)*SIZE,r=a.eyeDistance*.24*SIZE,g=ctx.createRadialGradient(x*SIZE,y,0,x*SIZE,y,r);g.addColorStop(0,'rgba(143,91,95,.25)');g.addColorStop(1,'rgba(143,91,95,0)');ctx.fillStyle=g;ctx.fillRect(x*SIZE-r,y-r,r*2,r*2);}
      if(look.earrings)for(const sign of [-1,1])await sprite(look.earrings,'earrings',a.eyeX+sign*a.fw*.47,a.eyeY+a.fw*.20,look.earrings==='hoop'?a.fw*.11:a.fw*.052,look.earrings==='hoop'?a.fw*.15:a.fw*.052);
      await sprite(look.ears,'ears',a.eyeX,Math.max(.01,a.hairTop),a.fw*1.36,a.eyeY-a.hairTop+a.fw*.40);
      if(look.hat){const im=await load(BASE+(look.hat==='head-sunglasses'?'sunglasses':look.hat)+'.webp?v=4'),width=look.hat==='head-sunglasses'?a.eyeDistance*1.85:Math.min(.91,Math.max(a.hw*.92,a.fw*(look.hat==='beanie'?1.13:1.24))),height=width*im.height/im.width,fittedHeight=look.hat==='head-sunglasses'?height:Math.min(height,a.eyeY-.12),top=look.hat==='head-sunglasses'?Math.max(.025,a.faceTop-.14):Math.max(.012,a.eyeY-.105-fittedHeight);await sprite(look.hat,'hat',a.eyeX,top,width,fittedHeight);}
      if(look.glasses){const im=await load(BASE+look.glasses+'.webp?v=4'),width=a.eyeDistance/.53,height=width*im.height/im.width;await sprite(look.glasses,'glasses',a.eyeX,a.eyeY-height*.50,width,height,{tilt:a.eyeTilt});}
      return {url:c.toDataURL('image/webp',.94),anchors:{...a,mask:undefined},placements};
    })();cache.set(id,pending);pending.catch(()=>cache.delete(id));if(cache.size>180)cache.delete(cache.keys().next().value);return pending;
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
