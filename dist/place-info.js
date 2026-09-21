/* Place data supplied by Google, never a scraped or guessed Maps page. */
(()=>{
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const url=s=>/^https:\/\//.test(s||'')?s:null;
 const tickets=new WeakMap(),details=new WeakMap();let serial=0;
 const dialog=document.createElement('dialog');dialog.className='place-info-dialog';dialog.id='placeInfoDialog';
 dialog.setAttribute('aria-label','Google 장소 자세히');
 dialog.innerHTML='<header><strong>장소 자세히</strong><button type="button" aria-label="장소 자세히 닫기">×</button></header><div class="place-info-content"></div>';
 document.body.append(dialog);dialog.querySelector('button').onclick=()=>dialog.close();dialog.addEventListener('close',()=>serial++);
 function body(place,compact=false){
  const photos=(place.photos||[]).slice(0,compact?2:10).map(p=>{
   const src=url(p.getURI({maxWidth:800,maxHeight:800}));if(!src)return '';
   const credits=(p.authorAttributions||[]).map(a=>url(a.uri)?`<a href="${esc(a.uri)}" target="_blank" rel="noopener noreferrer">${esc(a.displayName)}</a>`:esc(a.displayName)).join(', ');
   return `<figure><img loading="lazy" src="${esc(src)}" alt="${esc(place.displayName||'선택한 장소')} 사진"><figcaption>${credits}</figcaption></figure>`;
  }).join('');
  const reviews=(place.reviews||[]).filter(r=>r.text).slice(0,compact?1:5).map(r=>{
   const a=r.authorAttribution||{},name=esc(a.displayName||'Google 사용자');
   return `<article class="review-entry"><header>${url(a.uri)?`<a href="${esc(a.uri)}" target="_blank" rel="noopener noreferrer">${name}</a>`:name} · ★ ${esc(r.rating||'')}</header><p>${esc(r.text)}</p></article>`;
  }).join('');
  const rating=place.rating?`★ ${esc(place.rating)} · 리뷰 ${esc(place.userRatingCount||0)}개`:'';
  return `<p>${rating}</p><div class="place-info-photos">${photos||'<small>제공되는 사진이 없습니다.</small>'}</div>${reviews||'<small>제공되는 리뷰가 없습니다.</small>'}`;
 }
 async function enrich(place){
  if(place.fetchFields){
   if(!details.has(place))details.set(place,place.fetchFields({fields:['displayName','formattedAddress','googleMapsURI','rating','userRatingCount','photos','reviews','regularOpeningHours','nationalPhoneNumber','websiteURI']}).catch(e=>{details.delete(place);throw e;}));
   await details.get(place);
  }
  return place;
 }
 async function preview(place,node){
  const ticket={};tickets.set(node,ticket);node.textContent='사진과 리뷰를 불러오는 중…';
  try{await enrich(place);if(tickets.get(node)!==ticket)return;node.innerHTML=body(place,true);}
  catch{if(tickets.get(node)!==ticket)return;node.textContent='사진과 리뷰를 불러오지 못했습니다.';}
  const more=document.createElement('button');more.type='button';more.className='place-more';more.textContent='자세히';more.onclick=()=>open(()=>Promise.resolve(place));node.append(more);
 }
 async function open(load){
  const ticket=++serial,content=dialog.querySelector('.place-info-content');content.textContent='Google 장소 정보를 불러오는 중…';if(!dialog.open)dialog.showModal();
  try{
   const place=await load();if(ticket!==serial)return;await enrich(place);if(ticket!==serial)return;
   const hours=(place.regularOpeningHours?.weekdayDescriptions||[]).map(esc).join('<br>');
   content.innerHTML=`<h2>${esc(place.displayName||'선택한 위치')}</h2><p>${esc(place.formattedAddress||'')}</p>${body(place)}${hours?`<h3>영업시간</h3><p>${hours}</p>`:''}${place.nationalPhoneNumber?`<p>전화 · ${esc(place.nationalPhoneNumber)}</p>`:''}${url(place.websiteURI)?`<p><a href="${esc(place.websiteURI)}" target="_blank" rel="noopener noreferrer">공식 홈페이지 ↗</a></p>`:''}<p class="review-limit">Google 제공 정보 · 리뷰는 최대 5개입니다. 전체 리뷰와 최신 정보는 Google 지도에서 확인하세요.</p>${url(place.googleMapsURI)?`<a class="all-reviews-link" href="${esc(place.googleMapsURI)}" target="_blank" rel="noopener noreferrer">Google 지도에서 전체 정보 보기 ↗</a>`:''}`;
  }catch{if(ticket===serial)content.textContent='장소 정보를 불러오지 못했습니다. 닫고 다시 시도해 주세요.';}
 }
 window.PlaceInfo={preview,open};
})();
