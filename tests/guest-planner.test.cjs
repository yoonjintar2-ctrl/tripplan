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
// Deliberately do NOT load guest-drafts.js: reproduce the production missing-script failure.
assert.equal(w.GuestDrafts,undefined);
vm.runInContext(utils+'\n'+clock+'\n'+code,c);
const run=s=>vm.runInContext(s,c),el=s=>w.document.querySelector(s),tick=()=>new Promise(r=>setImmediate(r));
(async()=>{
// Begin at the actual Add schedule button before Auth initialization finishes.
Object.defineProperty(w.crypto,'randomUUID',{value:undefined,configurable:true});
let finishSession;
const startupBackend=run('supabase');
startupBackend.auth.getSession=()=>new Promise(resolve=>{finishSession=resolve});
startupBackend.auth.onAuthStateChange=()=>{};
const startup=run('initializeAuth()');
el('#addScheduleButton').click();
assert(el('#scheduleDialog').open,'first Add schedule opens the editor, not Google login');
assert(!el('#accountDialog').open);
assert.match(run('state.trip.id'),/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/);
el('#scheduleName').value='첫 화면에서 작성 중';
el('#scheduleName').dispatchEvent(new w.Event('input',{bubbles:true}));
const startupId=run('state.trip.id');
finishSession({data:{session:null},error:null});await startup;
assert.equal(run('state.trip.id'),startupId);
assert.equal(el('#scheduleName').value,'첫 화면에서 작성 중','late auth must not reset guest form');
el('#scheduleDialog').close();
console.log('PASS: direct first-click creation, delayed Auth, missing randomUUID and unfinished form preservation');
assert.equal(el('#manageTripsButton').textContent,'여행 관리');
el('#manageTripsButton').click();
assert(el('#tripDialog').open,'actual start menu opens without a global GuestDrafts script');
assert.equal(run('guestWritable()'),true);
el('#tripForm [name="title"]').value='게스트 메뉴에서 만든 여행';
await run('saveTrip({preventDefault(){},currentTarget:document.querySelector("#tripForm")})');
assert.equal(run('state.trip.title'),'게스트 메뉴에서 만든 여행');
assert.equal(calls.writes.length,0);
run('state.followClock=false');assert.equal(run('canEdit()'),true);assert.equal(el('#guestNotice').hidden,false);assert.equal(el('#accountDialog').open,false);
run('openSchedule()');el('#scheduleName').value='비로그인 카페';el('#scheduleName').dispatchEvent(new w.Event('input',{bubbles:true}));
assert.equal(JSON.parse(w.localStorage.getItem(run('GuestDrafts.KEY'))).editor.fields.name.value,'비로그인 카페');
run('state.guestBook=null;initializeGuest()');assert.equal(el('#scheduleName').value,'비로그인 카페','reload restores unfinished form');
await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');assert.equal(run('state.items[0].name'),'비로그인 카페');assert.equal(calls.writes.length,0,'guest never writes anonymous database rows');
run('state.items=[];state.guestBook=null;initializeGuest()');assert.equal(run('state.items[0].name'),'비로그인 카페');
run('openSchedule(state.items[0])');
el('#scheduleName').value='수정한 게스트 일정';el('#savedMemo').value='메모도 보존';
el('#settlementEnabled').checked=true;el('#settlementEnabled').dispatchEvent(new w.Event('change',{bubbles:true}));el('#scheduleForm [name="cost"]').value='12000';
await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');
assert.equal(run('state.items.length'),1);assert.equal(run('state.items[0].memo'),'메모도 보존');assert.equal(run('state.items[0].cost_won'),12000);
run('openSchedule(state.items[0])');el('#scheduleName').value='비로그인 카페';
await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');
run('state.mapPickedPlace={displayName:"지도 선택 테스트",formattedAddress:"예시",location:{lat:()=>35,lng:()=>135},googleMapsURI:"https://maps.google.com/?q=35,135"}');
el('#addMapPlace').click();await tick();
assert(el('#scheduleDialog').open,'map add opens guest editor');assert(!el('#accountDialog').open);
el('#scheduleDialog').close();
console.log('PASS: guest edit, memo, settlement and map-selected place editor');
// Sample preview never replaces a guest draft or writes demo rows to the server.
const guestId=run('state.trip.id'), beforeSample=w.localStorage.getItem(run('GuestDrafts.KEY'));
assert([...el('#tripSelect').options].some(option=>option.value==='sample-seoul-day'));
await run('switchTrip(SAMPLE_TRIP_ID)');
assert.equal(run('state.items.length'),4);assert.equal(run('canEdit()'),false);
assert.equal(el('#tripSelect').value,'sample-seoul-day');
assert.equal(w.localStorage.getItem(run('GuestDrafts.KEY')),beforeSample);
assert.equal(calls.writes.length,0);
await run('switchTrip('+JSON.stringify(guestId)+')');
assert.equal(run('state.items[0].name'),'비로그인 카페');assert.equal(run('canEdit()'),true);
assert.equal(w.localStorage.getItem(run('GuestDrafts.KEY')),beforeSample);
console.log('PASS: first-visitor sample dropdown, read-only preview and lossless return to guest plan');
const event=new w.Event('beforeunload',{cancelable:true});w.dispatchEvent(event);assert(event.defaultPrevented);
const a=w.document.createElement('a');a.href='https://example.com/';a.textContent='떠나기';w.document.body.append(a);a.click();assert(el('#guestLeaveDialog').open);el('#guestStay').click();assert(!el('#guestLeaveDialog').open);
let oauth=0;run('supabase.auth.signInWithOAuth=async()=>{state.oauthSnapshot=JSON.parse(localStorage.getItem(GuestDrafts.KEY));return {error:{message:"사용자가 취소했습니다"}}}');
await run('signInWithGoogle()');assert.equal(run('state.oauthSnapshot.records[0].items[0].name'),'비로그인 카페');assert.equal(run('Boolean(state.oauthSnapshot.pending)'),true);assert.equal(run('state.guestOAuthLeaving'),false);
run('initializeGuest()');assert.equal(run('guestWritable()'),true,'cancel allows continued guest editing');
// Execute the actual OAuth return path against a stateful fake server.
const api=require('./helpers/guest-cloud.cjs').client();
const backend=run('supabase');backend.from=api.from;
backend.auth.getSession=async()=>({data:{session:{user:{id:'google-owner',email:'owner@example.test',user_metadata:{full_name:'로그인 사용자'}}}},error:null});
backend.auth.onAuthStateChange=fn=>{calls.authChanged=fn;};
run('openSchedule()');el('#scheduleName').value='로그인 전에 입력 중';el('#scheduleName').dispatchEvent(new w.Event('input',{bubbles:true}));
run('state.guestBook.pending={requestedAt:Date.now(),userId:null};writeGuestBook();state.guestMode=false;state.guestBook=null;state.cloudLoads=0;loadCloudWorkspace=async()=>{state.cloudLoads++;const b=guestStore.read(),r=b.records[0];state.trip={...r.trip,owner_id:state.session.user.id};state.items=r.items;state.trips=[state.trip];render();};');
await run('initializeAuth()');assert.equal(api.db.mt_trips.size,1);assert.equal([...api.db.mt_trips.values()][0].title,'게스트 메뉴에서 만든 여행');assert.equal(api.db.mt_itinerary_items.size,1);assert.equal(run('state.guestBook.dirty'),false);assert.equal(el('#scheduleName').value,'로그인 전에 입력 중');assert(el('#scheduleDialog').open);assert.equal(run('canEdit()'),true);
const writes=api.calls.filter(c=>c.action!=='select').length;
await run('restoreWorkspace()');assert.equal(api.calls.filter(c=>c.action!=='select').length,writes,'repeated auth restoration does not duplicate upload');
// Returning visitors restore the existing session without opening Google again.
let googleRedirects=0;backend.auth.signInWithOAuth=async()=>{googleRedirects++;return {error:{message:'unexpected'}}};
run('state.session=null');await run('initializeAuth()');
assert.equal(run('state.session.user.id'),'google-owner');assert.equal(googleRedirects,0);
await run('switchTrip(SAMPLE_TRIP_ID)');assert.equal(run('canEdit()'),false);
run('leaveSampleTrip()');assert.equal(run('state.trip.owner_id'),'google-owner');
console.log('PASS: persisted session restores without OAuth and account plans survive sample preview');
run('document.querySelector("#scheduleDialog").close();state.session=null;state.guestMode=false;initializeGuest();');assert.equal(run('state.items.length'),0,'signout does not show previous account backup');
console.log('PASS: actual auth initialization transfers once, loads cloud afterwards, restores unfinished form, and hides prior account backup on signout');
// Roster, dates, categories and costs retain their guest values.
run('openTripManager()');el('#tripForm [name="title"]').value='우리의 첫 여행';await run('saveTrip({preventDefault(){},currentTarget:document.querySelector("#tripForm")})');assert.equal(run('state.trip.title'),'우리의 첫 여행');
run('openSchedule()');el('#scheduleName').value='새 임시 일정';await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');const item=run('state.items[0].id');w.confirm=()=>true;await run('deleteSchedule('+JSON.stringify(item)+')');assert.equal(run('state.items.length'),0);assert.equal(calls.writes.length,0);
// Fail durable handoff before calling OAuth when storage is unavailable.
run('guestStore.write=()=>{throw new Error("quota")};supabase.auth.signInWithOAuth=async()=>{state.unexpectedOAuth=true;return {data:{url:"https://example.com"}}}');
await run('signInWithGoogle()');assert.equal(run('Boolean(state.unexpectedOAuth)'),false);assert.equal(run('state.guestOAuthLeaving'),false);
// Public shared trips remain read-only and never become a guest-owned trip.
run('state.guestMode=false;state.session=null;state.trip={id:"public-trip",owner_id:"someone",title:"공유",start_date:todayString(),end_date:todayString(),categories:[]};');assert.equal(run('canEdit()'),false);run('openSchedule()');assert(el('#accountDialog').open);
console.log('PASS: anonymous editing, unfinished-form reload, schedule persistence, OAuth cancellation and checkpoint, leave prompt, guest management, quota-blocked login, shared-trip read-only');
await tick();dom.window.close();
})().catch(e=>{console.error(e);dom.window.close();process.exitCode=1});
