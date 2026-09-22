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
class FakeMap {constructor(el,opts){this.center=opts.center?.lat instanceof Function?opts.center:new LatLng(opts.center.lat,opts.center.lng);this.zoom=opts.zoom;this.listeners={};this.mapTypes=new Map()}setMapTypeId(id){this.mapTypeId=id}addListener(n,f){this.listeners[n]=f}getCenter(){return this.center}getZoom(){return this.zoom}setZoom(v){this.zoom=v}setCenter(v){this.center=typeof v.lat==='function'?v:new LatLng(v.lat,v.lng)}panTo(v){calls.pan++;this.setCenter(v)}fitBounds(){calls.fit=(calls.fit||0)+1;}}
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
run(`initializeGuest();state.trip.start_date='2099-10-01';state.trip.end_date='2099-10-03';state.activeDate='2099-10-01';state.items=[{id:'a',name:'첫 일정',item_date:'2099-10-01',latitude:37,longitude:127},{id:'b',name:'끝 일정',item_date:'2099-10-01',latitude:38,longitude:128},{id:'c',name:'다음날 첫 일정',item_date:'2099-10-02',latitude:39,longitude:129}];commitGuest();state.selectedId='b';render();`);
w.matchMedia=()=>({matches:true});
await run('initMap()');await tick();
run("selectDay('2099-10-01')");await tick();assert.equal(run('state.selectedId'),null);assert(calls.fit>0);const before=calls.fit;
run("selectStop('b',true)");await tick();assert.equal(calls.fit,before,'item selection must not refit bounds');
await run('navigateStop(1)');assert.equal(run('state.activeDate'),'2099-10-02');assert.equal(run('state.selectedId'),'c');assert.equal(el('#dayTransition').textContent,'다음날');assert(el('#dayTransition').hidden);
await run('navigateStop(-1)');assert.equal(run('state.activeDate'),'2099-10-01');assert.equal(run('state.selectedId'),'b');assert.equal(el('#dayTransition').textContent,'하루 전');
run("selectStop('a')");await run('navigateStop(-1)');assert.equal(run('state.activeDate'),'2099-10-01');
run("selectDay('2099-10-02');selectStop('c')");await run('navigateStop(1)');assert.equal(run('state.activeDate'),'2099-10-03');assert.equal(run('state.selectedId'),null);assert(el('#nextStop').disabled);await run('navigateStop(-1)');assert.equal(run('state.selectedId'),'c');
assert(el('#routeCounter').hidden);assert.match(el('#nextStop').textContent,/다음 일정/);
run("state.mapSearchItem={id:'search',name:'검색 장소',maps_url:'https://www.google.com/maps/?q=x'};updatePlaceCard(state.mapSearchItem)");assert.equal(el('#placeMore').parentElement.id,'mapSearchPlaceActions');run("updatePlaceCard(state.items[0])");assert.equal(el('#placeMore').parentElement.id,'placeCardDetails');
// A schedule without place_id must reuse the preview's resolved Place, not coordinates.
const resolved={displayName:'빅벤',photos:[{getURI:()=> 'https://example.com/bigben.jpg'}],reviews:[{text:'좋아요'}]};
w.resolvedPlace=resolved;
run("state.placeCache.set('a',resolvedPlace);state.items[0].maps_url='https://www.google.com/maps/?q=BigBen';updatePlaceCard(state.items[0])");
let opened;w.PlaceInfo={open:async load=>{opened=await load()}};
el('#placeMore').click();await tick();assert.equal(opened,resolved);assert.equal(opened.photos.length,1);assert.equal(opened.reviews[0].text,'좋아요');
assert(el('#dayTransition img'),'transition retains Captain');
console.log('PASS: cross-day forward/back, trip boundaries, empty day, day-only fit bounds, split navigation and search details placement');
})().catch(e=>{console.error(e);process.exitCode=1});
