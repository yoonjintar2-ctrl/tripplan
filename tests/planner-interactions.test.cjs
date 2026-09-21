const {JSDOM}=require('jsdom');
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const root=require('path').resolve(__dirname,'..');
// DOM integration tests: Google Maps and Supabase are mocks; no network or user-data writes.
const html=fs.readFileSync(root+'/dist/index.html','utf8');
const dom=new JSDOM(html,{url:'https://yoonjintar2-ctrl.github.io/tripplan/',runScripts:'outside-only'});
const w=dom.window,c=dom.getInternalVMContext();
w.requestAnimationFrame=()=>0;w.cancelAnimationFrame=()=>{};w.matchMedia=()=>({matches:false});w.setInterval=()=>0;w.setTimeout=()=>0;w.clearTimeout=()=>{};
w.HTMLElement.prototype.scrollIntoView=function(){};
w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
const calls={pan:0,markers:[],writes:[],rpc:[],query:[]};
class LatLng {constructor(lat,lng){this.a=lat;this.b=lng}lat(){return this.a}lng(){return this.b}}
class FakeMap {constructor(el,opts){this.center=opts.center?.lat instanceof Function?opts.center:new LatLng(opts.center.lat,opts.center.lng);this.zoom=opts.zoom;this.listeners={};this.mapTypes=new Map()}setMapTypeId(id){this.mapTypeId=id}addListener(n,f){this.listeners[n]=f}getCenter(){return this.center}getZoom(){return this.zoom}setZoom(v){this.zoom=v}setCenter(v){this.center=typeof v.lat==='function'?v:new LatLng(v.lat,v.lng)}panTo(v){calls.pan++;this.setCenter(v)}fitBounds(){}}
class Marker{constructor(opts){Object.assign(this,opts);this.listeners={};calls.markers.push(this)}addEventListener(n,f){this.listeners[n]=f}}
class Place{constructor({id}){this.id=id}async fetchFields(){Object.assign(this,{displayName:'선택한 카페',formattedAddress:'London UK',location:new LatLng(51.5,-.12),googleMapsURI:'https://www.google.com/maps/?q=London',photos:[],reviews:[]})}static async searchByText(){return {places:[]}}}
w.google={maps:{StyledMapType:class{constructor(styles,opts){this.styles=styles;this.opts=opts}},importLibrary:async name=>({Map:FakeMap,AdvancedMarkerElement:Marker,Place,Geocoder:class{async geocode(){return {results:[{formatted_address:'정확한 좌표 주소'}]}}}}),LatLngBounds:class{extend(){}},Polyline:class{setMap(){}},event:{trigger(){}}}};
w.createClient=()=>({from(table){const obj={select(){return this},single(){return this},eq(){return this},order(){return this},in(){return this},insert(row){calls.writes.push({table,row});return this},update(row){calls.writes.push({table,row});return this},then(resolve){return Promise.resolve({data:{id:'saved'},error:null}).then(resolve)}};return obj},rpc:async(name,args)=>{calls.rpc.push({name,args});return {data:null,error:null}},auth:{},functions:{}});
let utils=fs.readFileSync(root+'/dist/travel-utils.js','utf8').replace(/export /g,'');
let code=fs.readFileSync(root+'/dist/app.js','utf8').replace(/^import .*;\n/gm,'').replace('Promise.allSettled([initMap(), initializeAuth()]);','');
const clock=fs.readFileSync(root+'/dist/trip-clock.js','utf8').replace(/export /g,'');
vm.runInContext(fs.readFileSync(root+'/dist/guest-drafts.js','utf8'),c);
vm.runInContext(utils+'\n'+clock+'\n'+code,c);
const run=s=>vm.runInContext(s,c),el=s=>w.document.querySelector(s),tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
run(`state.session={user:{id:'owner',user_metadata:{full_name:'나'}}};state.trip={id:'trip',owner_id:'owner',title:'영국',destination:'London',start_date:'2026-10-12',end_date:'2026-10-16',categories:['관광'],travelers:[{id:'owner',nickname:'나',avatar:'male-001'}]};state.trips=[state.trip];state.activeDate='2026-10-12';state.items=[{id:'one',trip_id:'trip',item_date:'2026-10-12',start_time:'09:00',name:'장소 A',latitude:51.5,longitude:-.1,icon:'OLD',split_ratios:{}},{id:'two',trip_id:'trip',item_date:'2026-10-12',start_time:'11:00',name:'장소 B',latitude:51.51,longitude:-.12,split_ratios:{}}];`);
await run('initMap()');await tick();assert.equal(run('state.map.mapTypeId'),'white_minimal');assert.equal(run("state.map.mapTypes.get('white_minimal').styles.find(s=>s.featureType==='water' && s.elementType==='geometry').stylers[0].color"),'#dfe9ee');
run('render()');await tick();
assert.equal(el('#iconDialog'),null);assert.equal(el('#openIconPicker'),null);assert.equal(el('input[type="time"]'),null);assert.equal(el('[name="destination"]'),null);assert(!el('#agendaList').textContent.includes('OLD'));
const ids=[...w.document.querySelectorAll('[id]')].map(node=>node.id);assert.equal(new Set(ids).size,ids.length,'DOM IDs must be unique');
const before=calls.pan;el('[data-item-id="one"]').dispatchEvent(new w.MouseEvent('mouseenter'));el('[data-item-id="one"]').dispatchEvent(new w.MouseEvent('mouseleave'));assert.equal(calls.pan,before);
el('[data-item-id="one"]').click();await tick();assert.equal(run('state.selectedId'),'one');assert(calls.pan>before);
console.log('PASS: icons/destination removed; hover does not move map, click selects.');
run('openSchedule()');await tick();assert(el('#scheduleDialog').open);assert(!el('#editorMapWrap').hidden);
el('#startTimeButton').click();assert(el('#timePickerDialog').open);assert.equal(w.document.querySelectorAll('#hourOptions button').length,24);assert.equal(w.document.querySelectorAll('#minuteOptions button').length,60);
el('#hourOptions [data-time-value="14"]').click();el('#minuteOptions [data-time-value="35"]').click();el('#confirmTime').click();assert.equal(el('#startTime').value,'14:35');assert.equal(el('#startTimeButton span').textContent,'14:35');
run('toggleEndTime(true);setTimeFields("end","15:10");toggleEndTime(false)');assert.equal(el('#endTime').value,'');
console.log('PASS: full-field time picker selects hours/minutes and clears disabled end time.');
run(`state.testPlaces=[{id:'a',displayName:'Cafe A',formattedAddress:'Address A',location:{lat:()=>51.5,lng:()=>-.1},googleMapsURI:'https://www.google.com/maps/?q=A'},{id:'b',displayName:'Cafe B',formattedAddress:'Address B',location:{lat:()=>51.6,lng:()=>-.2},googleMapsURI:'https://www.google.com/maps/?q=B'}];showPlaceResults(state.testPlaces);`);
await run('renderEditorMap(null,state.testPlaces)');assert.equal(run('state.editorMap.mapTypeId'),'white_minimal');assert.equal(run('state.editorResultMarkers.length'),2);
run('state.editorResultMarkers[1].listeners["gmp-click"]()');await tick();assert.equal(run('state.pendingPlace.placeId'),'b');assert.equal(el('#mapsUrlInput').value,'https://www.google.com/maps/?q=B');assert.equal(el('#scheduleName').value,'Cafe B');
await run('handleEditorMapClick({latLng:{lat:()=>51.7,lng:()=>-.3},stop(){}})');assert.equal(run('state.pendingPlace.latitude'),51.7);assert.equal(run('state.pendingPlace.placeId'),null);
run('clearPlaceSelection()');await tick();assert.equal(run('state.pendingPlace'),null);assert.equal(el('#mapsUrlInput').value,'');
await run('handleMainMapClick({placeId:"poi",stop(){}})');assert(!el('#mapPickCard').hidden);el('#addMapPlace').click();await tick();assert.equal(run('state.pendingPlace.placeId'),'poi');assert(el('#mapPickCard').hidden);
console.log('PASS: result pins select the correct place; map coordinates and main-map POIs populate the editor.');
// Stale async POI responses must not repopulate a closed form.
run('state.deferred = new Promise(resolve=>state.finishDeferred=resolve); state.oldPlaceFromMapEvent=placeFromMapEvent;placeFromMapEvent=()=>state.deferred;');
const delayed=run('handleEditorMapClick({stop(){}})');el('#scheduleDialog').close();run('state.finishDeferred(state.testPlaces[0])');await delayed;assert.notEqual(run('state.pendingPlace?.placeId'),'a');run('placeFromMapEvent=state.oldPlaceFromMapEvent');
run('updatePlaceCard(state.items[0])');el('#togglePlaceCard').click();assert(el('#placeCardDetails').hidden);assert.equal(el('#togglePlaceCard').getAttribute('aria-expanded'),'false');el('#togglePlaceCard').click();assert(!el('#placeCardDetails').hidden);
console.log('PASS: stale map responses ignored; place card collapses and expands.');
run('openSchedule();loadTripData=async()=>{};loadTripList=async()=>{};');await tick();el('#scheduleName').value='지도 없이 일정';run('setTimeFields("start","10:00")');await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');
let row=calls.writes.at(-1).row;assert.equal(row.name,'지도 없이 일정');assert.equal(row.icon,'');assert.equal(row.maps_url,null);assert.equal(row.start_time,'10:00');
run('openSchedule();toggleEndTime(true);setTimeFields("start","15:00");setTimeFields("end","14:00")');el('#scheduleName').value='잘못된 시간';const writesBefore=calls.writes.length;await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');assert.equal(calls.writes.length,writesBefore);assert(el('#formError').textContent.includes('이후'));
run('resetTripForm(state.trip);switchTrip=async()=>{}');el('#tripForm [name="title"]').value='영국 수정';await run('saveTrip({preventDefault(){},currentTarget:document.querySelector("#tripForm")})');assert.equal(calls.rpc.at(-1).args.p_destination,'London');
console.log('PASS: optional-location save, time validation, and existing destination preservation.');
const manifest=JSON.parse(fs.readFileSync(root+'/dist/assets/avatars-clay/manifest.json'));assert.equal(manifest.count,400);assert.equal(new Set(manifest.keys).size,400);for(const key of manifest.keys)assert(fs.existsSync(root+'/dist/assets/avatars-clay/'+key+'.webp'));
run('state.draftTravelers=[{id:"owner",nickname:"나",avatar:"male-001"}];state.avatarPerson="owner";state.avatarGroup="female";state.avatarPage=7;renderAvatarGrid()');assert.equal(w.document.querySelectorAll('#avatarGrid button').length,25);assert(el('[data-avatar="female-200"]'));assert(new URL(el('[data-avatar="female-200"] img').src).pathname.endsWith('avatars-clay/female-200.webp'));
console.log('PASS: 400 unique avatar assets and page 8 mapping.');
// Apply a look through the same callback as the picker, then persist the roster JSON.
vm.runInContext(fs.readFileSync(root+'/dist/avatar-studio.js','utf8'),c);
w.CaptainStudio.open=(person,apply)=>{calls.look={person,apply};};
run('resetTripForm(state.trip);state.avatarPerson="owner";state.avatarGroup="female";state.avatarPage=8;renderAvatarGrid()');
assert.equal(w.document.querySelectorAll('#avatarGrid button').length,25);el('[data-avatar="extra-female-001"]').click();assert.equal(calls.look.person.appearance.variant,'extra-female-001');assert.equal(calls.look.person.avatar,'female-001');
calls.look.apply({avatar:'female-001',appearance:{variant:'extra-female-001',hair:'white',glasses:'gold-glasses',hat:'beret',adjustments:{}}});
await run('saveTrip({preventDefault(){},currentTarget:document.querySelector("#tripForm")})');const appearance=calls.rpc.at(-1).args.p_travelers[0].appearance;assert.equal(appearance.hair,'white');assert.equal(appearance.variant,'extra-female-001');assert.equal(appearance.glasses,'gold-glasses');assert.equal(appearance.hat,'beret');
// The popup follows its click and flips to remain within the map panel.
el('.map-viewport').getBoundingClientRect=()=>({left:0,top:0,width:800,height:600});
run('state.mapPickPosition=null;state.mapPickPixel={x:200,y:300};document.querySelector("#mapPickCard").hidden=false;positionMapPick()');assert.equal(el('#mapPickCard').style.left,'216px');assert.equal(el('#mapPickCard').dataset.side,'right');
run('state.mapPickPixel={x:790,y:300};positionMapPick()');assert.equal(el('#mapPickCard').dataset.side,'left');assert(parseFloat(el('#mapPickCard').style.left)+218<=790);
// Today's clock selects the active stop, respects manual browsing, and resumes.
run(`state.trip.start_date=todayString();state.trip.end_date=todayString();state.activeDate=todayString();state.clockTrip=null;state.items=[{id:'now',item_date:todayString(),start_time:'00:00',end_time:'23:59:59',name:'현재 일정'},{id:'later',item_date:todayString(),name:'자유 일정'}];render()`);
assert.equal(run('state.selectedId'),'now');assert(w.document.body.classList.contains('trip-on-air'));assert.equal(el('#captainCountdown').textContent,'ON AIR');assert(el('.schedule-now'));
run('selectStop("later");tickTripClock()');assert.equal(run('state.selectedId'),'later');assert.equal(run('state.followClock'),false);el('#followCurrentSchedule').click();assert.equal(run('state.selectedId'),'now');
console.log('PASS: appearance selection and save payload, anchored popup, ON AIR timeline and manual-follow controls.');
// Per-row controls load and delete the targeted trip without changing unrelated trips.
assert.equal(el('label[for="scheduleName"]').textContent.trim(),'일정 이름 필수');
run(`state.trip={id:'trip',owner_id:'owner',title:'현재 여행',travelers:[]};state.trips=[state.trip,{id:'other',owner_id:'owner',title:'다른 여행'},{id:'shared',owner_id:'friend',title:'공유 여행'}];renderTripList();`);
assert.equal(el('[data-load-trip="other"]').parentElement,el('[data-share-trip="other"]').parentElement);
assert.equal(el('[data-delete-trip="other"]').parentElement,el('[data-share-trip="other"]').parentElement);
assert(el('[data-delete-trip="shared"]').disabled);
run(`state.switched=[];switchTrip=async id=>{state.switched.push(id);state.trip=state.trips.find(t=>t.id===id)};`);
el('[data-load-trip="other"]').click();await tick();assert.equal(run('state.trip.id'),'other');
run(`state.deleted=[];supabase.from=()=>({delete(){return this},eq(k,v){if(k==='id')state.deleted.push(v);return this},then(resolve){return Promise.resolve({error:null}).then(resolve)}});loadTripList=async()=>{state.trips=state.trips.filter(t=>!state.deleted.includes(t.id))};`);
w.confirm=()=>true;await run('deleteTrip("trip")');assert.equal(run('state.trip.id'),'other');assert.equal(run('state.deleted[0]'),'trip');
await run('deleteTrip("shared")');assert.equal(run('state.deleted.length'),1);
await run('deleteTrip("other")');assert.equal(run('state.trip.id'),'shared');
console.log('PASS: row-level load/delete actions, ownership guard and current-trip preservation');
// The flat map viewport owns both the live map and its popup, independent of the Captain rail.
assert.equal(el('#googleMap').parentElement,el('.map-viewport'));
assert.equal(el('#mapPickCard').parentElement,el('.map-viewport'));
assert.equal(el('.captain-map-frame').parentElement,el('.map-panel'));
assert.equal(w.document.querySelectorAll('.captain-map-frame img').length,1);
el('.map-viewport').getBoundingClientRect=()=>({left:114,top:66,width:500,height:450});
run('state.mapPickOverlay=null;document.querySelector("#mapPickCard").hidden=false;anchorMapPick({domEvent:{clientX:314,clientY:266}})');
assert.equal(run('state.mapPickPixel.x'),200);assert.equal(run('state.mapPickPixel.y'),200);
assert.equal(el('#mapPickCard').style.left,'216px');
run('anchorMapPick({domEvent:{clientX:604,clientY:266}})');
assert.equal(el('#mapPickCard').dataset.side,'left');assert(parseFloat(el('#mapPickCard').style.left)+218<=500);
console.log('PASS: flat Google Maps viewport, decorative frame isolation and offset popup anchoring');

await tick();await tick();dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
