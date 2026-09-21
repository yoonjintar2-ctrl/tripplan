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
 async function choose(a,b,fetchRoute=request){
  const jump={path:[],parts:[{path:[pos(a),pos(b)],mode:'jump'}],mode:'jump',seconds:null,warnings:[]};
  let walk;try{walk=await fetchRoute(a,b,'WALKING');}catch(error){if(/denied|not.*enabled|unavailable|billing|key/i.test(error.message||''))return jump;}
  if(walk&&walk.seconds<=1800)return walk;
  const results=await Promise.allSettled(['DRIVING','TRANSIT'].map(m=>fetchRoute(a,b,m)));
  const [drive,transit]=results.map(r=>r.status==='fulfilled'?r.value:null);
  if(transit&&(!drive || (transit.mode==='subway'&&transit.seconds<drive.seconds)))return transit;
  return drive||jump;
 }
 async function leg(a,b){
  const key=JSON.stringify([pos(a),pos(b)]),saved=cache.get(key);
  if(saved&&Date.now()-saved.time<300000)return saved.promise;
  const promise=choose(a,b);cache.set(key,{time:Date.now(),promise});
  if(cache.size>250)cache.delete(cache.keys().next().value);
  return promise;
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
 function partSegments(parts){return parts.map(p=>({...p,duration:p.mode==='jump'?1000:Math.max(1400,Math.min(7000,p.path.length*70)),wait:400}));}
 function draw(now){
  if(document.hidden){stop();return;}
  if(last)elapsed+=Math.min(now-last,100);last=now;
  let t=elapsed,seg;for(const s of segments){if(t<s.duration+s.wait){seg=s;break;}t-=s.duration+s.wait;}
  if(!seg){if(loop){segments=segments.filter(s=>s.mode!=='flight');elapsed=0;frame=requestAnimationFrame(draw);return;}marker.map=null;arrive?.();stop();return;}
  if(segments[0]?.mode==='flight'&&seg!==segments[0]&&!segments[0].landed){segments[0].landed=true;map.panTo(segments[0].path.at(-1));map.setZoom(14);}
  const u=Math.min(1,t/seg.duration);marker.position=samplePath(seg.path,u);
  const node=marker.content;node.dataset.mode=seg.mode;
  node.querySelector('.journey-vehicle').textContent=({drive:'🚗',subway:'🚇',transit:'🚌',flight:'✈️'})[seg.mode]||'';
  node.style.transform=seg.mode==='jump'?`translateY(${-Math.sin(u*Math.PI)*65}px)`:'';
  node.querySelector('.journey-caption').textContent=seg.mode==='flight'?'한국 출발':'';
  frame=requestAnimationFrame(draw);
 }
 async function update(nextMap,items,key,selectedId,options={}){
  const signature=key+'|'+items.map(i=>i.id+':'+i.latitude+','+i.longitude).join('|');
  if(signature===context && selection===selectedId)return;
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
  legs.forEach(l=>{
   if(!l.path.length)return;
   lines.push(new google.maps.Polyline({map,path:l.path,strokeColor:'#fff',strokeOpacity:.95,strokeWeight:7,zIndex:4}));
   lines.push(new google.maps.Polyline({map,path:l.path,strokeColor:l.mode==='walk'?'#497566':l.mode==='subway'?'#436caa':'#68646e',strokeOpacity:.95,strokeWeight:3,zIndex:5}));
   const badge=document.createElement('span');badge.className='route-time-badge';badge.textContent=({walk:'도보',drive:'차량',subway:'대중',transit:'대중'})[l.mode]+' '+Math.max(1,Math.ceil(l.seconds/60))+'분';badge.title='Google 추천 경로 · 조회 시점 예상 시간';
   labels.push(new AdvancedMarkerElement({map,position:samplePath(l.path,.5),content:badge,zIndex:70}));
  });
  let parts=[],selectedIndex=items.findIndex(i=>i.id===selectedId),oldIndex=items.findIndex(i=>i.id===oldSelection);
  if(selectedIndex>=0){
   if(oldContext===signature&&oldIndex>=0&&oldIndex!==selectedIndex){
    if(oldIndex<selectedIndex)parts=legs.slice(oldIndex,selectedIndex).flatMap(l=>l.parts);
    else for(let i=oldIndex;i>selectedIndex;i--){const reverse=await leg(items[i],items[i-1]);if(mine!==epoch)return;parts.push(...reverse.parts);if(reverse.path.length)lines.push(new google.maps.Polyline({map,path:reverse.path,strokeColor:'#68646e',strokeOpacity:.9,strokeWeight:3,zIndex:5}));}
   }
  }else parts=legs.flatMap(l=>l.parts);
  const firstFlight=options.firstDay&&!flights.has(key)&&(selectedIndex<=0);
  if(firstFlight){flights.add(key);parts.unshift({path:[{lat:37.4602,lng:126.4407},pos(items[0])],mode:'flight'});}
  if(!parts.length&&selectedIndex<0)parts=[{path:[pos(items[0]),pos(items[0])],mode:'idle'}];
  if(!parts.length)return;
  loop=selectedIndex<0;
  segments=partSegments(parts);
  if(loop)segments.push({path:[pos(items.at(-1)),pos(items[0])],mode:'jump',duration:900,wait:700});
  // Flight is a one-time opening, not a real airline itinerary.
  if(firstFlight)segments[0].duration=3500;
  const el=document.createElement('div');el.className='captain-journey';el.setAttribute('aria-hidden','true');
  el.innerHTML='<span class="journey-caption"></span><span class="journey-walk-sprite"></span><img src="./assets/studio/captain-selected.webp" alt=""><span class="journey-vehicle"></span>';
  marker=new AdvancedMarkerElement({map,position:segments[0].path[0],content:el,zIndex:250});
  arrive=()=>{document.querySelector('.map-panel')?.classList.remove('captain-in-transit');if(firstFlight){map.panTo(pos(items[0]));map.setZoom(14);}};
  if(reduce.matches){marker.map=null;arrive();return;}
  if(selectedIndex>=0)document.querySelector('.map-panel')?.classList.add('captain-in-transit');
  if(firstFlight){const bounds=new google.maps.LatLngBounds();segments[0].path.forEach(p=>bounds.extend(p));map.fitBounds(bounds,60);}
  elapsed=0;frame=requestAnimationFrame(draw);
 }
 document.addEventListener('visibilitychange',()=>{if(document.hidden)stop();else if(marker?.map&&segments.length&&!reduce.matches&&!frame)frame=requestAnimationFrame(draw);});
 reduce.addEventListener?.('change',()=>{if(reduce.matches){stop();if(marker)marker.map=null;arrive?.();}});
 window.RouteJourney={update,choose,normalize,samplePath,stop};
})();
