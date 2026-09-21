/* Small, non-interactive character overlays follow the same ordered route as the map. */
(() => {
  const ASSETS='./assets/studio/';
  let map=null,marker=null,signature='',route=[],frame=0,lastTime=0,elapsed=0,revision=0;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let paused=reduced.matches,selected=false,atlasReady=null;
  function preload(){if(!atlasReady)atlasReady=new Promise((resolve,reject)=>{const image=new Image();image.onload=async()=>{try{await image.decode?.();resolve(image);}catch(e){atlasReady=null;reject(e);}};image.onerror=()=>{atlasReady=null;reject(Error('Captain sprite unavailable'));};image.src=ASSETS+'captain-motion-atlas.webp';});return atlasReady;}
  function setSelected(value){selected=Boolean(value);if(marker)marker.map=selected?null:map;if(selected)stop();else if(marker&&!paused&&!document.hidden&&!frame)frame=requestAnimationFrame(tick);}
  try{paused=paused||localStorage.getItem('captain-motion')==='paused';}catch{}
  const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
  const position=item=>({lat:Number(item.latitude),lng:Number(item.longitude)});
  function markerContent(item,selected,number){
    const node=document.createElement('div');node.className='captain-stop'+(selected?' is-selected':'');
    if(selected){const radar=document.createElement('span');radar.className='captain-radar';radar.setAttribute('aria-hidden','true');radar.innerHTML='<i></i><i></i>';node.append(radar);}
    const img=document.createElement('img');img.src=ASSETS+(selected?'captain-selected.webp':'captain-flag.webp');img.alt='';img.draggable=false;node.append(img);
    const badge=document.createElement('span');badge.className='captain-stop-number';badge.textContent=number;node.append(badge);
    node.setAttribute('aria-label',`${number}번 일정${selected?' · 선택 중':''}`);return node;
  }
  function content(){const el=document.createElement('div');el.className='captain-walker';el.setAttribute('aria-hidden','true');el.innerHTML='<span class="captain-ground"></span><span class="captain-sprite"></span>';return el;}
  function paint(action,index,direction=1){if(!marker?.content)return;const node=marker.content.querySelector('.captain-sprite');const key=action+index+direction;if(node.dataset.frame===key)return;node.dataset.frame=key;const row={walk:0,map:1,telescope:2}[action];node.style.backgroundPosition=`${index*100/3}% ${row*50}%`;node.style.transform=`scaleX(${direction})`;marker.content.dataset.action=action;}
  function syncControls(){
    document.querySelector('.map-panel')?.classList.toggle('motion-paused',paused);
    const b=document.getElementById('toggleCaptainMotion');if(b){b.setAttribute('aria-pressed',String(!paused));b.textContent=paused?'▶ 캡틴 산책':'Ⅱ 움직임 멈춤';}
    document.querySelector('.map-panel')?.classList.toggle('captain-has-route',route.length>0);
  }
  function stop(){cancelAnimationFrame(frame);frame=0;lastTime=0;}
  function segmentDuration(a,b){const d=Math.hypot(b.lat-a.lat,(b.lng-a.lng)*Math.cos(a.lat*Math.PI/180));return clamp(4000+Math.log1p(d*100)*1600,4200,10500);}
  function sample(items,time){
    if(!items.length)return null;
    if(items.length===1)return {position:items[0],action:'map',index:Math.floor(time/700)%4,direction:1};
    const legs=items.slice(0,-1).map((p,i)=>segmentDuration(p,items[i+1])+3400),total=legs.reduce((a,b)=>a+b,0)+3500;
    let t=time%total;
    for(let i=0;i<legs.length;i++){
      const start=items[i],end=items[i+1],dwell=3400,duration=legs[i]-dwell;
      if(t<dwell)return {position:start,action:i%2?'telescope':'map',index:Math.min(3,Math.floor(t/850)),direction:end.lng>=start.lng?1:-1};
      if(t<legs[i]){
        const u=(t-dwell)/duration;
        return {position:{lat:start.lat+(end.lat-start.lat)*u,lng:start.lng+(end.lng-start.lng)*u},action:'walk',index:Math.floor(t/150)%4,direction:end.lng>=start.lng?1:-1};
      }t-=legs[i];
    }
    return {position:items.at(-1),action:'telescope',index:Math.min(3,Math.floor(t/875)),direction:1};
  }
  function tick(now){
    if(paused||selected||document.hidden||!marker||!route.length){stop();return;}
    if(lastTime)elapsed+=Math.min(now-lastTime,100);lastTime=now;
    const state=sample(route,elapsed);marker.position=state.position;paint(state.action,state.index,state.direction);
    frame=requestAnimationFrame(tick);
  }
  async function setRoute(nextMap,items,context,selectedId=null){
    setSelected(items.some(i=>i.id===selectedId));
    const filtered=items.filter(item=>Number.isFinite(Number(item.latitude))&&Number.isFinite(Number(item.longitude))&&item.latitude!=null&&item.longitude!=null);
    const nextSignature=context+'|'+filtered.map(i=>i.id+':'+i.latitude+':'+i.longitude).join('|');
    if(nextSignature===signature&&map===nextMap)return;
    const mine=++revision;signature=nextSignature;map=nextMap;stop();route=filtered.map(position);elapsed=0;
    if(marker){marker.map=null;marker=null;}syncControls();if(!route.length)return;
    let AdvancedMarkerElement;try{[{AdvancedMarkerElement}]=await Promise.all([google.maps.importLibrary('marker'),preload()]);}catch(error){if(mine===revision)signature='';console.warn(error.message);return;}if(mine!==revision)return;
    marker=new AdvancedMarkerElement({map:selected?null:map,position:route[0],content:content(),title:'동선을 따라 걷는 캡틴비어',zIndex:80,gmpClickable:false});
    paint('map',2);if(!paused&&!selected)frame=requestAnimationFrame(tick);
  }
  function init(){
    document.getElementById('toggleCaptainMotion')?.addEventListener('click',()=>{paused=!paused;try{localStorage.setItem('captain-motion',paused?'paused':'playing');}catch{}syncControls();if(paused)stop();else if(marker&&!selected&&!frame)frame=requestAnimationFrame(tick);});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(!paused&&!selected&&marker&&!frame)frame=requestAnimationFrame(tick);});
    reduced.addEventListener?.('change',e=>{if(e.matches){paused=true;stop();syncControls();}});syncControls();
  }
  window.CaptainMap={markerContent,setRoute,setSelected,sample,stop};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
