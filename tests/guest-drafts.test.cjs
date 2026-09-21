const {strict:assert}=require('assert');const fs=require('fs'),vm=require('vm');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync('dist/guest-drafts.js','utf8'),ctx);
const {Store,transfer,KEY}=ctx.window.GuestDrafts;
class Memory{constructor(){this.values=new Map()}getItem(k){return this.values.get(k)||null}setItem(k,v){this.values.set(k,v)}}
const {client}=require('./helpers/guest-cloud.cjs');
const seed=store=>store.write({...store.read(),records:[{trip:{id:'trip-a',title:'교토',destination:'',start_date:'2026-10-01',end_date:'2026-10-02',categories:['관광'],travelers:[{id:'person-a',nickname:'나',avatar:'male-001',appearance:{hair:'white'}}]},items:[{id:'item-a',trip_id:'trip-a',name:'카페',item_date:'2026-10-01',maps_url:null,participant_ids:['person-a'],split_ratios:{'person-a':100},settlement_enabled:true,cost_won:12000,memo:'창가 자리',transport_mode:'DRIVING'}]}],activeId:'trip-a',dirty:true,pending:{userId:null},editor:{kind:'schedule',fields:{name:{value:'아직 저장하지 않은 일정'}}}});
(async()=>{
 const memory=new Memory(),store=new Store(memory);let book=seed(store),api=client();api.failItems=true;
 await assert.rejects(transfer(api,store,book,'user-a'),e=>e.message==='offline');
 assert.equal(store.read().dirty,true);assert.equal(store.read().pending.userId,'user-a');assert.equal(store.read().records[0].items[0].memo,'창가 자리');
 await assert.rejects(transfer(api,store,store.read(),'user-b'),/같은 Google/);
 api.failItems=false;book=await transfer(api,new Store(memory),store.read(),'user-a');
 assert.equal(book.dirty,false);assert.equal(book.importedFor,'user-a');assert.equal(book.editor.fields.name.value,'아직 저장하지 않은 일정');
 assert.equal(api.db.mt_trips.size,1);assert.equal(api.db.mt_itinerary_items.size,1);assert.equal(api.db.mt_itinerary_items.get('item-a').transport_mode,'DRIVING');assert.equal(api.db.mt_itinerary_items.get('item-a').created_by,'user-a');assert.equal(api.db.mt_trips.get('trip-a').travelers[0].appearance.hair,'white');
 const n=api.calls.length;await transfer(api,store,book,'user-a');assert.equal(api.calls.length,n,'duplicate SIGNED_IN does no writes');
 const m2=new Memory(),s2=new Store(m2);book=seed(s2);api=client();api.loseTripReply=true;
 await assert.rejects(transfer(api,s2,book,'user-a'),e=>e.message==='response lost');
 await transfer(api,s2,s2.read(),'user-a');assert.equal(api.db.mt_trips.size,1,'response loss cannot duplicate trip');
 const s3=new Store(new Memory());const stale=s3.read();s3.write(stale);assert.throws(()=>s3.write(stale),/다른 탭/);
 const blocked=new Store({getItem:()=>null,setItem(){throw new Error('quota')}});assert.throws(()=>blocked.write(blocked.read()),/quota/);
 const corrupt=new Store({getItem:()=>'{broken'});assert.throws(()=>corrupt.read());
 const s4=new Store(new Memory());const b4=seed(s4);api=client();await assert.rejects(transfer(api,s4,b4,'user-a',()=>false),/계정이 바뀌어/);assert.equal(api.calls.length,0);
 console.log('PASS: reload-safe guest snapshot, partial upload retry, stable IDs, lost responses, account binding, preserved roster/settlement/editor, duplicate auth events, quota/corrupt storage and tab conflict');
})().catch(e=>{console.error(e);process.exitCode=1});
