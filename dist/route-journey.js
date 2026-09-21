/* Google route geometry is shared by polylines, time badges, and Captain motion. */
(()=>{
 const cache=new Map(),point=p=>({lat:Number(typeof p.lat==='function'?p.lat():p.lat),lng:Number(typeof p.lng==='function'?p.lng():p.lng)});
 const pos=i=>({lat:Number(i.latitude),lng:Number(i.longitude)});
 const valid=p=>Number.isFinite(p.lat)&&Number.isFinite(p.lng);
 const rail=s=>/SUBWAY|METRO_RAIL|HEAVY_RAIL|COMMUTER_TRAIN|RAIL/.test(s.transitDetails?.transitLine?.vehicle?.type || '');
 function normalize(route,mode){
  const path=(route.path||[]).map(point).filter(valid),ms=route.durationMillis;
  if(path.length<2||!Number.isFinite(ms))return null;
  const steps=(route.legs||[]).flatMap(l=>l.steps||[]);
  const parts=steps.map(s=>({path:(s.path||[]).map(point).filter(valid),mode:s.travelMode==='WALKING'?'walk':rail(s)?'subway':mode==='TRANSIT'?'transit':mode==='DRIVING'?'drive':'walk'})).filter(s=>s.path.length>1);
  return {path,parts:parts.length?parts:[{path,mode:mode==='WALKING'?'walk':mode==='DRIVING'?'drive':'transit'}],seconds:ms/1000,mode:mode==='WALKING'?'walk':mode==='DRIVING'?'drive':steps.some(rail)?'subway':'transit',warnings:route.warnings||[]};
 }
 async function request(a,b,mode){
  const {Route}=await google.maps.importLibrary('routes');
  if(!Route?.computeRoutes)throw Error('Routes API unavailable');
  const {routes}=await Route.computeRoutes({origin:pos(a),destination:pos(b),travelMode:mode,fields:['path','durationMillis','legs','warnings']});
  return routes?.[0]?normalize(routes[0],mode):null;
 }
 const direct=(a,b)=>({path:[pos(a),pos(b)],parts:[{path:[pos(a),pos(b)],mode:'walk'}],mode:'other',dashed:true,seconds:null,warnings:[]});
 const nextMode=mode=>mode==='walk'?'DRIVING':mode==='drive'?'OTHER':'WALKING';
 async function choose(a,b,fetchRoute=request){
  const jump=direct(a,b);
  let walk;try{walk=await fetchRoute(a,b,'WALKING');}catch(error){if(/denied|not.*enabled|unavailable|billing|key/i.test(error.message||''))return jump;}
  if(walk&&walk.seconds<=1800)return walk;
  const results=await Promise.allSettled(['DRIVING','TRANSIT'].map(m=>fetchRoute(a,b,m)));
  const [drive,transit]=results.map(r=>r.status==='fulfilled'?r.value:null);
  if(transit&&(!drive || (transit.mode==='subway'&&transit.seconds<drive.seconds)))return transit;
  return drive||jump;
 }
 async function leg(a,b,mode=b.transport_mode){
  if(mode==='OTHER')return direct(a,b);
  const key=JSON.stringify([pos(a),pos(b),mode||null]),saved=cache.get(key);
  if(saved&&Date.now()-saved.time<300000)return (await saved.promise)||direct(a,b);
  const promise=['WALKING','DRIVING'].includes(mode)?request(a,b,mode).catch(()=>null):choose(a,b);cache.set(key,{time:Date.now(),promise});
  if(cache.size>250)cache.delete(cache.keys().next().value);
  return (await promise)||direct(a,b);
 }
 function samplePath(path,t){
  if(!path.length)return null;if(path.length===1)return path[0];
  const lengths=path.slice(1).map((p,i)=>Math.hypot(p.lat-path[i].lat,(p.lng-path[i].lng)*Math.cos(p.lat*Math.PI/180)));
  let d=Math.max(0,Math.min(1,t))*lengths.reduce((a,b)=>a+b,0);
  for(let i=0;i<lengths.length;i++){if(d<=lengths[i]||i===lengths.length-1){const f=lengths[i]?d/lengths[i]:0;return {lat:path[i].lat+(path[i+1].lat-path[i].lat)*f,lng:path[i].lng+(path[i+1].lng-path[i].lng)*f};}d-=lengths[i];}
 }
 let epoch=0,context='',selection=null,map,marker,frame=0,last=0,elapsed=0,segments=[],loop=false,arrive=null,labels=[],lines=[];
 const reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const flights=new Set();
 function stop(){cancelAnimationFrame(frame);frame=0;last=0;}
 function clean(){lines.forEach(l=>l.setMap(null));labels.forEach(l=>l.map=null);lines=[];labels=[];}
 // Only the animation is simplified; the visible Google path stays exact.
 function simplify(path,tolerance=.00009){
  if(path.length<3)return path;
  const a=path[0],b=path.at(-1),dx=b.lng-a.lng,dy=b.lat-a.lat,d=dx*dx+dy*dy;
  let max=0,index=0;
  for(let i=1;i<path.length-1;i++){const p=path[i],u=d?Math.max(0,Math.min(1,((p.lng-a.lng)*dx+(p.lat-a.lat)*dy)/d)):0;
   const e=Math.hypot(p.lng-a.lng-u*dx,p.lat-a.lat-u*dy);if(e>max){max=e;index=i;}}
  return max>tolerance?[...simplify(path.slice(0,index+1),tolerance).slice(0,-1),...simplify(path.slice(index),tolerance)]:[a,b];
 }
 function partSegments(parts){
  const merged=[];
  for(const p of parts){const prev=merged.at(-1);if(prev?.mode===p.mode&&p.mode!=='jump'&&p.mode!=='flight')prev.path.push(...p.path);else merged.push({...p,path:[...p.path]});}
  return merged.map(p=>({...p,path:simplify(p.path),duration:p.mode==='flight'?1800:p.mode==='walk'?Math.min(6500,Math.max(3200,simplify(p.path).length*350)):Math.min(2200,Math.max(800,simplify(p.path).length*120)),wait:160}));
 }
 const readyAssets=new Map();
 function preload(mode){
  const file=mode==='drive'?'captain-car-v23.webp':mode==='flight'?'captain-plane-v23.webp':mode==='walk'?'captain-motion-atlas.webp':null;
  if(!file)return Promise.resolve();
  if(!readyAssets.has(file))readyAssets.set(file,new Promise(resolve=>{
   const im=new Image();const timer=setTimeout(()=>{readyAssets.delete(file);resolve();},8000);
   im.onload=()=>{clearTimeout(timer);resolve();};im.onerror=()=>{clearTimeout(timer);readyAssets.delete(file);resolve();};im.src='./assets/studio/'+file;
  }));return readyAssets.get(file);
 }
 function draw(now){
  if(document.hidden){stop();return;}
  if(last)elapsed+=Math.min(now-last,100);last=now;
  let t=elapsed,seg;for(const s of segments){if(t<s.duration+s.wait){seg=s;break;}t-=s.duration+s.wait;}
  if(!seg){if(loop){segments=segments.filter(s=>s.mode!=='flight');elapsed=0;frame=requestAnimationFrame(draw);return;}marker.map=null;arrive?.();stop();return;}

  const u=Math.min(1,t/seg.duration);marker.position=samplePath(seg.path,u);
  const node=marker.content;node.dataset.mode=seg.mode;
  const facing=seg.path.at(-1).lng<seg.path[0].lng?-1:1;node.style.setProperty('--journey-facing',facing);
  node.querySelector('.journey-vehicle').textContent=({drive:'🚗',subway:'🚇',transit:'🚌',flight:'✈️'})[seg.mode]||'';
  node.style.transform=seg.mode==='jump'?`translateY(${-Math.sin(u*Math.PI)*65}px)`:seg.mode==='flight'?`translate(0,${-180*Math.pow(1-u,2)}px) scale(${1+.45*(1-u)})`:'';
  node.querySelector('.journey-caption').textContent='';
  frame=requestAnimationFrame(draw);
 }
 async function update(nextMap,items,key,selectedId,options={}){
  const signature=key+'|'+items.map(i=>i.id+':'+i.latitude+','+i.longitude+','+(i.transport_mode||'')).join('|');
  if(signature===context && selection===selectedId&&!options.force)return;
  const oldSelection=selection,oldContext=context;context=signature;selection=selectedId;const mine=++epoch;
  stop();clean();if(marker)marker.map=null;map=nextMap;
  document.querySelector('.map-panel')?.classList.remove('captain-in-transit');
  const oldNotice=document.getElementById('routeNotices');if(oldNotice){oldNotice.hidden=true;oldNotice.textContent='';}
  if(!items.length)return;
  const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
  const legs=[];for(let i=0;i<items.length-1;i++){legs.push(await leg(items[i],items[i+1]));if(mine!==epoch)return;}
  if(mine!==epoch)return;
  const warnings=new Set();legs.forEach(l=>l.warnings.forEach(w=>warnings.add(w)));
  const notice=document.getElementById('routeNotices');
  if(notice){notice.textContent=[...warnings].join(' ');notice.hidden=!warnings.size;}
  legs.forEach((l,index)=>{
   if(!l.path.length)return;
   if(l.dashed)lines.push(new google.maps.Polyline({map,path:l.path,strokeOpacity:0,icons:[{icon:{path:'M 0,-1 0,1',strokeColor:'#68646e',strokeOpacity:1,scale:2},offset:'0',repeat:'12px'}],zIndex:5}));
   else {
    lines.push(new google.maps.Polyline({map,path:l.path,strokeColor:'#fff',strokeOpacity:.95,strokeWeight:7,zIndex:4}));
    lines.push(new google.maps.Polyline({map,path:l.path,strokeColor:l.mode==='walk'?'#497566':l.mode==='subway'?'#436caa':'#68646e',strokeOpacity:.95,strokeWeight:3,zIndex:5}));
   }
   const badge=document.createElement('button');badge.type='button';badge.className='route-time-badge';badge.textContent=({walk:'도보',drive:'차량',subway:'대중',transit:'대중'})[l.mode]+' '+Math.max(1,Math.ceil(l.seconds/60))+'분';badge.title='누르면 도보 / 차량 경로로 변경';
   if(l.dashed)badge.textContent='기타 이동수단';
   badge.title=l.dashed?'실제 경로가 아닌 직선 연결 · 누르면 도보':'누르면 다음 이동수단으로 변경';
   badge.disabled=!options.onModeChange;badge.setAttribute('aria-label',badge.textContent+' · '+({WALKING:'도보',DRIVING:'차량',OTHER:'기타 이동수단'})[nextMode(l.mode)]+'로 변경');
   badge.addEventListener('click',async event=>{
    event.stopPropagation();if(badge.disabled||mine!==epoch)return;badge.disabled=true;
    const preference=items[index+1].transport_mode;
    const next=preference?({WALKING:'DRIVING',DRIVING:'OTHER',OTHER:'WALKING'})[preference]:nextMode(l.mode);
    try{
     const candidate=await leg(items[index],items[index+1],next);
     if(mine!==epoch)return;
     if(candidate.dashed&&next!=='OTHER')options.onError?.('경로를 찾지 못해 시간 없이 점선으로 연결합니다.');
     await options.onModeChange(items[index+1].id,next);
     if(mine!==epoch)return;
     const changed=items.map((item,i)=>i===index+1?{...item,transport_mode:next}:item);
     await update(nextMap,changed,key,selectedId,{...options,force:true,previewLeg:index});
    }catch(error){options.onError?.(error.message||'이동수단을 저장하지 못했습니다. 다시 시도해 주세요.');}
    finally{badge.disabled=!options.onModeChange;}
   });
   labels.push(new AdvancedMarkerElement({map,position:samplePath(l.path,.5),content:badge,zIndex:70}));
  });
  let parts=[],selectedIndex=items.findIndex(i=>i.id===selectedId),oldIndex=items.findIndex(i=>i.id===oldSelection);
  if(selectedIndex>=0){
   if(oldContext===signature&&oldIndex>=0&&oldIndex!==selectedIndex){
    if(oldIndex<selectedIndex)parts=legs.slice(oldIndex,selectedIndex).flatMap(l=>l.parts);
    else for(let i=oldIndex;i>selectedIndex;i--){
     const reverse=await leg(items[i],items[i-1],items[i].transport_mode);if(mine!==epoch)return;parts.push(...reverse.parts);
     if(reverse.path.length)lines.push(new google.maps.Polyline({map,path:reverse.path,strokeColor:'#68646e',strokeOpacity:reverse.dashed?0:.9,strokeWeight:3,zIndex:5,...(reverse.dashed?{icons:[{icon:{path:'M 0,-1 0,1',strokeColor:'#68646e',strokeOpacity:1,scale:2},offset:'0',repeat:'12px'}]}:{})}));
    }
   }
  }else parts=legs.flatMap(l=>l.parts);
  if(Number.isInteger(options.previewLeg)&&selectedIndex>=0)parts=legs[options.previewLeg]?.parts||[];
  const firstFlight=!Number.isInteger(options.previewLeg)&&options.firstDay&&!flights.has(key)&&(selectedIndex<=0);
  if(firstFlight){flights.add(key);parts.unshift({path:[pos(items[0]),pos(items[0])],mode:'flight'});}
  if(!parts.length&&selectedIndex<0)parts=[{path:[pos(items[0]),pos(items[0])],mode:'idle'}];
  if(!parts.length)return;
  loop=selectedIndex<0;
  segments=partSegments(parts);
  if(loop)segments.push({path:[pos(items.at(-1)),pos(items[0])],mode:'walk',duration:3200,wait:300});
  // Flight is a one-time opening, not a real airline itinerary.
  if(firstFlight)segments[0].duration=1800;
  await Promise.all([...new Set(segments.map(s=>s.mode))].map(preload));if(mine!==epoch)return;
  const el=document.createElement('div');el.className='captain-journey';el.dataset.mode=segments[0].mode;el.setAttribute('aria-hidden','true');
  el.innerHTML='<span class="journey-caption"></span><span class="journey-walk-sprite"></span><img src="./assets/studio/captain-selected.webp" alt=""><span class="journey-vehicle"></span><span class="journey-transport journey-car"></span><span class="journey-transport journey-plane"></span>';
  marker=new AdvancedMarkerElement({map,position:segments[0].path[0],content:el,zIndex:250});
  arrive=()=>{document.querySelector('.map-panel')?.classList.remove('captain-in-transit');};
  if(reduce.matches){marker.map=null;arrive();return;}
  if(selectedIndex>=0)document.querySelector('.map-panel')?.classList.add('captain-in-transit');

  elapsed=0;frame=requestAnimationFrame(draw);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(marker?.map&&segments.length&&!reduce.matches&&!frame)frame=requestAnimationFrame(draw);});
 reduce.addEventListener?.('change',()=>{if(reduce.matches){stop();if(marker)marker.map=null;arrive?.();}});
 window.RouteJourney={update,choose,normalize,samplePath,simplify,partSegments,nextMode,stop};
})();
