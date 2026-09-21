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
run('initializeGuest()');await run('initMap()');assert.equal(el('#mapDayLabel'),null);
el('#toggleMapSearch').click();assert.equal(el('#toggleMapSearch').getAttribute('aria-expanded'),'true');
run(`findGooglePlaces=async()=>[{id:'cafe',displayName:'서울 카페',formattedAddress:'서울 종로구',location:{lat:()=>37.57,lng:()=>126.98},googleMapsURI:'https://www.google.com/maps/?q=seoul'}]`);
el('#mapSearchInput').value='서울 카페';await run('searchMainMap({preventDefault(){}})');
assert.equal(w.document.querySelectorAll('.map-search-result').length,1);el('.map-search-result').click();await tick();
assert.equal(el('#placeName').textContent,'서울 카페');assert.equal(el('#placeMemo').textContent,'서울 종로구');assert.equal(el('#mapSearchPlaceActions').hidden,false);assert(el('#placeCard').classList.contains('is-search-preview'));assert.equal(run('state.map.getCenter().lat()'),37.57);
assert.equal(run('state.items.length'),0,'preview does not add an itinerary');
el('#addSearchPlace').click();assert(el('#scheduleDialog').open);assert.equal(el('#scheduleName').value,'서울 카페');assert.equal(run('state.pendingPlace.placeId'),'cafe');
await run('saveSchedule({preventDefault(){},currentTarget:document.querySelector("#scheduleForm")})');assert.equal(run('state.items[0].place_id'),'cafe');
el('#closeSearchPlace').click();assert.equal(el('#mapSearchPlaceActions').hidden,true);
let resolveOld;w.resolveOld=null;run('findGooglePlaces=()=>new Promise(resolve=>globalThis.resolveOld=resolve)');el('#mapSearchInput').value='이전 검색';const pending=run('searchMainMap()');
el('#mapSearchInput').value='다음 검색';el('#mapSearchInput').dispatchEvent(new w.Event('input'));
run(`resolveOld([{id:'old',displayName:'오래된 결과'}])`);await pending;assert.equal(el('#mapSearchResults').hidden,true);
run('findGooglePlaces=async()=>[]');await run('searchMainMap()');assert.match(el('#mapSearchStatus').textContent,/검색 결과가 없습니다/);
run('findGooglePlaces=async()=>{throw new Error("연결 실패")}');await run('searchMainMap()');assert.match(el('#mapSearchStatus').textContent,/연결 실패/);
console.log('PASS: map search, location preview, guest schedule handoff/save, close, stale results, empty and failed searches');
})().catch(error=>{console.error(error);process.exitCode=1});
