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
run(`initializeGuest();state.trip.start_date='2099-10-01';state.trip.end_date='2099-10-03';state.items=[{id:'a',name:'첫 일정',item_date:'2099-10-01'},{id:'b',name:'두 번째 일정',item_date:'2099-10-02',memo:'눌렀을 때 보이는 내용'}];commitGuest();state.activeDate='2099-10-02';render();`);
assert.equal(el('.mobile-agenda-details'),null);
el('[data-item-id=b]').click();assert.equal(el('.mobile-agenda-details'),null);el('[data-expand-item=b]').click();assert.match(el('.mobile-agenda-details').textContent,/눌렀을 때/);
el('[data-expand-item=b]').click();assert.equal(el('.mobile-agenda-details'),null);el('[data-expand-item=b]').click();
const id=run('state.trip.id');
run('state.selectedId=null;state.activeDate=state.trip.start_date;state.guestBook=null;initializeGuest()');
assert.equal(run('state.trip.id'),id);assert.equal(run('state.selectedId'),'b');assert.equal(run('state.activeDate'),'2099-10-02');
run(`state.guestBook.records.push({trip:{...state.trip,id:'other',title:'다른 여행'},items:[]});writeGuestBook();loadGuestRecord('other');loadGuestRecord('${id}');`);
assert.equal(run('state.selectedId'),'b');run('state.guestBook=null;initializeGuest()');assert.equal(run('state.trip.id'),id);
run('openTripManager()');assert.equal(el('#tripDialog').dataset.panel,'list');el('[data-trip-panel=details]').click();assert.equal(el('#tripDialog').dataset.panel,'details');el('[data-trip-panel=list]').click();assert.equal(el('#tripDialog').dataset.panel,'list');
const activeBefore=w.document.activeElement;el('#addTraveler').click();assert.equal(w.document.activeElement,activeBefore,'adding traveler must not summon keyboard');el('#avatarDialog').showModal();el('#avatarDialog .dialog-close').click();assert.equal(el('#avatarDialog').open,false);assert.equal(el('#lookDialog').open,false);el('#lookDialog').showModal();el('#lookDialog .dialog-close').click();assert.equal(el('#lookDialog').open,false);
el('#tripDialog').close();el('#mobileAddScheduleButton').click();assert(el('#scheduleDialog').open);
let alerts=[];w.alert=message=>alerts.push(message);el('#scheduleDate').value='2099-10-04';el('#scheduleDate').dispatchEvent(new w.Event('change'));
assert.match(alerts[0],/여행관리/);const count=run('state.items.length');el('#scheduleName').value='기간 밖 일정';
await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');assert.equal(run('state.items.length'),count);assert(el('#scheduleDialog').open);
el('#scheduleDate').value='2099-10-03';el('#scheduleDate').dispatchEvent(new w.Event('change'));assert.equal(el('#formError').textContent,'');
run(`state.guestMode=false;state.session={user:{id:'account-a'}};state.activeDate='2099-10-02';state.selectedId='b';persistView();state.activeDate='2099-10-01';state.selectedId=null;restoreView()`);assert.equal(run('state.selectedId'),'b');
run(`state.session={user:{id:'account-b'}}`);assert.equal(run('readView().tripId'),undefined,'account views are isolated');
const backend=run('supabase');let handler;backend.auth.getSession=async()=>({data:{session:{user:{id:'account-a'}}},error:null});backend.auth.onAuthStateChange=fn=>handler=fn;
run('globalThis.loads=0;restoreWorkspace=async()=>{loads++;state.loadedUserId=state.session.user.id;}');
await run('initializeAuth()');assert.equal(run('loads'),1);w.setTimeout=fn=>fn();handler('SIGNED_IN',{user:{id:'account-a'}});await tick();assert.equal(run('loads'),1,'same-account focus sign-in must not reset workspace');
Object.defineProperty(w,'visualViewport',{value:{height:640,scale:1},configurable:true});run('syncVisibleViewport()');assert.equal(w.document.documentElement.style.getPropertyValue('--visible-height'),'640px');w.visualViewport.height=480;run('syncVisibleViewport()');assert.equal(w.document.documentElement.style.getPropertyValue('--visible-height'),'480px');
run("state.mobileExpandedId='b';state.selectedId=null;render()");assert.equal(run('state.mobileExpandedId'),null);assert.equal(el('.mobile-agenda-details'),null);
console.log('PASS: guest trip/day/item reload and switches; account-scoped view restore; repeated sign-in focus; mobile detail/menu actions; out-of-trip date blocked before saving');
})().catch(error=>{console.error(error);process.exitCode=1});
