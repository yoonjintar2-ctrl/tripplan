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
// Real DOM actions with isolated service mocks; SQL regression covers live RLS.
run('initializeGuest();openTripManager()');
const initial=run('state.trip.id');
run(`state.trip.start_date='2026-10-01';state.trip.end_date='2026-10-03';state.items=[{id:'first',item_date:'2026-10-01',name:'첫 일정',memo:'보존',cost_won:12000},{id:'last',item_date:'2026-10-03',name:'마지막 일정',participant_ids:[]}];commitGuest();resetTripForm(state.trip);`);
el('#tripForm [name=startDate]').value='2026-11-01';el('#tripForm [name=endDate]').value='2026-11-02';
await run('saveTrip({preventDefault(){},currentTarget:document.querySelector("#tripForm")})');
assert.equal(run('state.items.length'),2);assert.equal(run('state.items[1].id'),'last');assert.equal(run('state.items[1].item_date'),'2026-11-02');assert.equal(run('state.items[0].memo'),'보존');assert.equal(run('state.items[0].cost_won'),12000);
await run('manualSave()');assert.equal(JSON.parse(w.localStorage.getItem(run('GuestDrafts.KEY'))).records.find(r=>r.trip.id===initial).items.length,2);
run('state.guestBook=null;initializeGuest()');assert.equal(run('state.items[1].item_date'),'2026-11-02','changed dates survive reload');
run('openSchedule()');let pickerCalls=0;el('#scheduleDate').showPicker=()=>pickerCalls++;el('#scheduleDate').click();assert.equal(pickerCalls,1);
await run('initMap();renderEditorMap()');await tick();assert.equal(run('state.editorMap.getCenter().lat()'),37.5665);
await run('handleEditorMapClick({latLng:{lat:()=>37.56,lng:()=>126.97},stop(){}})');assert.equal(el('#scheduleName').value,'','coordinate does not become a fake schedule name');
run(`selectGooglePlace({id:'cafe',displayName:'실제 카페',location:{lat:()=>37.5,lng:()=>127},googleMapsURI:'https://www.google.com/maps/?q=cafe'})`);
assert.equal(el('#scheduleName').value,'실제 카페');el('#scheduleName').value='내가 붙인 이름';el('#scheduleName').dispatchEvent(new w.Event('input',{bubbles:true}));
await run('handleEditorMapClick({latLng:{lat:()=>37.56,lng:()=>126.97},stop(){}})');assert.equal(el('#scheduleName').value,'내가 붙인 이름');
console.log('PASS: guest date shrink preserves all schedules and content across reload; full-field picker; Seoul default; named/unnamed locations');
const cloud=require('./helpers/guest-cloud.cjs').client(),backend=run('supabase');
backend.from=cloud.from;run(`state.guestMode=false;state.session={user:{id:'invited',email:'invite@example.test'}}`);
cloud.db.mt_trip_members.set('tripinvited',{trip_id:'trip',user_id:'invited',role:'viewer'});
await run('joinInvitedTrip("trip","sample-invitation-token")');assert.equal(cloud.calls.filter(c=>c.action==='insert').length,0,'reopening invite retains viewer permission');
await run('joinInvitedTrip("other-trip","sample-invitation-token")');assert.equal(cloud.db.mt_trip_members.get('other-tripinvited').role,'editor');
// Populate cloud data and authoritative account response.
cloud.db.mt_profiles=new Map([['invited',{id:'invited',display_name:'초대된 사람'}]]);
cloud.db.mt_trips.set('trip',{id:'trip',owner_id:'owner',title:'공유 여행',start_date:'2026-11-01',end_date:'2026-11-02',updated_at:new Date().toISOString()});
backend.rpc=async(name)=>name==='mt_trip_accounts'?{data:[{user_id:'invited',role:'viewer',email:'invite@example.test',display_name:'초대된 사람'}],error:null}:{data:null,error:null};
// Add the ordering chain used by loadTripData.
const baseFrom=backend.from;backend.from=(table)=>{const q=baseFrom(table);q.order=()=>q;return q;};
await run('loadTripData("trip")');run('state.trips=[state.trip];resetTripForm(state.trip);renderMembers()');
assert(el('#tripAccounts').textContent.includes('invite@example.test'));assert(el('#tripAccounts').textContent.includes('열람 전용'));
run(`state.members[0].role='editor';renderMembers();render()`);assert(el('#tripAccounts').textContent.includes('수정 권한 있음'));assert.equal(el('#manualSaveButton').hidden,false);
run(`state.lastSavedAt=new Date();state.syncMessage='실시간 저장됨';updateAutoSaveStatus()`);assert.equal(el('#syncStatus').textContent,'0분 전에 저장');
await run('manualSave()');assert.equal(el('#syncStatus').textContent,'0분 전에 저장');assert.equal(cloud.calls.filter(c=>c.action==='upsert').length,0,'manual confirmation cannot overwrite another editor');
const before=run('state.lastSavedAt.getTime()');backend.from=()=>{const q={select:()=>q,eq:()=>q,single:()=>q,then:(resolve)=>Promise.resolve({error:{message:'offline'}}).then(resolve)};return q;};
await run('manualSave()');assert.equal(run('state.lastSavedAt.getTime()'),before);assert(el('#syncStatus').textContent.includes('실패'));
run(`getPlaceDetails=async()=>({displayName:'리뷰 장소',photos:[],googleMapsURI:'https://www.google.com/maps/?q=seoul',reviews:Array.from({length:5},(_,i)=>({text:'전체 리뷰 '+i,authorAttribution:{displayName:'작성자 '+i},rating:5}))});state.previewItemId='review';`);
await run(`renderPlacePreview({id:'review',name:'리뷰 장소',maps_url:'https://www.google.com/maps/?q=seoul'})`);
assert.equal(w.document.querySelectorAll('.review-entry').length,5);assert(el('.all-reviews-link').href.startsWith('https://www.google.com/maps/'));
console.log('PASS: invite joins once without role escalation; authoritative account roster; save age and offline handling; all five reviews with full-review link');
})().catch(error=>{console.error(error);process.exitCode=1});
