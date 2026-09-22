// BEGIN BUNDLED GUEST DRAFTS
/* Durable guest handoff. No anonymous database writes or relaxed RLS. */
const GuestDrafts = (() => {
  const KEY = 'tripplan-guest-workspace-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  class Store {
    constructor(storage) { this.storage = storage; }
    read() {
      const raw = this.storage.getItem(KEY);
      if (!raw) return {version:1,revision:0,records:[],activeId:null,dirty:false,pending:null,editor:null,importedFor:null};
      const value = JSON.parse(raw);
      if (value.version !== 1 || !Array.isArray(value.records) || !Number.isInteger(value.revision)) throw new Error('임시 계획을 읽지 못했습니다. 브라우저 데이터를 지우지 말고 이 화면을 유지해 주세요.');
      return value;
    }
    write(value) {
      if (this.read().revision !== value.revision) throw new Error('다른 탭에서 임시 계획이 바뀌었습니다. 열린 입력창을 닫고 다시 시도해 주세요.');
      const next = {...clone(value),revision:value.revision+1};
      const raw = JSON.stringify(next);
      this.storage.setItem(KEY,raw);
      if (this.storage.getItem(KEY) !== raw) throw new Error('임시 계획 보관을 확인하지 못했습니다. 이 화면을 닫지 말고 다시 시도해 주세요.');
      return next;
    }
  }
  const tripFields = ['id','title','destination','start_date','end_date','categories','travelers'];
  const itemFields = ['id','trip_id','item_date','start_time','end_time','icon','name','maps_url','place_id','latitude','longitude','category','memo','cost_won','settlement_enabled','participant_ids','split_ratios','sort_order','transport_mode'];
  const pick = (value, fields) => Object.fromEntries(fields.filter(k=>value[k]!==undefined).map(k=>[k,clone(value[k])]));
  async function transfer(client, store, book, userId, current = () => true, checkpoint = () => {}) {
    if (!book.dirty || !book.pending) return book;
    if (book.pending.userId && book.pending.userId !== userId) throw new Error('이 임시 계획은 먼저 연결한 계정으로 저장 중입니다. 같은 Google 계정으로 다시 로그인해 주세요.');
    const check = () => { if (!current()) throw new Error('로그인 계정이 바뀌어 저장을 멈췄습니다. 임시 계획은 유지됩니다.'); };
    const save = () => { book=store.write(book); checkpoint(book); };
    check(); book.pending.userId=userId; save();
    for (const record of book.records) {
      check();
      let result=await client.from('mt_trips').select('id,owner_id').eq('id',record.trip.id).maybeSingle();
      if(result.error) throw result.error;
      if(!result.data){
        check();
        const inserted=await client.from('mt_trips').insert({...pick(record.trip,tripFields),owner_id:userId});
        if(inserted.error && inserted.error.code!=='23505') throw inserted.error;
        result=await client.from('mt_trips').select('id,owner_id').eq('id',record.trip.id).single();
        if(result.error) throw result.error;
      }
      if(result.data?.owner_id!==userId) throw new Error('임시 여행의 소유 계정을 확인하지 못했습니다. 원본은 보관됩니다.');
      check();
      const member=await client.from('mt_trip_members').upsert({trip_id:record.trip.id,user_id:userId,role:'owner'},{onConflict:'trip_id,user_id',ignoreDuplicates:true});
      if(member.error) throw member.error;
      for(let offset=0;offset<record.items.length;offset+=100){
        check();
        const rows=record.items.slice(offset,offset+100).map(item=>({...pick(item,itemFields),trip_id:record.trip.id,created_by:userId}));
        const saved=await client.from('mt_itinerary_items').upsert(rows,{onConflict:'id',ignoreDuplicates:true});
        if(saved.error) throw saved.error;
        check();
        const verified=await client.from('mt_itinerary_items').select('id').eq('trip_id',record.trip.id).in('id',rows.map(row=>row.id));
        if(verified.error) throw verified.error;
        const ids=new Set((verified.data||[]).map(row=>row.id));
        if(rows.some(row=>!ids.has(row.id))) throw new Error('일부 일정의 저장을 확인하지 못했습니다. 다시 저장해 주세요.');
      }
    }
    check(); book.dirty=false; book.pending=null; book.importedFor=userId; save();
    return book; // Keep recovery backup; never erase the original on a partial failure.
  }
  return {KEY,Store,transfer,clone};
})();
// END BUNDLED GUEST DRAFTS

import {clockParts,tripPhase,currentSchedule} from './trip-clock.js';
import {travelersFor, attendeesFor, allocateCost, parseMapsUrl, isGoogleMapsUrl, personStops, authRedirectUrl, retryWorkspaceLoad, shiftScheduleDates} from "./travel-utils.js?v=17";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.111.0/+esm";

const SUPABASE_URL = "https://jiaqobfriamuxtvxhrls.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_OQ50_TYVty0yFuVVrbe7kA_Kn9uZ5bR";
const GOOGLE_MAPS_KEY = "AIzaSyDXMAandzVKkP0uutdEZ2Qdn7jTs0MCBvw";
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
});

const $ = (selector, parent = document) => parent.querySelector(selector);
const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];
const won = value => `₩${Math.round(Number(value || 0)).toLocaleString("ko-KR")}`;
const safe = value => String(value ?? "").replace(/[&<>'"]/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

// IDs must also work on browsers without crypto.randomUUID (for example HTTP).
// This is only an ID generator; it does not weaken OAuth/PKCE requirements.
function newLocalId() {
  if(typeof crypto.randomUUID==='function')return crypto.randomUUID();
  const bytes=crypto.getRandomValues(new Uint8Array(16));
  bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;
  const hex=Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
function hasSharedTripLink(){const params=new URLSearchParams(location.search);return Boolean(params.get('trip') && params.get('invite'));}

function todayString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
function blankTrip() {
  const today = todayString();
  return {
    id: null, owner_id: null, title: "새 여행을 만들어 주세요", destination: "NEXT DESTINATION",
    start_date: today, end_date: today, categories: ["음식", "관광", "이동", "쇼핑"], share_code: ""
  };
}

const state = {
  followClock: true, clockTrip: null, clockMinute: null,
  session: null,
  trip: blankTrip(),
  trips: [],
  members: [],
  items: [],
  activeDate: todayString(),
  selectedId: null,
  pendingPlace: null,
  map: null,
  markers: new Map(),
  route: null, routes: [], travelerMarkers: new Map(), mapRenderRequest: 0, routeAnimation: 0, routeDate: null,
  participantIds: null, travelerFilter: "all", draftTravelers: [], editorMap: null, editorMarker: null, editorMapRequest: 0,
  mapReady: false,
  placeCache: new Map(),
  placePreviewRequest: 0,
  placeResolveRequest: 0,
  lastSavedAt: null,
  syncMessage: "",
  workspaceLoad: null,
  realtimeChannel: null,
  reloadTimer: null,
  toastTimer: null
};

// Guest plans live locally until an explicit Google-login handoff.
let guestStore;
function isGuestTrip(trip=state.trip){return Boolean(state.guestMode && state.guestBook?.records.some(record=>record.trip.id===trip?.id));}
function guestHasWork(){return Boolean(state.guestBook?.dirty);}
function guestWritable(){return isGuestTrip() && !state.guestImporting && !state.guestBook.pending?.userId && !state.guestConflict;}
function writeGuestBook(){
  try{state.guestBook=guestStore.write(state.guestBook);state.guestStorageError='';return true;}
  catch(error){state.guestStorageError=error.message || '브라우저에 임시 저장할 공간이 없습니다.';if(/다른 탭/.test(state.guestStorageError))state.guestConflict=true;return false;}
}
function refreshGuestNotice(){
  const notice=$('#guestNotice');if(!notice)return;
  notice.hidden=!(state.guestMode || guestHasWork());
  $('#guestNoticeText').textContent=state.guestStorageError || (state.session && guestHasWork()?'계정 저장이 아직 완료되지 않았습니다. 임시 계획은 보관 중이에요. 다시 저장해 주세요.':'로그인하지 않은 계획은 브라우저 데이터 삭제·다른 기기 이동 시 사라질 수 있어요. 계획을 유지하려면 Google 로그인해 주세요.');
  $('#guestSaveButton').textContent=state.session?'계정에 저장 다시 시도':'Google 로그인하고 계획 유지';
  $('#guestSaveButton').disabled=Boolean(state.guestImporting);
  $('#guestFormRecovery').hidden=!(state.guestBook?.editor && !state.guestRestoring);
  window.removeEventListener('beforeunload',guestBeforeUnload);
  if(guestHasWork())window.addEventListener('beforeunload',guestBeforeUnload);
}
function commitGuest(){
  if(!isGuestTrip())return;
  const record=state.guestBook.records.find(value=>value.trip.id===state.trip.id);
  record.trip=GuestDrafts.clone(state.trip);record.items=GuestDrafts.clone(state.items);
  state.guestBook.activeId=state.trip.id;state.guestBook.dirty=true;
  state.trips=state.guestBook.records.map(value=>({...value.trip,_role:'owner'}));
  writeGuestBook();setSync(state.guestStorageError?'임시 저장 실패 · 브라우저를 닫지 마세요':'이 브라우저에 임시 보관 중');refreshGuestNotice();
}
// Per-account navigation is separate from editable trip data and guest transfer.
function viewKey(){return 'tripplan-view-v1-'+(state.guestMode?'guest':state.session?.user.id || 'public');}
function readView(){try{return JSON.parse(localStorage.getItem(viewKey()) || '{}');}catch{return {};}}
function persistView(){
  if(!state.trip.id || state.trip.id===SAMPLE_TRIP_ID || state.sampleReturn)return;
  try{
    const saved=readView();saved.tripId=state.trip.id;saved.trips ||= {};
    saved.trips[state.trip.id]={date:state.activeDate,itemId:state.selectedId,expandedId:state.mobileExpandedId};
    localStorage.setItem(viewKey(),JSON.stringify(saved));
    if(state.session && !state.guestMode)localStorage.setItem(`morrow-active-trip-${state.session.user.id}`,state.trip.id);
  }catch{/* Navigation storage failure must not prevent editing. */}
}
function restoreView(){
  const saved=readView().trips?.[state.trip.id];
  if(!saved)return;
  if(saved.date>=state.trip.start_date && saved.date<=state.trip.end_date)state.activeDate=saved.date;
  state.selectedId=state.items.find(item=>item.id===saved.itemId && item.item_date===state.activeDate)?.id || null;
  state.mobileExpandedId=saved.expandedId===state.selectedId?state.selectedId:null;
  // Resume the selected view first; subsequent ON AIR minute ticks still follow live time.
  const clock=clockParts();state.clockTrip=state.trip.id;state.clockSelectionKey=state.trip.id+'|'+clock.date+' '+clock.time;
}
function showTripManagerPanel(panel){
  $('#tripDialog').dataset.panel=panel;
  $$('[data-trip-panel]').forEach(button=>button.setAttribute('aria-selected',String(button.dataset.tripPanel===panel)));
}
function validateScheduleDate(notify=true){
  const input=$('#scheduleDate'),date=input.value;
  if(!date || (date>=state.trip.start_date && date<=state.trip.end_date))return true;
  const message='전체 여행 기간을 벗어난 날짜입니다. 여행관리에서 여행 시작일과 종료일을 먼저 수정해 주세요.';
  $('#formError').textContent=message;
  if(notify)window.alert(message);
  return false;
}
function loadGuestRecord(id){
  const record=state.guestBook.records.find(value=>value.trip.id===id);if(!record)return;
  state.guestMode=true;state.trip=GuestDrafts.clone(record.trip);state.items=GuestDrafts.clone(record.items);state.members=[];
  state.trips=state.guestBook.records.map(value=>({...value.trip,_role:'owner'}));state.activeDate=state.trip.start_date;state.selectedId=null;
  state.guestBook.activeId=id;restoreView();render();refreshGuestNotice();
}
function initializeGuest(){
  try{
    guestStore ||= new GuestDrafts.Store(localStorage);state.guestBook=guestStore.read();
    if(state.guestBook.importedFor){state.guestBook={...state.guestBook,records:[],activeId:null,dirty:false,editor:null,pending:null,importedFor:null};}
    // A canceled OAuth attempt without any cloud writes can still be edited.
    if(state.guestBook.pending && !state.guestBook.pending.userId)state.guestBook.pending=null;
    state.guestConflict=false;state.guestMode=true;
    if(!state.guestBook.records.length){
      const trip={...blankTrip(),id:newLocalId(),title:'나의 여행 계획',travelers:[{id:newLocalId(),nickname:'나',avatar:'male-001'}]};
      state.guestBook.records.push({trip,items:[]});state.guestBook.activeId=trip.id;
    }
    const active=state.guestBook.records.find(record=>record.trip.id===(readView().tripId || state.guestBook.activeId)) || state.guestBook.records[0];
    state.guestBook.activeId=active.trip.id;
    if(!writeGuestBook())throw new Error(state.guestStorageError);
    loadGuestRecord(active.trip.id);
    if(state.guestBook.pending?.userId && !state.session)recoverGuestEditing();
    setSync(guestHasWork()?'이 브라우저에 임시 보관 중':'로그인 없이 계획을 시작해 보세요');restoreGuestEditor();refreshGuestNotice();
  }catch(error){state.guestStorageError=error.message;showToast(error.message);setSync('임시 계획을 읽지 못했습니다');}
  return isGuestTrip();
}
function copyTripRecord(source, title=source.trip.title) {
  const tripId=newLocalId(),ids=new Map();
  const remap=id=>{if(!ids.has(id))ids.set(id,newLocalId());return ids.get(id);};
  const trip={...GuestDrafts.clone(source.trip),id:tripId,title,owner_id:null,share_code:'',_role:'owner'};
  delete trip.created_at;delete trip.updated_at;
  trip.travelers=(trip.travelers||[]).map(person=>({...person,id:remap(person.id)}));
  const itemIds=new Map();
  const items=source.items.map(item=>{const id=newLocalId();itemIds.set(item.id,id);const row={...GuestDrafts.clone(item),id,trip_id:tripId,created_by:null,
    participant_ids:item.participant_ids==null?null:item.participant_ids.map(remap),split_ratios:Object.fromEntries(Object.entries(item.split_ratios||{}).map(([id,value])=>[remap(id),value]))};delete row.created_at;delete row.updated_at;return row;});
  return {trip,items,ids,itemIds};
}
function recoverGuestEditing(){
  if(!isGuestTrip() || state.guestImporting)return false;
  try{
    if(state.guestConflict){
      if($('#scheduleDialog').open || $('#tripDialog').open)throw new Error('다른 탭에서 계획이 바뀌었습니다. 입력창을 닫고 다시 열어 최신 계획을 불러와 주세요.');
      const latest=guestStore.read();state.guestBook=latest;state.guestConflict=false;
      if(!latest.records.length)return initializeGuest();
      loadGuestRecord(latest.activeId||latest.records[0].trip.id);
    }
    if(state.guestBook.pending?.userId){
      // Preserve the frozen upload checkpoint, then continue on independent local IDs.
      const old=GuestDrafts.clone(state.guestBook),copies=old.records.map(record=>copyTripRecord(record));
      localStorage.setItem('tripplan-guest-recovery-'+old.pending.userId,JSON.stringify(old));
      const index=Math.max(0,old.records.findIndex(record=>record.trip.id===old.activeId));
      let editor=old.editor;
      if(editor){const n=old.records.findIndex(record=>record.trip.id===editor.tripId),copy=copies[n];if(copy){editor.tripId=copy.trip.id;if(editor.fields.itemId?.value)editor.fields.itemId.value=copy.itemIds.get(editor.fields.itemId.value)||'';if(editor.fields.tripId?.value)editor.fields.tripId.value=copy.trip.id;editor.participantIds=editor.participantIds?.map(id=>copy.ids.get(id)||id)??null;editor.draftTravelers=editor.draftTravelers?.map(person=>({...person,id:copy.ids.get(person.id)||person.id}));for(const key of Object.keys(editor.fields)){if(key.startsWith('ratio_')&&copy.ids.has(key.slice(6))){editor.fields['ratio_'+copy.ids.get(key.slice(6))]=editor.fields[key];delete editor.fields[key];}}}}
      state.guestBook={...old,records:copies.map(({trip,items})=>({trip,items})),activeId:copies[index].trip.id,pending:null,importedFor:null,dirty:true,editor};
      if(!writeGuestBook()){state.guestBook=old;throw new Error(state.guestStorageError);}
      loadGuestRecord(state.guestBook.activeId);
    }
    return guestWritable();
  }catch(error){showToast(error.message);return false;}
}
function captureGuestEditor(){
  if(!state.guestBook || state.guestImporting || state.guestRestoring || (!state.guestMode && !state.guestRecovery))return;
  const id=$('#scheduleDialog').open?'schedule':$('#tripDialog').open?'trip':null;if(!id)return;
  const form=$(`#${id}Form`),fields={};
  for(const input of form.elements){if((input.name||input.id) && !['button','submit'].includes(input.type))fields[input.name||input.id]={value:input.value,checked:input.checked};}
  if($('#memoDialog').open && fields.memo)fields.memo.value=$('#memoEditor').value;
  const pending=state.pendingPlace?{...state.pendingPlace}:null;
  // The selected place already uses plain scalar coordinates; no Google objects are persisted.
  state.guestBook.editor={kind:id,tripId:state.trip.id,fields,pendingPlace:pending,participantIds:state.participantIds,draftTravelers:state.draftTravelers};
  if(state.guestMode)state.guestBook.dirty=true;
  writeGuestBook();refreshGuestNotice();
}
function clearGuestEditor(kind){
  if(state.guestBook?.editor?.kind!==kind || state.guestRestoring || state.guestOAuthLeaving)return;
  state.guestBook.editor=null;state.guestRecovery=false;writeGuestBook();refreshGuestNotice();
}
function restoreGuestEditor(){
  const editor=state.guestBook?.editor;if(!editor || state.guestRestoring)return;
  if(editor.tripId!==state.trip.id)return;
  state.guestRestoring=true;
  try{
    if(editor.kind==='schedule'){
      openSchedule(state.items.find(item=>item.id===editor.fields.itemId?.value)||null);
      state.pendingPlace=editor.pendingPlace;state.participantIds=editor.participantIds;renderRatioFields();
    }else{openTripManager();state.draftTravelers=editor.draftTravelers||[];renderDraftTravelers();}
    const form=$(`#${editor.kind}Form`);
    for(const [name,value] of Object.entries(editor.fields)){const input=form.elements.namedItem(name);if(input && 'value' in input){input.value=value.value;if('checked' in input)input.checked=value.checked;}}
    if(editor.kind==='schedule'){
      toggleEndTime(Boolean(editor.fields.toggleEndTime?.checked || editor.fields.endTime?.value));
      setTimeFields('start',editor.fields.startTime?.value||'');setTimeFields('end',editor.fields.endTime?.value||'');
      toggleSettlement(Boolean($('#settlementEnabled').checked));renderAttendeeSummary();
      $('#memoSummary').textContent=$('#savedMemo').value||'＋ 세부 메모 추가';renderCategories();renderEditorMap(state.pendingPlace);
    }
    state.guestRecovery=Boolean(state.session);showToast('입력하던 내용을 복원했습니다. 확인 후 저장해 주세요.');
  }finally{state.guestRestoring=false;refreshGuestNotice();}
}
async function transferGuestWorkspace(){
  guestStore ||= new GuestDrafts.Store(localStorage);
  if(!state.guestBook)state.guestBook=guestStore.read();
  if(!guestHasWork() || !state.guestBook.pending)return false;
  const userId=state.session.user.id;state.guestImporting=true;refreshGuestNotice();
  try{
    state.guestBook=await GuestDrafts.transfer(supabase,guestStore,state.guestBook,userId,()=>state.session?.user.id===userId,book=>{state.guestBook=book;});
    state.guestMode=false;state.guestStorageError='';
    localStorage.setItem(`morrow-active-trip-${userId}`,state.guestBook.activeId);
    return true;
  }catch(error){state.guestStorageError='계정에 저장하지 못했습니다. 임시 계획은 유지됩니다. '+(error.message||'다시 시도해 주세요.');throw error;}
  finally{state.guestImporting=false;refreshGuestNotice();}
}
function guestBeforeUnload(event){
  captureGuestEditor();
  if(!guestHasWork() || state.guestOAuthLeaving || state.guestAllowLeave)return;
  event.preventDefault();event.returnValue='';
}
function bindGuestUI(){
  $('#guestSaveButton').addEventListener('click',signInWithGoogle);
  $('#guestLeaveLogin').addEventListener('click',signInWithGoogle);
  $('#guestStay').addEventListener('click',()=>$('#guestLeaveDialog').close());
  $('#guestLeaveAnyway').addEventListener('click',()=>{state.guestAllowLeave=true;location.assign(state.guestLeaveHref);});
  $('#guestFormRecovery').addEventListener('click',async()=>{try{const id=state.guestBook?.editor?.tripId;if(id && id!==state.trip.id)await switchTrip(id);restoreGuestEditor();}catch(error){showToast(error.message);}});
  document.addEventListener('input',captureGuestEditor);
  document.addEventListener('change',captureGuestEditor);
  document.addEventListener('click',()=>queueMicrotask(captureGuestEditor));
  document.addEventListener('click',event=>{
    const a=event.target.closest('a[href]');if(!a || a.target==='_blank' || a.hasAttribute('download') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button!==0 || !guestHasWork())return;
    const url=new URL(a.href,location.href);if(!['http:','https:'].includes(url.protocol)||a.getAttribute('href').startsWith('#'))return;
    event.preventDefault();captureGuestEditor();state.guestLeaveHref=url.href;$('#guestLeaveDialog').showModal();
  },true);
  window.addEventListener('pagehide',captureGuestEditor);
  document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')captureGuestEditor();});
  window.addEventListener('pageshow',()=>{state.guestOAuthLeaving=false;state.guestAllowLeave=false;});
  window.addEventListener('storage',event=>{if(event.key===GuestDrafts.KEY && state.guestMode){state.guestConflict=true;state.guestStorageError='다른 탭에서 계획이 변경됐습니다. 열린 입력창을 닫고 다시 시도해 주세요.';refreshGuestNotice();}});
  for(const kind of ['schedule','trip'])$(`#${kind}Dialog`).addEventListener('close',()=>clearGuestEditor(kind));
}

function parseLocalDate(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}
function dateRange(start, end) {
  const dates = [];
  const cursor = parseLocalDate(start);
  const last = parseLocalDate(end);
  while (cursor <= last && dates.length < 60) {
    dates.push(`${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`);
    cursor.setDate(cursor.getDate() + 1);
  }
  return dates;
}
function formatDate(value, long = false) {
  return new Intl.DateTimeFormat("ko-KR", long ? { month: "long", day: "numeric", weekday: "long" } : { month: "numeric", day: "numeric", weekday: "short" }).format(parseLocalDate(value));
}
function formatTime(value) {
  return value ? String(value).slice(0, 5) : "미정";
}
function initials(name) {
  return [...String(name || "여행자")][0] || "여";
}
function itemPosition(item) {
  if (item?.latitude == null || item?.longitude == null) return null;
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null;
}
function selectedItem() {
  return state.items.find(item => item.id === state.selectedId) || null;
}
function activeItems(ignoreFilter = false) {
  return state.items.filter(item => item.item_date === state.activeDate && (ignoreFilter || state.travelerFilter === "all" || item.participant_ids == null || item.participant_ids.includes(state.travelerFilter))).sort((a, b) => {
    const byTime = (a.start_time || "99:99").localeCompare(b.start_time || "99:99");
    return byTime || Number(a.sort_order || 0) - Number(b.sort_order || 0);
  });
}
function canEdit() {
  if(state.sampleReturn)return false;
  if(isGuestTrip())return guestWritable();
  if (!state.session || !state.trip.id) return false;
  if (state.trip.owner_id === state.session.user.id) return true;
  return state.members.some(member => member.user_id === state.session.user.id && ["owner", "editor"].includes(member.role));
}
function currentRole(trip = state.trip) {
  if(trip?.id===SAMPLE_TRIP_ID)return "viewer";
  if(isGuestTrip(trip))return guestWritable()?"owner":"viewer";
  if (!state.session || !trip?.id) return "viewer";
  if (trip.owner_id === state.session.user.id) return "owner";
  return state.members.find(member => member.user_id === state.session.user.id)?.role || "viewer";
}
function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}
function setSync(message) {
  state.syncMessage = message;
  if (/^(실시간 저장됨|방금 동기화됨)$/.test(message)) state.lastSavedAt = new Date();
  updateAutoSaveStatus(message);
}
function updateAutoSaveStatus(fallback = "") {
  const label = $("#syncStatus");
  if (state.session && state.lastSavedAt && /^(실시간 저장됨|방금 동기화됨|친구들과 실시간 연결됨|저장 확인 완료)$/.test(state.syncMessage)) {
    const minutes = Math.max(0, Math.floor((Date.now() - state.lastSavedAt.getTime()) / 60000));
    label.textContent = `${minutes}분 전에 저장`;
  } else if (!state.session && new URLSearchParams(location.search).has("trip")) {
    label.textContent = "공개 열람 중 · 로그인 후 수정";
  } else {
    label.textContent = fallback || state.syncMessage || "Google 로그인 후 자동 저장";
  }
}

function renderMember(element, member, title = "") {
  const label = member.display_name || "여행자";
  element.className = "member";
  element.title = title || label;
  element.innerHTML = member.avatar_url ? `<img src="${safe(member.avatar_url)}" alt="${safe(label)}">` : safe(initials(label));
}
function renderMembers() {
  const stack = $("#memberStack");
  stack.innerHTML = "";
  state.members.slice(0, 5).forEach(member => {
    const node = document.createElement("span");
    renderMember(node, member);
    stack.append(node);
  });
  if (state.members.length > 5) {
    const more = document.createElement("span");
    more.className = "member";
    more.textContent = `+${state.members.length - 5}`;
    stack.append(more);
  }
  const permissions = $("#memberPermissions");
  permissions.innerHTML = "";
  state.members.forEach(member => {
    const row = document.createElement("div");
    const avatar = document.createElement("span");
    renderMember(avatar, member);
    const copy = document.createElement("span");
    const owner = member.role === "owner" || member.user_id === state.trip.owner_id;
    copy.innerHTML = `<strong>${safe(member.display_name || "여행자")}</strong><small>${safe(member.email || "")} · ${owner ? "여행 소유자 · 수정 권한 있음" : member.role === "viewer" ? "열람 전용" : "수정 권한 있음"}</small>`;
    row.append(avatar, copy);
    if (state.session?.user.id === state.trip.owner_id && !owner) {
      const select = document.createElement("select");
      select.setAttribute("aria-label", `${member.display_name} 권한`);
      select.innerHTML = `<option value="editor">편집 가능</option><option value="viewer">열람만</option>`;
      select.value = member.role;
      select.addEventListener("change", () => updateMemberRole(member.user_id, select.value));
      row.append(select);
    } else {
      const role = document.createElement("span");
      role.textContent = owner ? "모든 권한" : member.role === "viewer" ? "열람만" : "편집 가능";
      row.append(role);
    }
    permissions.append(row);
  });
  renderTripAccounts();
}

function renderTripAccounts(){
  const target=$('#tripAccounts');
  const formId=$('#tripForm').elements.tripId.value;
  target.replaceChildren();
  if(!formId || formId!==state.trip.id || isGuestTrip() || state.trip.id===SAMPLE_TRIP_ID){
    target.textContent='이 여행에 초대된 사람이 로그인하면 계정과 수정 권한이 표시됩니다.';
    return;
  }
  if(state.memberAccountsError){target.textContent=state.memberAccountsError;return;}
  for(const member of state.members){
    const owner=member.user_id===state.trip.owner_id || member.role==='owner';
    const row=document.createElement('div');row.className='trip-account-row';
    row.innerHTML=`<span><strong>${safe(member.display_name || '여행자')}</strong><small>${safe(member.email || '계정 이메일 확인 중')}</small></span><em>${owner?'소유자 · 수정 권한 있음':member.role==='editor'?'수정 권한 있음':'열람 전용'}</em>`;
    target.append(row);
  }
}
async function manualSave(){
  const button=$('#manualSaveButton');
  if(!canEdit() || button.disabled)return;
  button.disabled=true;button.textContent='저장 중…';
  try{
    if(isGuestTrip()){
      captureGuestEditor();commitGuest();
      if(state.guestStorageError)throw new Error(state.guestStorageError);
      showToast('현재 계획을 이 브라우저에 저장했습니다.');
    }else{
      // Edits are written immediately. Confirm the latest persisted timestamps,
      // without overwriting a collaborator's changes with a stale snapshot.
      const tripId=state.trip.id;
      const [trip,items]=await Promise.all([
        supabase.from('mt_trips').select('updated_at').eq('id',tripId).single(),
        supabase.from('mt_itinerary_items').select('updated_at').eq('trip_id',tripId)
      ]);
      if(trip.error || items.error)throw trip.error || items.error;
      if(state.trip.id!==tripId)return;
      const stamps=[trip.data?.updated_at,...(Array.isArray(items.data)?items.data:[]).map(item=>item.updated_at)].map(value=>Date.parse(value)).filter(Number.isFinite);
      if(stamps.length)state.lastSavedAt=new Date(Math.max(...stamps));
      setSync('저장 확인 완료');showToast('현재 여행의 저장을 확인했습니다.');
    }
  }catch(error){setSync('저장 확인 실패 · 다시 시도해 주세요');showToast(error.message || '저장하지 못했습니다.');}
  finally{button.disabled=false;button.textContent='저장';}
}

const SAMPLE_TRIP_ID = 'sample-seoul-day';
function leaveSampleTrip() {
  if (!state.sampleReturn) return;
  Object.assign(state, state.sampleReturn);
  state.sampleReturn = null;
  render(); refreshGuestNotice();
}
function showSampleTrip() {
  if (state.sampleReturn) return;
  captureGuestEditor();
  const fields=['trip','items','members','guestMode','activeDate','selectedId','travelerFilter','followClock','clockTrip','syncMessage'];
  state.sampleReturn=Object.fromEntries(fields.map(key=>[key,state[key]]));
  const date=todayString();
  state.guestMode=false;
  state.trip={...blankTrip(),id:SAMPLE_TRIP_ID,title:'서울 하루 산책 · 샘플',destination:'SEOUL',start_date:date,end_date:date,
    travelers:[{id:'sample-traveler',nickname:'여행자',avatar:'female-001'}]};
  const stops=[
    ['10:00','11:30','경복궁 산책','관광',37.5796,126.9770,0,'하루 여행 계획을 살펴보세요.'],
    ['12:00','13:00','인사동 점심','음식',37.5744,126.9850,15000,'식사 일정과 예산을 함께 기록할 수 있어요.'],
    ['14:00','15:00','청계천 걷기','관광',37.5692,126.9786,0,'지도에서 순서대로 이동 경로를 확인해 보세요.'],
    ['16:00','17:00','명동 카페에서 쉬기','음식',37.5636,126.9845,7000,'예시 장소·시간·금액이며 예약 정보는 아닙니다.']
  ];
  state.items=stops.map(([start_time,end_time,name,category,latitude,longitude,cost_won,memo],i)=>({id:`sample-stop-${i}`,trip_id:SAMPLE_TRIP_ID,item_date:date,start_time,end_time,name,category,latitude,longitude,cost_won,memo,settlement_enabled:cost_won>0,sort_order:i,participant_ids:null}));
  state.members=[];state.activeDate=date;state.selectedId=null;state.travelerFilter='all';
  setSync('샘플 여행 · 둘러보기');render();refreshGuestNotice();
}

function renderTripSwitcher() {
  const select = $("#tripSelect");
  const guest = state.sampleReturn ? state.sampleReturn.guestMode : state.guestMode;
  const original = state.sampleReturn?.trip || state.trip;
  const trips = state.trips.length ? state.trips : (original.id ? [original] : []);
  select.innerHTML = (trips.length ? trips.map(trip=>`<option value="${safe(trip.id)}">${safe(trip.title)}${guest?' · 임시':''}</option>`).join('') : '<option value="">내 여행 계획</option>') + `<option value="${SAMPLE_TRIP_ID}">서울 하루 산책 · 샘플 여행</option>`;
  select.value=state.sampleReturn ? SAMPLE_TRIP_ID : (state.trip.id || '');
  select.disabled=false;
  $("#manageTripsButton").textContent = state.session || state.guestMode ? "여행 관리" : "내 계획 시작하기";
}

function agendaFaces(item){
  const people=attendeesFor(item,travelers()),names=people.map(p=>p.nickname).join(' · ');
  return `<span class="agenda-faces" title="${safe(names)}" aria-label="동행: ${safe(names)}">${people.slice(0,3).map(p=>faceHtml(p,'')).join('')}${people.length>3?`<small>+${people.length-3}</small>`:''}</span>`;
}
function render() {
  syncTripClock();
  const dates = dateRange(state.trip.start_date, state.trip.end_date);
  if (!dates.includes(state.activeDate)) state.activeDate = dates[0];
  const items = activeItems();
  $("#agendaList").classList.toggle("is-empty",items.length===0);
  if (state.selectedId && !items.some(item => item.id === state.selectedId)) state.selectedId = null;
  if(state.mobileExpandedId!==state.selectedId)state.mobileExpandedId=null;
  const selected = selectedItem();

  document.title = state.trip.id ? `${state.trip.title} — 여행계획닷컴 beta` : "여행계획닷컴 beta";
  $("#dayTabs").innerHTML = dates.map((date, index) => {
    const value = parseLocalDate(date);
    return `<button class="day-tab ${date === state.activeDate ? "active" : ""}" type="button" role="tab" aria-selected="${date === state.activeDate}" data-date="${date}"><span>DAY ${String(index + 1).padStart(2, "0")}</span><strong>${value.getMonth() + 1}월 ${String(value.getDate()).padStart(2, "0")}일 ${new Intl.DateTimeFormat("ko-KR", { weekday: "short" }).format(value).replace("요일", "")}</strong></button>`;
  }).join("");
  $("#dayTabs").scrollTop=0;
  if(state.renderedTabsTrip!==state.trip.id){$("#dayTabs").scrollLeft=0;state.renderedTabsTrip=state.trip.id;}
  $$("[data-date]").forEach(button => button.addEventListener("click", () => {
    selectDay(button.dataset.date);
  }));

  $("#itemCount").textContent = `${items.length}개의 일정`;
  $("#totalCost").textContent = won(state.items.reduce((sum, item) => sum + (item.settlement_enabled ? Number(item.cost_won || 0) : 0), 0));
  $("#agendaList").innerHTML = items.length ? items.map((item, index) => {
    const current = isCurrentItem(item, items);
    return `<div class="agenda-item ${item.id === state.selectedId ? "is-selected" : ""} ${current ? "is-current" : ""}"><button class="agenda-select" type="button" data-item-id="${safe(item.id)}"><span class="agenda-number" aria-label="지도 ${index+1}번">${index+1}</span><span class="agenda-time">${safe(formatTime(item.start_time))}</span><span class="agenda-copy"><strong><span>${safe(item.name)}</span><small>${safe(item.category || "미분류")}</small></strong><p>${safe(item.memo || "")}</p></span>${agendaFaces(item)}</button><button class="agenda-expand" type="button" data-expand-item="${safe(item.id)}" aria-label="${safe(item.name)} 세부 내용 ${state.mobileExpandedId===item.id?'접기':'펼치기'}" aria-expanded="${state.mobileExpandedId===item.id}">${state.mobileExpandedId===item.id?'접기':'자세히'}</button><button class="agenda-edit-button" type="button" data-edit-item="${safe(item.id)}" aria-label="${safe(item.name)} 수정">✎</button>${item.id===state.selectedId && item.id===state.mobileExpandedId?`<div class="mobile-agenda-details"><strong>${safe(item.name)}</strong><span>${safe(item.item_date)} · ${safe(formatTime(item.start_time))}${item.end_time?' — '+safe(formatTime(item.end_time)):''}</span>${item.category?`<span>${safe(item.category)}</span>`:''}${item.memo?`<p>${safe(item.memo)}</p>`:''}${item.settlement_enabled?`<span>${won(item.cost_won || 0)}</span>`:''}</div>`:''}</div>`;
  }).join("") : `<div class="agenda-empty captain-empty"><img src="./assets/captain/guide-map.webp" width="98" height="120" alt="지도를 함께 보는 캡틴비어"><strong>아직 비어 있는 여행 지도</strong><p>가고 싶은 곳 하나로 시작해요.<br>제가 옆에서 함께할게요.</p></div>`;
  $$("[data-item-id]").forEach(button => {
    button.addEventListener("click", () => selectStop(button.dataset.itemId, true));
  });
  $$("[data-edit-item]").forEach(button => button.addEventListener("click", () => {
    const item = state.items.find(value => value.id === button.dataset.editItem);
    openSchedule(item);
  }));
  $$('[data-expand-item]').forEach(button=>button.addEventListener('click',()=>{
    const id=button.dataset.expandItem,wasOpen=state.mobileExpandedId===id;
    state.selectedId=id;state.mobileExpandedId=wasOpen?null:id;render();
  }));
  renderTripClock(items);
  updatePlaceCard(state.mapSearchItem || selected);
  renderMap();
  renderMembers();
  $("#manualSaveButton").hidden=!canEdit();
  renderTripSwitcher();
  updateAccountUI();
  persistView();
  const tabs=$("#dayTabs");tabs.scrollLeft=Math.min(tabs.scrollLeft,Math.max(0,tabs.scrollWidth-tabs.clientWidth));
}

function syncTripClock(now=new Date()) {
  state.followClock=true;
  const clock=clockParts(now),key=state.trip.id+'|'+clock.date+' '+clock.time;
  // Manual inspection stays usable; the next clock tick resumes live following.
  if(state.clockTrip===state.trip.id && state.clockSelectionKey===key)return;
  state.clockTrip=state.trip.id;state.clockSelectionKey=key;
  if(tripPhase(state.trip,now).mode==='live'){state.activeDate=clock.date;state.selectedId=currentSchedule(activeItems(),now)?.item.id||null;}
}
function isCurrentItem(item,items){return currentSchedule(items)?.item.id===item.id;}
function renderTripClock(items,now=new Date()) {
  const phase=tripPhase(state.trip,now),clock=clockParts(now),current=currentSchedule(items,now),live=phase.mode==='live';
  document.body.classList.toggle('trip-on-air',live);
  $('#captainCountdown').textContent=phase.mode==='upcoming'?`D-${phase.remaining}`:live?'ON AIR':phase.mode==='ended'?'여행 완료':'';
  $('#captainMessage').textContent=phase.mode==='upcoming'?`출발까지 ${phase.remaining}일 남았어요!`:live?`여행 ${phase.day}일차, 지금 함께하고 있어요!`:phase.mode==='ended'?'함께한 여행, 즐거우셨나요?':'이번 여행도 함께 짜볼까요?';
  $('#captainCountdown').hidden=phase.mode==='empty';
  const list=$('#agendaList');list.classList.toggle('is-timeline',items.length>0);
  $$('.agenda-item',list).forEach((el,index)=>{el.classList.toggle('is-past',items[index].item_date<clock.date||(items[index].item_date===clock.date&&items[index].start_time&&items[index].start_time.slice(0,5)<clock.time&&items[index].id!==current?.item.id));if(items[index].id===current?.item.id){const bar=document.createElement('span');bar.className='schedule-progress';bar.style.width=`${current.progress*100}%`;bar.setAttribute('aria-hidden','true');el.append(bar);}});
  if(live&&state.activeDate===clock.date){const line=document.createElement('div');line.className='schedule-now';line.textContent=`${clock.time} NOW · ${current?'지금 이 일정':'다음 일정을 기다리는 중'}`;const target=current?[...list.querySelectorAll("[data-item-id]")].find(el=>el.dataset.itemId===current.item.id)?.closest('.agenda-item'):[...list.querySelectorAll('.agenda-item')].find((el,index)=>items[index].start_time?.slice(0,5)>clock.time);list.insertBefore(line,target||null);}
}
function tickTripClock(){const key=clockParts().date+' '+clockParts().time;if(key===state.clockMinute||document.hidden)return;state.clockMinute=key;state.clockSelectionKey=null;const before=state.selectedId;render();if(state.followClock&&state.selectedId!==before&&selectedItem())panMapToItem(selectedItem(),false);}
window.addEventListener('pagehide',persistView);
document.addEventListener('visibilitychange',()=>{if(document.hidden)persistView();});
function updatePlaceCard(item) {
  const items = activeItems();
  const index = item ? items.findIndex(value => value.id === item.id) : -1;
  $("#routeCounter").textContent = `${index >= 0 ? index + 1 : 0} / ${items.length}`;
  $("#previousStop").disabled = state.dayTransitionBusy || (index <= 0 && state.activeDate <= state.trip.start_date);
  $("#nextStop").disabled = state.dayTransitionBusy || ((!items.length || index >= items.length - 1) && state.activeDate >= state.trip.end_date);
  const searchPreview=Boolean(item && state.mapSearchItem?.id===item.id);
  $('#mapSearchPlaceActions').hidden=!searchPreview;
  $('#placeCard').classList.toggle('is-search-preview',searchPreview);
  $(searchPreview?'#mapSearchPlaceActions':'#placeCardDetails').append($('#placeMore'));
  $("#placeCard").hidden = !item;
  state.previewItemId = item?.id || null;
  $('#placeMore').hidden=!item?.maps_url;
  if (!item) { state.placePreviewRequest++; return; }
  $("#placeCategory").textContent = searchPreview ? "검색한 장소" : `${item.category || "미분류"} · ${formatTime(item.start_time)}`;
  $("#placeName").textContent = item.name;
  $("#placeMemo").textContent = item.memo || "";
  $("#placeMemo").hidden = !item.memo;
  $("#placeRating").textContent = item.maps_url ? "Google 지도" : "장소 미등록";
  syncPlaceCardExpansion();
  if (item.maps_url && !state.placeCardCollapsed) renderPlacePreview(item);
  else if (!item.maps_url) {state.placePreviewRequest++; $("#placePreview").innerHTML = '<div class="place-preview-empty">선택된 Google 장소의 사진과 리뷰가 여기에 표시됩니다.</div>'; $("#placeReviewSnippet").textContent = '';}
}
async function renderPlacePreview(item) {
  const requestId = ++state.placePreviewRequest;
  const preview = $("#placePreview");
  preview.innerHTML = Array.from({length:3},()=>'<span class="photo-skeleton" aria-hidden="true"></span>').join('');
  $("#placeReviewSnippet").textContent = "Google 리뷰를 불러오는 중";
  try {
    const place = await getPlaceDetails(item);
    if (requestId !== state.placePreviewRequest || state.previewItemId !== item.id) return;
    preview.innerHTML = '';
    (place.photos || []).slice(0,3).forEach((photo,index)=>{
      const source = photo.getURI({maxWidth:600,maxHeight:600});
      const credit = (photo.authorAttributions || []).map(author=>author.displayName).filter(Boolean).join(', ');
      const button = document.createElement('button'); button.type='button'; button.className='place-thumb';
      button.innerHTML=`<img src="${safe(source)}" alt="${safe(place.displayName || item.name)} 사진 ${index+1}">`;
      button.addEventListener('click',()=>openLargePhoto(source,place.displayName || item.name,credit)); preview.append(button);
    });
    if (!preview.children.length) preview.innerHTML='<div class="place-preview-empty">제공되는 사진이 없습니다.</div>';
    $("#placeRating").textContent=place.rating ? `★ ${place.rating.toFixed(1)} · ${Number(place.userRatingCount || 0).toLocaleString('ko-KR')}` : 'Google 지도';
    const reviews=[...(place.reviews || [])].filter(review=>review.text).sort((a,b)=>new Date(b.publishTime || 0)-new Date(a.publishTime || 0));
    $("#placeReviewSnippet").innerHTML=reviews.length ? '<div class="review-source">Google 제공 리뷰 · 제공된 리뷰 중 최신순</div>'+reviews.map(review=>{
      const author=review.authorAttribution || {};
      const authorName=safe(author.displayName || 'Google 사용자');
      const authorLink=/^https:\/\//.test(author.uri || '') ? `<a href="${safe(author.uri)}" target="_blank" rel="noreferrer">${authorName}</a>` : authorName;
      return `<article class="review-entry"><header><span>${authorLink}</span><span>★ ${safe(review.rating || '')} · ${safe(review.relativePublishTimeDescription || '')}</span></header><p>${safe(review.text)}</p></article>`;
    }).join('') : '제공되는 Google 리뷰가 없습니다.';
    const reviewsUrl=place.googleMapsURI || item.maps_url;
    if(isGoogleMapsUrl(reviewsUrl)) $('#placeReviewSnippet').insertAdjacentHTML('beforeend',`<a class="all-reviews-link" href="${safe(reviewsUrl)}" target="_blank" rel="noopener noreferrer">Google 지도에서 전체 리뷰 보기 ↗</a><small class="review-limit">Google이 제공한 리뷰 최대 5개를 표시합니다.</small>`);
  } catch(error) {
    if (requestId !== state.placePreviewRequest) return;
    preview.innerHTML='<div class="place-preview-empty">사진을 불러오지 못했습니다.</div>';
    $("#placeReviewSnippet").textContent='리뷰를 불러오지 못했습니다. 잠시 후 다시 선택해 주세요.';
  }
}

let googleMapsLoad;
async function loadGoogleMaps() {
  if (window.google?.maps?.importLibrary) return;
  if (!googleMapsLoad) googleMapsLoad = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const timeout = setTimeout(() => { googleMapsLoad = null; script.remove(); reject(new Error("지도 연결이 지연되고 있습니다. 다시 시도해 주세요.")); }, 20000);
    window.__morrowMapsReady = () => { clearTimeout(timeout); resolve(); };
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_KEY}&v=weekly&loading=async&libraries=places,marker&language=ko&region=KR&callback=__morrowMapsReady`;
    script.async = true;
    script.onerror = () => { clearTimeout(timeout); googleMapsLoad = null; script.remove(); reject(new Error("Google 지도를 불러오지 못했습니다.")); };
    document.head.append(script);
  });
  return googleMapsLoad;
}
// A separate Google StyledMapType keeps the base map palette independent of
// the AdvancedMarker map ID. Do not pass MapOptions.styles with a map ID.
const PASTEL_STYLE = [
  {elementType:'geometry',stylers:[{color:'#f7f2e8'}]},
  {elementType:'labels.text.fill',stylers:[{color:'#626970'}]},
  {elementType:'labels.text.stroke',stylers:[{color:'#fffdf8'}]},
  {featureType:'landscape.man_made',elementType:'geometry',stylers:[{color:'#f0e9de'}]},
  {featureType:'landscape.natural',elementType:'geometry',stylers:[{color:'#faf6ef'}]},
  {featureType:'administrative.land_parcel',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi',elementType:'labels',stylers:[{visibility:'off'}]},
  {featureType:'poi.park',elementType:'geometry',stylers:[{color:'#dce8d6'}]},
  {featureType:'poi.park',elementType:'labels.text',stylers:[{visibility:'on'}]},
  {featureType:'poi.park',elementType:'labels.text.fill',stylers:[{color:'#78877e'}]},
  {featureType:'poi.park',elementType:'labels.text.stroke',stylers:[{color:'#fffdf8'},{weight:2}]},
  {featureType:'poi.attraction',elementType:'labels.text',stylers:[{visibility:'on'}]},
  {featureType:'road',elementType:'geometry.fill',stylers:[{color:'#fffdf8'}]},
  {featureType:'road',elementType:'geometry.stroke',stylers:[{color:'#e7ded0'}]},
  {featureType:'road.highway',elementType:'geometry.fill',stylers:[{color:'#f6e4b7'}]},
  {featureType:'road',elementType:'labels.icon',stylers:[{visibility:'off'}]},
  {featureType:'transit.line',elementType:'geometry',stylers:[{color:'#d7dcdf'}]},
  {featureType:'transit.station',elementType:'labels',stylers:[{visibility:'on'}]},
  {featureType:'water',elementType:'geometry',stylers:[{color:'#cfe4e9'}]},
  {featureType:'water',elementType:'labels.text.fill',stylers:[{color:'#859da9'}]}
];
function applyPastelMap(map){
  map.mapTypes.set('cream_pastel',new google.maps.StyledMapType(PASTEL_STYLE,{name:'크림 파스텔'}));
  map.setMapTypeId('cream_pastel');
}
async function initMap() {
  try {
    await loadGoogleMaps();
    const { Map } = await google.maps.importLibrary("maps");
    state.map = new Map($("#googleMap"), {
      center: { lat: 37.5665, lng: 126.9780 }, zoom: 13, mapId: "DEMO_MAP_ID", renderingType: "RASTER",
      mapTypeControl: false, streetViewControl: false, fullscreenControl: false,
      gestureHandling: "greedy", clickableIcons: true
    });
    applyPastelMap(state.map);
    state.map.addListener("click", event => handleMainMapClick(event));
    state.mapReady = true;
    renderMap();
  } catch (error) {
    $("#googleMap").innerHTML = `<div class="agenda-empty">Google 지도를 불러오지 못했습니다.<br>${safe(error.message)}</div>`;
  }
}
function markerContent(item, selected = false) {
  if (window.CaptainMap) return CaptainMap.markerContent(item, selected, activeItems().findIndex(value=>value.id===item.id)+1);
  const node = document.createElement("div");
  node.className = `route-marker ${selected ? "selected" : ""}`;
  node.innerHTML = `<span>${activeItems().findIndex(value => value.id === item.id) + 1}</span>`;
  return node;
}
async function renderMap() {
  if (!state.mapReady) return;
  const requestId=++state.mapRenderRequest;
  const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
  if(requestId!==state.mapRenderRequest)return;
  state.markers.forEach(marker=>{marker.map=null;});state.markers.clear();
  state.routes.forEach(route=>route.setMap(null));state.routes=[];
  const items=activeItems().filter(itemPosition), allItems=activeItems(true), allPeople=travelers();
  window.RouteJourney?.update(state.map,items,state.trip.id+":"+state.activeDate,state.selectedId,{firstDay:state.activeDate===state.trip.start_date,onModeChange:canEdit()?saveTransportMode:null,onError:showToast}).catch(()=>{});
  items.forEach(item=>{const marker=new AdvancedMarkerElement({map:state.map,position:itemPosition(item),title:item.name,content:markerContent(item,item.id===state.selectedId),zIndex:item.id===state.selectedId?220:50,gmpClickable:true});marker.addEventListener('gmp-click',()=>selectStop(item.id,true));state.markers.set(item.id,marker);});
  const colors=['#292929','#707070','#a24a43','#596c70','#867c69','#8b6666'];
  const people=allPeople.filter(person=>state.travelerFilter==='all'||state.travelerFilter===person.id);
  const routeGroups=new Map();
  people.forEach(person=>{const path=personStops(items,person.id),signature=path.map(item=>item.id).join('|');if(!signature)return;if(!routeGroups.has(signature))routeGroups.set(signature,{path,people:[],color:colors[routeGroups.size%colors.length]});routeGroups.get(signature).people.push(person);});

  $("#routeLegend").innerHTML=[...routeGroups.values()].map(group=>`<span style="--route-color:${group.color}"><i></i>${group.people.map(p=>safe(p.nickname)).join(' · ')}</span>`).join('');
  const selected=selectedItem(), cutoff=selected?.start_time, selectedIndex=allItems.findIndex(item=>item.id===state.selectedId);
  const currentItems=selected ? allItems.filter((item,index)=>cutoff && item.start_time ? item.start_time<=cutoff : index<=selectedIndex) : [];
  const targets=[];
  routeGroups.forEach(group=>group.people.forEach(person=>{const stops=personStops(currentItems,person.id).filter(itemPosition);const item=stops.at(-1)||group.path[0];if(item)targets.push({person,position:itemPosition(item),color:group.color});}));
  const sameDate=state.routeDate===state.activeDate;state.routeDate=state.activeDate;
  const destinationCounts=new Map();targets.forEach(target=>{const key=JSON.stringify(target.position);target.offset=destinationCounts.get(key)||0;destinationCounts.set(key,target.offset+1);});
  const oldIds=new Set(state.travelerMarkers.keys());
  const moves=targets.map(target=>{oldIds.delete(target.person.id);let marker=state.travelerMarkers.get(target.person.id);const content=document.createElement('div');content.className='traveler-map-marker';content.style.setProperty('--route-color',target.color);content.style.marginLeft=`${target.offset*22}px`;content.innerHTML=faceHtml(target.person);const old=marker?.position;const from=old && sameDate ? {lat:typeof old.lat==='function'?old.lat():old.lat,lng:typeof old.lng==='function'?old.lng():old.lng}:target.position;
    if(!marker){marker=new AdvancedMarkerElement({map:state.map,position:from,content,title:target.person.nickname,zIndex:100+target.offset});state.travelerMarkers.set(target.person.id,marker);}else{marker.content=content;marker.title=target.person.nickname;marker.map=state.map;}
    return {marker,from,to:target.position};
  });
  oldIds.forEach(id=>{state.travelerMarkers.get(id).map=null;state.travelerMarkers.delete(id);});
  cancelAnimationFrame(state.routeAnimation);
  const duration=sameDate && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 850:0,start=performance.now();
  const animate=now=>{const fraction=duration?Math.min(1,(now-start)/duration):1,eased=fraction*fraction*(3-2*fraction);moves.forEach(({marker,from,to})=>{marker.position={lat:from.lat+(to.lat-from.lat)*eased,lng:from.lng+(to.lng-from.lng)*eased};});if(fraction<1)state.routeAnimation=requestAnimationFrame(animate);};state.routeAnimation=requestAnimationFrame(animate);
  const viewKey=state.trip.id+':'+state.activeDate;
  if(state.fitDayRequested===viewKey){fitActiveBounds(items);state.fitDayRequested=null;}
  else if(state.mapViewKey!==viewKey){if(selected&&itemPosition(selected))panMapToItem(selected,false);else fitActiveBounds(items);}
  state.mapViewKey=viewKey;
}
function fitActiveBounds(items = activeItems().filter(itemPosition)) {
  if (!state.mapReady || !items.length) return;
  if (items.length === 1) {
    state.map.setCenter(itemPosition(items[0]));
    state.map.setZoom(14);
    return;
  }
  const bounds = new google.maps.LatLngBounds();
  items.forEach(item => bounds.extend(itemPosition(item)));
  state.map.fitBounds(bounds, 80);
}
async function panMapToItem(item, animate = true) {
  if (!state.mapReady) return;
  const position = itemPosition(item);
  if (!position) return;
  state.map.panTo(position);
}
function selectStop(id, animate = false) {
  clearMapSearchPlace();
  if(state.selectedId!==id)state.mobileExpandedId=null;
  state.selectedId = id;
  render();
  const row=$$('[data-item-id]').find(node=>node.dataset.itemId===id)?.closest('.agenda-item');
  const list=$('#agendaList');
  if(row){const a=row.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top)list.scrollTop+=a.top-b.top;else if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom;}
  const item = selectedItem();
  if (item) panMapToItem(item, animate);
}

function setTimeFields(prefix, value = "") {
  const time = value ? String(value).slice(0, 5) : "";
  $(`#${prefix}Time`).value = time;
  $(`#${prefix}TimeButton span`).textContent = time || (prefix === "start" ? "시간 미정" : "시간 선택");
}
function readTimeFields(prefix) { return $(`#${prefix}Time`).value; }
function toggleEndTime(show) {
  $("#endTimeFields").hidden = !show;
  $("#toggleEndTime").checked = show;
  $("#endTime").disabled = !show;
  if (!show) setTimeFields("end", "");
}
function toggleSettlement(show) {
  $("#settlementEnabled").checked = show; $("#costFields").hidden = !show; $("#settlementUnset").hidden = show;
  $("#scheduleForm").elements.cost.disabled = !show; $("#splitType").disabled = !show;
  $("#ratioFields").hidden = !show || $("#splitType").value !== 'custom';
  $$("input",$("#ratioFields")).forEach(input=>input.disabled=!show || $("#splitType").value !== 'custom');
}
function renderCategories() {
  const categories=state.trip.categories || ['음식','관광','이동','쇼핑'];
  const previous=$("#categorySelect").value;
  if (!categories.includes(previous)) $("#categorySelect").value='';
  $("#categoryValue").textContent=$("#categorySelect").value || '선택 안 함';
  $("#categoryOptions").innerHTML=['',...categories].map(category=>`<button type="button" data-category="${safe(category)}">${safe(category || '선택 안 함')}</button>`).join('');
  $$('[data-category]').forEach(button=>button.addEventListener('click',()=>{ $("#categorySelect").value=button.dataset.category;$("#categoryValue").textContent=button.dataset.category || '선택 안 함';closeCategoryMenu();}));
  $("#categoryChips").innerHTML=categories.map(category=>`<button class="category-chip" type="button" data-delete-category="${safe(category)}" aria-label="${safe(category)} 삭제">${safe(category)} <span>×</span></button>`).join('');
  $$('[data-delete-category]').forEach(button=>button.addEventListener('click',()=>removeCategory(button.dataset.deleteCategory)));
}
function closeCategoryMenu(){ $("#categoryMenu").hidden=true;$("#categoryDropdown").setAttribute('aria-expanded','false'); }
function renderRatioFields(ratios = {}) {
  const people=attendeesFor({participant_ids:state.participantIds},travelers());
  const base=Math.floor(1000/Math.max(1,people.length))/10;
  $("#ratioFields").innerHTML=people.map((person,index)=>`<label>${safe(person.nickname)} %<input name="ratio_${safe(person.id)}" type="number" min="0" max="100" step="0.1" value="${ratios[person.id] ?? (index===people.length-1 ? Math.round((100-base*(people.length-1))*10)/10 : base)}"></label>`).join('');
}
function resetScheduleForm(item = null) {
  const form = $("#scheduleForm");
  form.reset();
  state.placeResolveRequest++; state.editorMapRequest++; clearTimeout(placeSearchTimer);
  state.pendingPlace = null; state.participantIds = item?.participant_ids ?? null;
  clearEditorMarkers(); closeCategoryMenu();
  form.elements.itemId.value = item?.id || "";
  form.elements.date.removeAttribute("min");
  form.elements.date.removeAttribute("max");
  form.elements.date.value = item?.item_date || state.activeDate;
  setTimeFields("start", item?.start_time || "");
  setTimeFields("end", item?.end_time || "");
  toggleEndTime(Boolean(item?.end_time));
  form.elements.mapsUrl.value = item?.maps_url || "";
  $("#placeSearchInput").value = item?.maps_url ? item.name : "";
  $("#placeSearchInput").setAttribute("aria-expanded", "false");
  $("#placeSearchResults").hidden = true;
  $("#placeSearchResults").innerHTML = "";
  $("#clearPlaceButton").hidden = !item?.maps_url;
  if (item?.maps_url) {
    state.pendingPlace = {
      sourceQuery: item.name, placeId: item.place_id, name: item.name,
      address: "", mapsUrl: item.maps_url || "",
      latitude: item.latitude == null ? null : Number(item.latitude), longitude: item.longitude == null ? null : Number(item.longitude)
    };
  }
  form.elements.name.value = item?.name || "";
  form.elements.name.dataset.autoFilled = item ? "false" : "true";
  form.elements.memo.value = item?.memo || "";
  form.elements.cost.value = item?.cost_won || "";
  const custom = item && Object.keys(item.split_ratios || {}).length > 0;
  form.elements.splitType.value = custom ? "custom" : "equal";
  $("#ratioFields").hidden = !custom;
  renderRatioFields(item?.split_ratios || {});
  toggleSettlement(Boolean(item?.settlement_enabled));
  renderAttendeeSummary(); $("#memoSummary").textContent=item?.memo || "＋ 세부 메모 추가";
  renderCategories();
  form.elements.category.value = item?.category || ""; $("#categoryValue").textContent=item?.category || "선택 안 함";
  $("#mapsLinkStatus").className = "field-hint";
  $("#mapsLinkStatus").textContent = item?.place_id ? "선택된 Google 장소입니다." : "장소 없이도 일정을 저장할 수 있습니다.";
  $("#formError").textContent = "";
  $("#scheduleModeLabel").textContent = item ? "EDIT MOMENT" : "NEW MOMENT";
  $("#scheduleDialogTitle").textContent = item ? "일정 다듬기" : "새 일정 추가";
  $("#editorContext").textContent = `${state.trip.title} · ${formatDate(item?.item_date || state.activeDate)}`;
  $("#saveScheduleButton").textContent = item ? "변경 저장" : "일정 추가";
  $("#deleteScheduleButton").hidden = !item;
}
function openSchedule(item = null) {
  if(state.sampleReturn)return showToast("샘플은 둘러보기용입니다. 여행 목록에서 내 계획을 선택해 주세요.");
  // Ordinary visitors can start directly from Add schedule, even while Auth is loading.
  if(!state.session && !isGuestTrip() && !hasSharedTripLink() && !state.trip.owner_id){
    if(!initializeGuest())return;
  }
  if (!state.session && !isGuestTrip()) {
    $("#accountDialog").showModal();
    showToast("공유받은 여행은 로그인 후 수정할 수 있습니다.");
    return;
  }
  if (!state.trip.id) {
    openTripManager(true);
    showToast("먼저 여행을 만들어 주세요.");
    return;
  }
  if(isGuestTrip() && !guestWritable()){const index=item?state.items.findIndex(row=>row.id===item.id):-1;if(!recoverGuestEditing())return;if(index>=0)item=state.items[index]||null;}
  if (!canEdit()) {
    showToast("이 여행은 열람만 가능합니다.");
    return;
  }
  resetScheduleForm(item);
  $("#scheduleDialog").showModal();
  $("#scheduleDialog").scrollTop=0;
  renderEditorMap(state.pendingPlace);
}

async function findGooglePlaces(query, bias = null) {
  await loadGoogleMaps();
  const { Place } = await google.maps.importLibrary("places");
  const request = {
    textQuery: query,
    fields: ["id", "displayName", "formattedAddress", "location", "googleMapsURI"],
    language: "ko", maxResultCount: 5
  };
  const center = state.map?.getCenter?.();
  if (bias || center) request.locationBias = bias || center;
  const { places } = await Place.searchByText(request);
  return places || [];
}
function clearPlaceSelection(clearQuery = true) {
  state.placeResolveRequest++; state.editorMapRequest++; clearTimeout(placeSearchTimer);
  clearEditorMarkers();
  state.pendingPlace = null;
  $("#mapsUrlInput").value = "";
  if (clearQuery) $("#placeSearchInput").value = "";
  $("#placeSearchResults").hidden = true;
  $("#placeSearchResults").innerHTML = "";
  $("#placeSearchInput").setAttribute("aria-expanded", "false");
  $("#clearPlaceButton").hidden = true;
  $("#mapsLinkStatus").className = "field-hint";
  $("#mapsLinkStatus").textContent = "장소 없이도 일정을 저장할 수 있습니다.";
  renderEditorMap(null);
}
function selectGooglePlace(place) {
  if (!place?.location) return;
  state.placeResolveRequest++; clearTimeout(placeSearchTimer);
  const placeName=/^(지도에서 선택한 위치|선택한 위치)$/.test(place.displayName || '')?'':String(place.displayName || '').trim();
  const nameInput = $("#scheduleForm").elements.name;
  state.pendingPlace = {
    sourceQuery: $("#placeSearchInput").value, placeId: place.id || null, name: placeName,
    address: place.formattedAddress, mapsUrl: place.googleMapsURI || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeName)}&query_place_id=${encodeURIComponent(place.id)}`,
    latitude: place.location.lat(), longitude: place.location.lng()
  };
  $("#placeSearchInput").value = placeName;
  $("#mapsUrlInput").value = state.pendingPlace.mapsUrl;
  $("#placeSearchResults").hidden = true;
  $("#placeSearchInput").setAttribute("aria-expanded", "false");
  $("#clearPlaceButton").hidden = false;
  if (!nameInput.value || nameInput.dataset.autoFilled === "true") {
    nameInput.value = placeName;
    nameInput.dataset.autoFilled = "true";
  }
  const status = $("#mapsLinkStatus");
  status.textContent = `${placeName || "선택한 위치"}${place.formattedAddress ? ` · ${place.formattedAddress}` : ""}`;
  status.className = "field-hint is-success";
  renderEditorMap(state.pendingPlace);
}
async function searchGooglePlaces(rawQuery) {
  const query = String(rawQuery || "").trim();
  const status = $("#mapsLinkStatus");
  const results = $("#placeSearchResults");
  const requestId = ++state.placeResolveRequest;
  if (query.length < 2) {
    results.hidden = true;
    $("#placeSearchInput").setAttribute("aria-expanded", "false");
    status.textContent = query ? "두 글자 이상 입력해 주세요." : "장소 없이도 일정을 저장할 수 있습니다.";
    status.className = "field-hint";
    return;
  }
  status.textContent = "Google 지도에서 장소를 찾는 중입니다…";
  status.className = "field-hint is-loading";
  try {
    if (/^https?:\/\//i.test(query)) {
      await resolvePastedMapsLink(query, requestId); return;
    }
    const places = await findGooglePlaces(query);
    if (requestId !== state.placeResolveRequest || $("#placeSearchInput").value.trim() !== query) return;
    showPlaceResults(places);
    await renderEditorMap(null, places);
    if (requestId !== state.placeResolveRequest) return;
    status.textContent = places.length ? "검색 목록 또는 지도 핀에서 장소를 선택해 주세요." : "다른 검색어로 다시 찾아보세요.";
    status.className = places.length ? "field-hint" : "field-hint is-warning";
  } catch (error) {
    if (requestId !== state.placeResolveRequest) return;
    results.hidden = true;
    $("#placeSearchInput").setAttribute("aria-expanded", "false");
    status.textContent = error.message || "장소를 확인하지 못했습니다.";
    status.className = "field-hint is-warning";
  }
}

async function saveTransportMode(itemId,mode){
  if(!canEdit())throw Error('이 여행을 수정할 권한이 없습니다.');
  if(!['WALKING','DRIVING','OTHER'].includes(mode))throw Error('지원하지 않는 이동수단입니다.');
  const tripId=state.trip.id,item=state.items.find(i=>i.id===itemId);
  if(!item)throw Error('일정을 다시 선택해 주세요.');
  if(isGuestTrip()){
    const previous=item.transport_mode;const before=GuestDrafts.clone(state.guestBook);item.transport_mode=mode;commitGuest();
    if(state.guestStorageError){item.transport_mode=previous;state.guestBook=before;throw Error(state.guestStorageError);}
  }else{
    const {data,error}=await supabase.from('mt_itinerary_items').update({transport_mode:mode}).eq('id',itemId).eq('trip_id',tripId).select('id,transport_mode').single();
    if(error||!data)throw Error(error?.code==='23514'?'이동수단 저장 설정을 업데이트해야 합니다. 관리자에게 알려주세요.':error?.message||'이동수단을 저장하지 못했습니다.');
    if(state.trip?.id===tripId){const current=state.items.find(i=>i.id===itemId);if(current)current.transport_mode=data.transport_mode;setSync("실시간 저장됨");}
  }
  showToast('이동수단을 저장했습니다.');
}

async function saveSchedule(event) {
  event.preventDefault();
  if (!canEdit()) return;
  if (!validateScheduleDate())return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const startTime = readTimeFields("start");
  const endTime = $("#endTimeFields").hidden ? "" : readTimeFields("end");
  const placeQuery = $("#placeSearchInput").value.trim();
  const errorNode = $("#formError");
  errorNode.textContent = "";
  if (placeQuery && !state.pendingPlace) {
    errorNode.textContent = "검색 결과에서 장소를 선택하거나 검색어를 비워 주세요.";
    return;
  }
  if ($("#toggleEndTime").checked && (!startTime || !endTime)) { errorNode.textContent="시작 시간과 종료 시간을 모두 선택해 주세요."; return; }
  if (endTime && endTime <= startTime) {
    errorNode.textContent = "종료 시간을 시작 시간 이후로 선택해 주세요.";
    return;
  }
  const place = state.pendingPlace;
  let splitRatios = {};
  const settlementEnabled = $("#settlementEnabled").checked;
  if (settlementEnabled && data.get("splitType") === "custom") {
    attendeesFor({participant_ids:state.participantIds},travelers()).forEach(person => { splitRatios[person.id] = Number(data.get(`ratio_${person.id}`) || 0); });
    const sum = Object.values(splitRatios).reduce((total, value) => total + value, 0);
    if (Math.abs(sum - 100) > .05) {
      errorNode.textContent = "구성원의 배분율 합계를 100%로 맞춰 주세요.";
      return;
    }
  }
  const row = {
    trip_id: state.trip.id, item_date: data.get("date"), start_time: startTime || null, end_time: endTime || null,
    icon: "", name: String(data.get("name") || "").trim(), maps_url: place?.mapsUrl || null,
    place_id: place?.placeId || null, latitude: place?.latitude ?? null, longitude: place?.longitude ?? null,
    category: data.get("category") || null, memo: data.get("memo") || null,
    cost_won: settlementEnabled ? Number(data.get("cost") || 0) : 0, settlement_enabled: settlementEnabled, participant_ids: state.participantIds, split_ratios: splitRatios, created_by: state.session?.user.id || null
  };
  if (!row.name) {errorNode.textContent="일정 이름을 입력해 주세요.";return;}
  const itemId = String(data.get("itemId") || "");
  if(isGuestTrip()){
    const saved={...state.items.find(item=>item.id===itemId),...row,id:itemId||newLocalId(),sort_order:state.items.find(item=>item.id===itemId)?.sort_order||Date.now()};
    state.items=itemId?state.items.map(item=>item.id===itemId?saved:item):[...state.items,saved];
    state.activeDate=row.item_date;state.selectedId=saved.id;commitGuest();$('#scheduleDialog').close();render();return;
  }
  const query = itemId ? supabase.from("mt_itinerary_items").update(row).eq("id", itemId) : supabase.from("mt_itinerary_items").insert(row).select().single();
  const { data: saved, error } = await query;
  if (error) {
    errorNode.textContent = error.message;
    return;
  }
  $("#scheduleDialog").close();
  await loadTripData(state.trip.id);
  state.activeDate = row.item_date;
  state.selectedId = itemId || saved.id;
  render();
  showToast(itemId ? "일정을 수정했습니다." : "새 일정을 추가했습니다.");
}
async function deleteSchedule(idOverride = null) {
  const id = typeof idOverride === "string" ? idOverride : $("#scheduleForm").elements.itemId.value;
  if (!canEdit() || !id || !confirm("이 일정을 삭제할까요?")) return;
  if(isGuestTrip()){state.items=state.items.filter(item=>item.id!==id);state.selectedId=null;commitGuest();$("#scheduleDialog").close();render();return;}
  const { error } = await supabase.from("mt_itinerary_items").delete().eq("id", id);
  if (error) return showToast(error.message);
  if ($("#scheduleDialog").open) $("#scheduleDialog").close();
  state.selectedId = null;
  await loadTripData(state.trip.id);
  render();
  showToast("일정을 삭제했습니다.");
}
async function addCategory() {
  const input = $("#newCategory");
  const category = input.value.trim();
  if (!category || state.trip.categories.includes(category)) return;
  if (!guestWritable() && state.trip.owner_id !== state.session?.user.id) return showToast("카테고리는 여행 소유자만 관리할 수 있습니다.");
  const categories = [...state.trip.categories, category];
  if(guestWritable()){state.trip.categories=categories;commitGuest();renderCategories();return;}
  const { error } = await supabase.from("mt_trips").update({ categories }).eq("id", state.trip.id);
  if (error) return showToast(error.message);
  state.trip.categories = categories;
  input.value = "";
  renderCategories();
}
async function removeCategory(category) {
  if (!guestWritable() && state.trip.owner_id !== state.session?.user.id) return showToast("카테고리는 여행 소유자만 관리할 수 있습니다.");
  if (state.trip.categories.length <= 1) return showToast("카테고리는 하나 이상 남겨 주세요.");
  const categories = state.trip.categories.filter(value => value !== category);
  if(guestWritable()){state.trip.categories=categories;commitGuest();renderCategories();return;}
  const { error } = await supabase.from("mt_trips").update({ categories }).eq("id", state.trip.id);
  if (error) return showToast(error.message);
  state.trip.categories = categories;
  renderCategories();
}

async function getPlaceDetails(item) {
  const cacheKey = item.place_id || item.id;
  if (state.placeCache.has(cacheKey)) return state.placeCache.get(cacheKey);
  await loadGoogleMaps();
  const { Place } = await google.maps.importLibrary("places");
  let place;
  if (item.place_id) {
    place = new Place({ id: item.place_id });
    await place.fetchFields({ fields: ["displayName", "formattedAddress", "location", "googleMapsURI", "rating", "userRatingCount", "photos", "reviews"] });
  } else {
    const result = await Place.searchByText({
      textQuery: `${item.name} ${state.trip.destination}`,
      fields: ["id", "displayName", "formattedAddress", "location", "googleMapsURI", "rating", "userRatingCount", "photos", "reviews"],
      language: "ko", maxResultCount: 1, locationBias: itemPosition(item) || undefined
    });
    place = result.places?.[0];
  }
  if (!place) throw new Error("Google에서 장소 정보를 찾지 못했습니다.");
  state.placeCache.set(cacheKey, place);
  return place;
}
function openLargePhoto(source, alt, credit) {
  $("#largePhoto").src = source;
  $("#largePhoto").alt = alt;
  $("#largePhotoCredit").textContent = credit ? `사진 제공: ${credit} · Google Maps` : "Google Maps 사진";
  $("#imageDialog").showModal();
}

function renderReceipt() {
  const people=travelers(), costItems=state.items.filter(item=>item.settlement_enabled && Number(item.cost_won)>0);
  const shares=Object.fromEntries(people.map(person=>[person.id,0]));
  costItems.forEach(item=>Object.entries(allocateCost(item,people)).forEach(([id,amount])=>{shares[id]=(shares[id] || 0)+amount;}));
  const total=costItems.reduce((sum,item)=>sum+Number(item.cost_won),0);
  $("#receiptContent").innerHTML=`<div class="receipt-head"><strong>TRIP RECEIPT</strong><span>${safe(state.trip.title)} · ${safe(state.trip.start_date)} — ${safe(state.trip.end_date)}</span></div>${costItems.length ? costItems.map(item=>`<div class="receipt-line"><span>${safe(item.name)}<small class="receipt-attendees">${attendeesFor(item,people).map(p=>safe(p.nickname)).join(' · ')}</small></span><span>${won(item.cost_won)}</span></div>`).join('') : '<div class="receipt-line"><span>정산할 내역이 없습니다.</span><span>₩0</span></div>'}<div class="receipt-line receipt-total-line"><strong>TOTAL</strong><strong>${won(total)}</strong></div><div class="receipt-members">${people.map(person=>`<div class="receipt-line"><span>${faceHtml(person)} ${safe(person.nickname)}</span><strong>${won(shares[person.id])}</strong></div>`).join('')}</div><div class="receipt-barcode" aria-hidden="true"></div>`;
}

async function joinInvitedTrip(tripId, inviteCode) {
  if (!tripId || !inviteCode || !state.session) return false;
  // Reopening an invitation must not change a previously assigned viewer role.
  const existing=await supabase.from("mt_trip_members").select("user_id,role").eq("trip_id",tripId).eq("user_id",state.session.user.id);
  if(existing.error)throw existing.error;
  if(existing.data?.length)return true;
  const { error } = await supabase.from("mt_trip_members").insert({
    trip_id: tripId, user_id: state.session.user.id, role: "editor", invite_code_used: inviteCode
  });
  if (error && error.code !== "23505") throw error;
  return true;
}
async function loadTripData(tripId) {
  const tripResult = await supabase.from("mt_trips").select("*").eq("id", tripId).single();
  if (tripResult.error) throw tripResult.error;
  state.trip = tripResult.data;
  const [itemsResult, membersResult] = await Promise.all([
    supabase.from("mt_itinerary_items").select("*").eq("trip_id", tripId).order("item_date").order("start_time").order("sort_order"),
    supabase.from("mt_trip_members").select("user_id, role, joined_at").eq("trip_id", tripId).order("joined_at")
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (membersResult.error) throw membersResult.error;
  const ids = membersResult.data.map(member => member.user_id);
  const profilesResult = ids.length ? await supabase.from("mt_profiles").select("id, display_name, avatar_url").in("id", ids) : { data: [], error: null };
  const profiles = new Map((profilesResult.data || []).map(profile => [profile.id, profile]));
  state.members = membersResult.data.map(member => ({
    ...member, ...(profiles.get(member.user_id) || {}),
    display_name: profiles.get(member.user_id)?.display_name || (member.user_id === state.session.user.id ? state.session.user.user_metadata?.full_name || state.session.user.email?.split("@")[0] : "여행자"),
    avatar_url: profiles.get(member.user_id)?.avatar_url || (member.user_id === state.session.user.id ? state.session.user.user_metadata?.avatar_url : "")
  }));
  const accountsResult=await supabase.rpc("mt_trip_accounts",{p_trip_id:tripId});
  state.memberAccountsError=accountsResult.error ? '계정 정보를 불러오지 못했습니다. 여행을 다시 열어 주세요.' : '';
  if(Array.isArray(accountsResult.data)) {
    const accounts=new Map(accountsResult.data.map(account=>[account.user_id,account]));
    state.members=state.members.map(member=>({...member,...accounts.get(member.user_id)}));
  }
  state.items = itemsResult.data || [];
}
async function loadTripList() {
  const [tripsResult, membershipResult] = await Promise.all([
    supabase.from("mt_trips").select("*").order("updated_at", { ascending: false }),
    supabase.from("mt_trip_members").select("trip_id, role").eq("user_id", state.session.user.id)
  ]);
  if (tripsResult.error) throw tripsResult.error;
  if (membershipResult.error) throw membershipResult.error;
  const roles = new Map((membershipResult.data || []).map(member => [member.trip_id, member.role]));
  state.trips = (tripsResult.data || []).map(trip => ({
    ...trip,
    _role: trip.owner_id === state.session.user.id ? "owner" : roles.get(trip.id) || "viewer"
  }));
  return state.trips;
}
function setEmptyWorkspace() {
  state.trip = blankTrip();
  state.members = []; state.travelerFilter = "all";
  state.items = [];
  state.activeDate = state.trip.start_date;
  state.selectedId = null;
  if (state.realtimeChannel) {
    supabase.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }
}
function clearShareParameters() {
  const url = new URL(location.href);
  if (!url.searchParams.has("trip") && !url.searchParams.has("invite")) return;
  url.searchParams.delete("trip");
  url.searchParams.delete("invite");
  history.replaceState({}, "", url);
}
async function switchTrip(tripId, options = {}) {
  dismissMapPick();clearMapSearchPlace();
  if(tripId===SAMPLE_TRIP_ID){showSampleTrip();return;}
  const wasSample=Boolean(state.sampleReturn);leaveSampleTrip();
  if(wasSample && tripId===state.trip.id)return;
  if(state.guestMode){if(!guestWritable())return;loadGuestRecord(tripId);return;}
  if (!tripId || !state.session) return;
  setSync("여행을 불러오는 중");
  await loadTripData(tripId);
  state.activeDate = state.trip.start_date;
  state.selectedId = null; state.travelerFilter = "all";
  restoreView();
  state.placePreviewRequest += 1;
  localStorage.setItem(`morrow-active-trip-${state.session.user.id}`, tripId);
  if (options.clearShareUrl !== false) clearShareParameters();
  subscribeRealtime();
  setSync("실시간 저장됨");
  render();
}
async function loadCloudWorkspace() {
  setSync("저장된 여행을 불러오는 중");
  const params = new URLSearchParams(location.search);
  const invitedTrip = params.get("trip");
  const inviteCode = params.get("invite");
  if (invitedTrip && inviteCode) {
    await joinInvitedTrip(invitedTrip, inviteCode);
    await loadTripList();
    await loadTripData(invitedTrip);
    showToast("초대받은 여행에 참여했습니다.");
  } else {
    await loadTripList();
    const preferredId = readView().tripId || localStorage.getItem(`morrow-active-trip-${state.session.user.id}`);
    const trip = state.trips.find(value => value.id === preferredId) || state.trips[0];
    if (!trip) {
      setEmptyWorkspace();
      setSync("새 여행을 만들어 주세요");
      render();
      return;
    }
    await loadTripData(trip.id);
  }
  state.activeDate = dateRange(state.trip.start_date, state.trip.end_date).includes(state.activeDate) ? state.activeDate : state.trip.start_date;
  state.selectedId = null;
  restoreView();
  subscribeRealtime();
  setSync("실시간 저장됨");
  render();
}
function subscribeRealtime() {
  if (state.realtimeChannel) supabase.removeChannel(state.realtimeChannel);
  if (!state.trip.id) {
    state.realtimeChannel = null;
    return;
  }
  state.realtimeChannel = supabase.channel(`morrow-${state.trip.id}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "mt_itinerary_items", filter: `trip_id=eq.${state.trip.id}` }, scheduleReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "mt_trip_members", filter: `trip_id=eq.${state.trip.id}` }, scheduleReload)
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "mt_trips", filter: `id=eq.${state.trip.id}` }, scheduleReload)
    .subscribe(status => { if (status === "SUBSCRIBED") setSync("친구들과 실시간 연결됨"); });
}
function scheduleReload() {
  if(state.sampleReturn)return;
  clearTimeout(state.reloadTimer);
  state.reloadTimer = setTimeout(async () => {
    try {
      const tripId = state.trip.id;
      if(state.sampleReturn)return;
      if (!tripId) return;
      await loadTripData(tripId);
      await loadTripList();
      render();
      setSync("방금 동기화됨");
    } catch (error) {
      setSync("동기화 확인 필요");
    }
  }, 250);
}
function renderTripList() {
  const list = $("#tripList");
  if (!state.trips.length) {
    list.innerHTML = `<div class="trip-list-empty">아직 만든 여행이 없습니다.<br>첫 여행을 만들어 보세요.</div>`;
    return;
  }
  list.innerHTML = state.trips.map(trip => {
    const role = trip._role === "owner" ? "소유자" : trip._role === "editor" ? "편집 가능" : "열람만";
    return `<div class="trip-list-item ${trip.id === state.trip.id ? "is-active" : ""}"><button type="button" class="trip-list-main" data-trip-id="${safe(trip.id)}"><span><strong>${safe(trip.title)}</strong><small>${safe(trip.start_date)} — ${safe(trip.end_date)}</small></span><em>${role}</em></button><div class="trip-list-actions"><button type="button" data-load-trip="${safe(trip.id)}" aria-label="${safe(trip.title)} 불러오기">불러오기</button><button type="button" class="trip-share-button" data-share-trip="${safe(trip.id)}" aria-label="${safe(trip.title)} 링크 공유 설정">🔗 링크</button><button type="button" data-copy-trip="${safe(trip.id)}" aria-label="${safe(trip.title)} 복제하기">복제하기</button><button type="button" data-delete-trip="${safe(trip.id)}" aria-label="${safe(trip.title)} 삭제하기" ${guestWritable()||trip.owner_id===state.session?.user.id?'':'disabled title="여행 소유자만 삭제할 수 있습니다"'}>삭제하기</button></div></div>`;
  }).join("");
  $$("[data-trip-id]", list).forEach(button => button.addEventListener("click", async () => {
    if (button.dataset.tripId !== state.trip.id) await switchTrip(button.dataset.tripId);
    renderTripList();
    resetTripForm(state.trips.find(trip => trip.id === button.dataset.tripId) || state.trip);
  }));
  $$('[data-load-trip]',list).forEach(button=>button.addEventListener('click',async()=>{try{await switchTrip(button.dataset.loadTrip);renderTripList();resetTripForm(state.trip);$('#tripDialog').close();}catch(error){showToast(error.message||'여행을 불러오지 못했습니다.');}}));
  $$('[data-copy-trip]',list).forEach(button=>button.addEventListener('click',()=>duplicateTrip(button.dataset.copyTrip)));
  $$('[data-delete-trip]',list).forEach(button=>button.addEventListener('click',()=>deleteTrip(button.dataset.deleteTrip)));
  $$("[data-share-trip]", list).forEach(button => button.addEventListener("click", async () => {
    try {
      if (button.dataset.shareTrip !== state.trip.id) await switchTrip(button.dataset.shareTrip);
      $("#tripDialog").close();
      openNamedDialog("inviteDialog");
    } catch (error) {
      showToast(error.message || "공유 설정을 열지 못했습니다.");
    }
  }));
}
function resetTripForm(trip = null) {
  const form = $("#tripForm");
  form.reset();
  const isExisting = Boolean(trip?.id);
  const role = isExisting ? (trip._role || currentRole(trip)) : "owner";
  const editable = !isExisting || role === "owner";
  form.elements.tripId.value = trip?.id || "";
  form.elements.title.value = trip?.title || "";
  form.elements.startDate.value = trip?.start_date || todayString();
  form.elements.endDate.value = trip?.end_date || todayString();
  [form.elements.title, form.elements.startDate, form.elements.endDate].forEach(input => { input.disabled = !editable; });
  $("#tripFormTitle").textContent = isExisting ? "지금 선택한 여행의 정보" : "새 여행 만들기";
  $("#tripFormRole").textContent = !isExisting ? "일정 없이 시작합니다" : role === "owner" ? "제목과 기간을 수정할 수 있습니다" : role === "editor" ? "이 여행을 함께 편집 중입니다" : "이 여행을 열람할 수 있습니다";
  $("#saveTripButton").hidden = !editable;
  $("#deleteTripButton").hidden = !isExisting || role !== "owner";
  $("#tripFormError").textContent = "";
  state.draftTravelers = isExisting ? travelersFor(trip,state.members).map(person=>({...person})) : [{id:state.session?.user.id || newLocalId(),nickname:state.session?.user.user_metadata?.full_name || "나",avatar:"male-001"}];
  state.rosterEditable=editable; renderDraftTravelers(); renderTripAccounts();showTripManagerPanel("details");
}
function openTripManager(createNew = false) {
  leaveSampleTrip();
  if (!state.session && !isGuestTrip()) { clearShareParameters(); if(!initializeGuest())return; }
  if(state.guestMode && !guestWritable() && !recoverGuestEditing())return;
  renderTripList();
  resetTripForm(createNew || !state.trip.id ? null : state.trips.find(trip => trip.id === state.trip.id) || state.trip);
  showTripManagerPanel(createNew ? "details" : "list");
  if (!$("#tripDialog").open) $("#tripDialog").showModal();
}
async function saveTrip(event) {
  event.preventDefault();
  if (state.guestMode && !guestWritable())return;
  if (!state.session && !state.guestMode) return;
  const form = event.currentTarget;
  const data = new FormData(form);
  const tripId = String(data.get("tripId") || "");
  const title = String(data.get("title") || "").trim();
  const destination = tripId ? (state.trips.find(trip => trip.id === tripId)?.destination || "") : "";
  const startDate = String(data.get("startDate") || "");
  const endDate = String(data.get("endDate") || "");
  const errorNode = $("#tripFormError");
  const roster=state.draftTravelers.map(person=>({...person,nickname:person.nickname.trim(),...(window.CaptainStudio?{appearance:CaptainStudio.clean(person.appearance)}:{})}));
  if (!roster.length || roster.some(person=>!person.nickname)) {errorNode.textContent="여행 인원의 닉네임을 모두 입력해 주세요.";return;}
  errorNode.textContent = "";
  if (!title) return void (errorNode.textContent = "여행 제목을 입력해 주세요.");
  if (!startDate || !endDate || endDate < startDate) return void (errorNode.textContent = "종료일은 시작일과 같거나 이후여야 합니다.");
  if(state.guestMode){
    let record=state.guestBook.records.find(value=>value.trip.id===tripId);
    if(record){
      const old=record.trip,changed=old.start_date!==startDate||old.end_date!==endDate;
      if(changed) record.items=shiftScheduleDates(record.items,old.start_date,startDate,endDate);
      record.trip={...old,title,start_date:startDate,end_date:endDate,travelers:roster};
    }else{
      record={trip:{...blankTrip(),id:newLocalId(),title,start_date:startDate,end_date:endDate,travelers:roster},items:[]};state.guestBook.records.push(record);
    }
    loadGuestRecord(record.trip.id);commitGuest();$('#tripDialog').close();render();return;
  }
  if (tripId) {
    if (state.trip.id !== tripId || state.trip.owner_id !== state.session.user.id) return void (errorNode.textContent = "여행 소유자만 정보를 수정할 수 있습니다.");
    const datesChanged = startDate !== state.trip.start_date || endDate !== state.trip.end_date;
    const { error } = await supabase.rpc("mt_save_trip_settings", {
      p_trip_id: tripId,
      p_title: title,
      p_destination: destination,
      p_start_date: startDate,
      p_end_date: endDate,
      p_delete_items: false, p_travelers: roster
    });
    if (error) return void (errorNode.textContent = error.message);
    await loadTripList();
    await switchTrip(tripId);
    $("#tripDialog").close();
    showToast(datesChanged && state.items.length ? "기존 일정을 보존했습니다. 기간을 벗어난 일정은 마지막 날로 옮겼습니다." : "여행 정보를 저장했습니다.");
    return;
  }
  const { data: trip, error } = await supabase.from("mt_trips").insert({
    owner_id: state.session.user.id,
    title,
    destination,
    start_date: startDate,
    end_date: endDate,
    categories: ["음식", "관광", "이동", "쇼핑"], travelers: roster
  }).select().single();
  if (error) return void (errorNode.textContent = error.message);
  const memberResult = await supabase.from("mt_trip_members").insert({ trip_id: trip.id, user_id: state.session.user.id, role: "owner" });
  if (memberResult.error) return void (errorNode.textContent = memberResult.error.message);
  await loadTripList();
  await switchTrip(trip.id);
  $("#tripDialog").close();
  showToast("빈 여행을 만들었습니다. 첫 일정을 추가해 보세요.");
}
async function duplicateTrip(tripId){
  if(state.duplicating)return;
  const source=state.trips.find(trip=>trip.id===tripId);if(!source)return;
  state.duplicating=true;
  try{
    if(state.guestMode){
      if(!guestWritable()&&!recoverGuestEditing())return;
      const record=state.guestBook.records.find(r=>r.trip.id===tripId);if(!record)throw new Error('최신 여행 목록에서 다시 선택해 주세요.');
      const {trip,items}=copyTripRecord(record,record.trip.title+' (복사본)');
      state.guestBook.records.push({trip,items});state.guestBook.activeId=trip.id;state.guestBook.dirty=true;
      if(!writeGuestBook())throw new Error(state.guestStorageError);
      loadGuestRecord(trip.id);
    }else{
      const userId=state.session?.user.id;if(!userId)throw new Error('여행을 불러온 뒤 다시 시도해 주세요.');
      const key=`tripplan-copy-${userId}-${tripId}`;
      const store=new GuestDrafts.Store({getItem:()=>localStorage.getItem(key),setItem:(_,value)=>localStorage.setItem(key,value)});
      let book=store.read();
      if(!book.records.length){
        const result=await supabase.from('mt_itinerary_items').select('*').eq('trip_id',tripId);if(result.error)throw result.error;
        const {trip,items}=copyTripRecord({trip:source,items:result.data||[]},source.title+' (복사본)');
        book=store.write({...book,records:[{trip,items}],activeId:trip.id,dirty:true,pending:{requestedAt:Date.now(),userId}});
      }
      book=await GuestDrafts.transfer(supabase,store,book,userId,()=>state.session?.user.id===userId);
      await loadTripList();await switchTrip(book.activeId);localStorage.removeItem(key);
    }
    renderTripList();resetTripForm(state.trip);showToast('여행을 복제했습니다. 복사본을 자유롭게 수정하세요.');
  }catch(error){showToast('복제를 완료하지 못했습니다. 같은 여행의 복제하기를 다시 누르면 이어서 처리합니다. '+(error.message||''));}
  finally{state.duplicating=false;}
}
async function deleteTrip(targetId) {
  const tripId=typeof targetId==='string'?targetId:$('#tripForm').elements.tripId.value;
  const trip=state.trips.find(t=>t.id===tripId)||(state.trip.id===tripId?state.trip:null);
  if(state.guestMode){if(!guestWritable()||!trip||!confirm('이 임시 여행을 삭제할까요?'))return;state.guestBook.records=state.guestBook.records.filter(record=>record.trip.id!==tripId);state.guestBook.dirty=state.guestBook.records.length>0;state.guestBook.editor=null;state.guestBook.activeId=state.guestBook.records[0]?.trip.id||null;writeGuestBook();initializeGuest();renderTripList();resetTripForm(state.trip);return;}
  if(!trip||trip.owner_id!==state.session?.user.id)return;
  if(!confirm(`‘${trip.title}’ 여행과 모든 일정을 삭제할까요?`))return;
  try{
    const {error}=await supabase.from('mt_trips').delete().eq('id',tripId).eq('owner_id',state.session.user.id);
    if(error)throw error;
    const wasCurrent=state.trip.id===tripId;await loadTripList();
    if(wasCurrent){localStorage.removeItem(`morrow-active-trip-${state.session.user.id}`);if(state.trips[0])await switchTrip(state.trips[0].id);else{setEmptyWorkspace();setSync('새 여행을 만들어 주세요');render();}}
    renderTripList();resetTripForm(state.trip.id?state.trip:null);showToast('여행을 삭제했습니다.');
  }catch(error){showToast(error.message||'여행을 삭제하지 못했습니다.');}
}
async function updateMemberRole(userId, role) {
  const { error } = await supabase.from("mt_trip_members").update({ role }).eq("trip_id", state.trip.id).eq("user_id", userId);
  if (error) return showToast(error.message);
  await loadTripData(state.trip.id);
  render();
  showToast("구성원 권한을 변경했습니다.");
}
function updateAccountUI() {
  const user = state.session?.user;
  const name = user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split("@")[0];
  $("#profileLabel").textContent = user ? user.email : "Google 로그인";
  $("#accountTitle").textContent = user ? `${name}님의 여행` : "여행을 함께 기록하세요";
  $("#accountDescription").textContent = user ? `${user.email} 계정으로 일정이 실시간 저장됩니다.` : "지금까지 만든 임시 계획은 로그인 전에 이 브라우저에 보관하고, Google 로그인 후 계정에 저장합니다. 로그인하지 않아도 계획을 계속 작성할 수 있어요.";
  $("#googleSignIn").hidden = Boolean(user);
  $("#signOutButton").hidden = !user;
  $("#inviteDescription").textContent = "링크가 있으면 로그인 없이 전체 일정을 볼 수 있습니다. 수정 버튼을 누르면 Google 로그인을 안내합니다.";
  const params = new URLSearchParams(location.search);
  $("#copyInvite").disabled = !(state.trip.share_code || (params.get("trip") && params.get("invite")));
  updateAutoSaveStatus();
}

function scrollToCurrentScheduleOnMobile() {
  if(!matchMedia('(max-width: 850px)').matches||!state.followClock)return;
  syncTripClock();render();
  requestAnimationFrame(()=>$('.agenda-item.is-current')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'nearest'}));
}

async function signInWithGoogle() {
  if(state.guestOAuthLeaving || state.guestImporting || state.guestSigningIn)return;
  leaveSampleTrip();
  state.guestSigningIn=true;
  try{
    guestStore ||= new GuestDrafts.Store(localStorage);
    if(!state.guestBook)state.guestBook=guestStore.read();
    captureGuestEditor();
    if(guestHasWork()){
      if(state.guestConflict)throw new Error('다른 탭과 충돌했습니다. 열린 입력창을 닫고 다시 시도해 주세요.');
      state.guestBook.pending ||= {requestedAt:Date.now(),userId:null};
      if(!writeGuestBook())throw new Error('로그인 이동 전에 임시 저장하지 못했습니다. '+state.guestStorageError);
    }
    if(state.session){await restoreWorkspace();return;}
    if(location.protocol!=='https:' && !['localhost','127.0.0.1'].includes(location.hostname)){
      throw new Error('Google 로그인은 HTTPS 주소에서 시작해 주세요. 현재 계획은 이 주소의 브라우저에 보관 중입니다.');
    }
    const {data,error}=await supabase.auth.signInWithOAuth({provider:'google',options:{redirectTo:authRedirectUrl(location.href),skipBrowserRedirect:true}});
    if(error)throw error;if(!data?.url)throw new Error('로그인 주소를 받지 못했습니다. 다시 시도해 주세요.');
    // A second verified synchronous write immediately before leaving for Google.
    if(guestHasWork() && !writeGuestBook())throw new Error('임시 저장을 확인하지 못해 로그인 이동을 중단했습니다.');
    state.guestOAuthLeaving=true;location.assign(data.url);
  }catch(error){state.guestOAuthLeaving=false;showToast(error.message||'로그인하지 못했습니다. 임시 계획은 유지됩니다.');refreshGuestNotice();}finally{state.guestSigningIn=false;}
}
async function signOut() {
  if(state.guestImporting)return;
  leaveSampleTrip();
  await supabase.auth.signOut();
  state.session = null;
  state.trips = [];
  setEmptyWorkspace();
  $("#accountDialog").close();
  const shared = await loadPublicSharedTrip().catch(() => false);
  if (!shared) {
    initializeGuest();
  }
}
async function copyInvite() {
  const params = new URLSearchParams(location.search);
  const tripId = state.trip.share_code ? state.trip.id : params.get("trip");
  const inviteCode = state.trip.share_code || params.get("invite");
  if (!tripId || !inviteCode) return showToast("로그인 후 여행을 저장하면 공유 링크를 만들 수 있습니다.");
  const url = new URL(location.origin + location.pathname);
  url.searchParams.set("trip", tripId);
  url.searchParams.set("invite", inviteCode);
  try {
    await navigator.clipboard.writeText(url.href);
    $("#copyStatus").textContent = "공개 열람 링크를 복사했습니다.";
  } catch {
    $("#copyStatus").textContent = url.href;
  }
}
async function loadPublicSharedTrip() {
  const params = new URLSearchParams(location.search);
  const tripId = params.get("trip");
  const inviteCode = params.get("invite");
  if (!tripId || !inviteCode) return false;
  const { data, error } = await supabase.rpc("mt_get_shared_trip", { p_trip_id: tripId, p_share_code: inviteCode });
  if (error) throw error;
  if (!data?.trip) throw new Error("공유 링크가 유효하지 않습니다.");
  state.trip = data.trip;
  state.items = data.items || [];
  state.members = data.members || [];
  state.activeDate = dateRange(state.trip.start_date, state.trip.end_date)[0];
  state.selectedId = null;
  setSync("공개 열람 중 · 로그인 후 수정");
  render();
  return true;
}
function restoreWorkspace() {
  // Coalesce repeated SIGNED_IN events while the initial workspace is loading.
  if (state.workspaceLoad) return state.workspaceLoad;
  leaveSampleTrip();
  const userId = state.session?.user.id;
  state.workspaceLoad = retryWorkspaceLoad(async () => {
    if (!userId || state.session?.user.id !== userId) return;
    const transferred=await transferGuestWorkspace();
    if(state.guestBook?.dirty){state.guestMode=true;loadGuestRecord(state.guestBook.activeId);refreshGuestNotice();return;}
    state.guestMode=false;await loadCloudWorkspace();state.loadedUserId=userId;
    if(state.guestBook?.importedFor===userId)restoreGuestEditor();
    refreshGuestNotice();
    if(transferred)showToast("비로그인으로 만든 계획을 Google 계정에 저장했습니다.");
  }).catch(error => {
    if (state.session?.user.id !== userId) return;
    console.error(`Workspace load failed: ${error.code || "unknown"}: ${error.message || "unknown error"}`);
    if(guestHasWork()){state.guestMode=true;loadGuestRecord(state.guestBook.activeId);refreshGuestNotice();}
    setSync(guestHasWork()?"계정 저장 미완료 · 다시 시도해 주세요":"저장된 여행을 불러오지 못했습니다");
    showToast("여행을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.");
  }).finally(() => { state.workspaceLoad = null; });
  return state.workspaceLoad;
}
async function initializeAuth() {
  const callbackURL=new URL(location.href);
  const fragment=new URLSearchParams(callbackURL.hash.slice(1));
  const hadCallback=callbackURL.searchParams.has('code') || callbackURL.searchParams.has('error') || fragment.has('error');
  let data, error;
  try{({data,error}=await supabase.auth.getSession());}
  catch(failure){error=failure;}

  if (error) setSync("로그인 상태를 확인하지 못했습니다");
  state.session = data?.session || null;
  updateAccountUI();
  if (state.session) {
    await restoreWorkspace();
  } else {
    try {
      const shared = await loadPublicSharedTrip();
      if (!shared && !isGuestTrip() && !state.sampleReturn) {
        initializeGuest();
      }
    } catch (shareError) {
      setSync("공유 여행을 불러오지 못했습니다");
      showToast(shareError.message || "공유 링크를 확인해 주세요.");
      render();
    }
  }
  if(hadCallback){
    for(const key of ['code','error','error_code','error_description'])callbackURL.searchParams.delete(key);
    if(fragment.has('error') || fragment.has('access_token'))callbackURL.hash='';
    history.replaceState({},'',callbackURL);
    if(!state.session){
      $('#accountDescription').textContent='로그인을 완료하지 못했습니다. 로그인 시작 주소와 Supabase 복귀 주소를 확인한 뒤 다시 시도해 주세요. 임시 계획은 원래 브라우저에 보관되어 있습니다.';
      $('#accountDialog').showModal();
    }
  }
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "INITIAL_SESSION") return;
    const sameLoadedAccount=session?.user.id===state.loadedUserId && state.trip.id && !state.guestMode;
    state.session = session;
    if (session && event === "SIGNED_IN" && !sameLoadedAccount) setTimeout(() => restoreWorkspace(), 0);
    if(!session && event==="SIGNED_OUT"){state.loadedUserId=null;leaveSampleTrip();if(!state.guestMode){setEmptyWorkspace();initializeGuest();}}
    updateAccountUI();
  });
}

function travelers(){return travelersFor(state.trip,state.members);}
function avatarUrl(person){const key=/^(male|female)-(00[1-9]|0[1-9]\d|1\d\d|200)$/.test(person.avatar || '') ? person.avatar : 'male-001';return `./assets/avatars-clay/${key}.webp`;}
function faceHtml(person,alt=person.nickname){const data={avatar:person.avatar,appearance:person.appearance};return `<img class="traveler-face" src="${window.CaptainStudio?.sourceFor(person)||avatarUrl(person)}" data-traveler-look="${safe(JSON.stringify(data))}" alt="${safe(alt)}" width="38" height="38">`;}
function renderAttendeeSummary(){const people=attendeesFor({participant_ids:state.participantIds},travelers());$("#attendeeSummary").innerHTML=`<div class="face-stack">${people.slice(0,4).map(person=>faceHtml(person)).join('')}</div><div><strong>${people.length}명 ${state.participantIds == null ? '모두 함께' : '함께'}</strong><small>${people.map(person=>safe(person.nickname)).join(' · ')}</small></div><span class="attendee-badge">${state.participantIds == null ? '전원 참석' : '개별 일정'}</span>`;}
function openAttendees(){const people=travelers();$("#attendEveryone").checked=state.participantIds==null;$("#attendeeOptions").innerHTML=people.map(person=>`<label class="attendee-choice">${faceHtml(person,'')}<span>${safe(person.nickname)}</span><input type="checkbox" value="${safe(person.id)}" ${state.participantIds==null || state.participantIds.includes(person.id) ? 'checked' : ''}></label>`).join('');$("#attendeeError").textContent='';$$("input",$("#attendeeOptions")).forEach(input=>input.addEventListener('change',()=>{$("#attendEveryone").checked=false;}));$("#attendeeDialog").showModal();}
function renderDraftTravelers(){const editable=state.rosterEditable;$("#travelerCount").textContent=`${state.draftTravelers.length}명`;$("#addTraveler").hidden=!editable;$("#travelerList").innerHTML=state.draftTravelers.map(person=>`<div class="traveler-row"><button type="button" class="traveler-avatar-button" data-change-avatar="${safe(person.id)}" aria-label="${safe(person.nickname || '여행자')} 얼굴 선택" ${editable?'':'disabled'}>${faceHtml(person,'선택한 캐릭터')}</button><input data-nickname="${safe(person.id)}" aria-label="여행 인원 닉네임" value="${safe(person.nickname)}" placeholder="닉네임" maxlength="40" ${editable?'':'disabled'}><button type="button" class="remove-traveler" data-remove-traveler="${safe(person.id)}" aria-label="${safe(person.nickname || '여행자')} 인원 삭제" ${editable?'':'disabled'}>×</button></div>`).join('');
  $$('[data-nickname]').forEach(input=>input.addEventListener('input',()=>{state.draftTravelers.find(p=>p.id===input.dataset.nickname).nickname=input.value;}));
  $$('[data-change-avatar]').forEach(button=>button.addEventListener('click',()=>{state.avatarPerson=button.dataset.changeAvatar;const person=state.draftTravelers.find(p=>p.id===state.avatarPerson);state.avatarGroup=person.avatar?.startsWith('female')?'female':'male';state.avatarPage=person.appearance?.variant?8:Math.floor((Number(person.avatar?.split('-')[1] || 1)-1)/25);renderAvatarGrid();$("#avatarDialog").showModal();}));
  $$('[data-remove-traveler]').forEach(button=>button.addEventListener('click',()=>{const id=button.dataset.removeTraveler;if(state.draftTravelers.length<=1)return showToast('여행 인원은 한 명 이상 필요합니다.');const used=state.items.some(item=>item.participant_ids?.includes(id) || Object.hasOwn(item.split_ratios || {},id));if(used)return showToast('이 인원이 지정된 일정의 참석·정산 설정을 먼저 변경해 주세요.');state.draftTravelers=state.draftTravelers.filter(p=>p.id!==id);renderDraftTravelers();}));
}
function editAvatarLook(selection=null){
  const person=state.draftTravelers.find(p=>p.id===state.avatarPerson);if(!person)return;
  if(!window.CaptainStudio)return showToast('머리색 선택 화면을 불러오는 중입니다. 잠시 후 다시 눌러주세요.');
  $('#avatarDialog').close();
  CaptainStudio.open(selection||person,value=>{person.avatar=value.avatar;person.appearance=value.appearance;renderDraftTravelers();$('#avatarDialog').close();});
}
function renderAvatarGrid(){
  const group=state.avatarGroup||'female',page=Math.max(0,Math.min(8,state.avatarPage||0)),person=state.draftTravelers.find(p=>p.id===state.avatarPerson);
  $$('[data-avatar-group]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.avatarGroup===group)));
  $('#avatarGrid').innerHTML=Array.from({length:25},(_,index)=>{const number=(page===8?0:page*25)+index+1,key=`${page===8?'extra-':''}${group}-${String(number).padStart(3,'0')}`;const src=page===8?`./assets/studio/${key}.webp`:`./assets/avatars-clay/${key}.webp?v=3`;return `<button type="button" class="avatar-option" data-avatar="${key}" aria-label="${group==='male'?'남성':'여성'} ${page===8?'새 헤어':'캐릭터'} ${number}" aria-pressed="${(person?.appearance?.variant||person?.avatar)===key}"><img src="${src}" alt="" width="70" height="70"></button>`;}).join('');
  $('#avatarPage').textContent=`${page+1} / 9${page===8?' · 새 헤어':''}`;$('#avatarPrevious').disabled=page===0;$('#avatarNext').disabled=page===8;
  $$('[data-avatar]').forEach(button=>button.addEventListener('click',()=>{if(!person)return;const key=button.dataset.avatar;const selection={...person,appearance:window.CaptainStudio?.clean(person.appearance)||{}};if(key.startsWith('extra-')){selection.avatar=`${group}-001`;selection.appearance.variant=key;}else{selection.avatar=key;delete selection.appearance.variant;}person.avatar=selection.avatar;person.appearance=selection.appearance;renderDraftTravelers();$("#avatarDialog").close();}));
}
$('#editCurrentLook').addEventListener('click',()=>editAvatarLook());
$('#showNewHair').addEventListener('click',()=>{state.avatarPage=8;renderAvatarGrid();});

async function resolvePastedMapsLink(query,requestId){let parsed=parseMapsUrl(query);if(parsed.short){const {data,error}=await supabase.functions.invoke('resolve-maps-link',{body:{url:parsed.url}});if(error || data?.error)throw new Error(data?.error || '짧은 링크를 확인하지 못했습니다. Google 지도에서 주소창의 전체 링크를 복사해 주세요.');parsed=parseMapsUrl(data.url);}if(requestId!==state.placeResolveRequest)return;
  if(parsed.placeId){await loadGoogleMaps();const {Place}=await google.maps.importLibrary('places');const place=new Place({id:parsed.placeId});await place.fetchFields({fields:['id','displayName','formattedAddress','location','googleMapsURI']});if(requestId===state.placeResolveRequest)selectGooglePlace(place);return;}
  if(parsed.name){const places=await findGooglePlaces(parsed.name,parsed.bias);if(requestId!==state.placeResolveRequest)return;if(places.length){showPlaceResults(places);await renderEditorMap(null,places);$('#mapsLinkStatus').textContent='링크의 장소를 찾았습니다. 목록 또는 지도 핀에서 선택해 주세요.';return;}}
  if(parsed.location){state.pendingPlace={mapsUrl:parsed.url,placeId:null,latitude:parsed.location.lat,longitude:parsed.location.lng,name:parsed.name || '선택한 위치',address:''};$("#mapsUrlInput").value=parsed.url;$("#placeSearchResults").hidden=true;$("#placeSearchInput").setAttribute('aria-expanded','false');$("#clearPlaceButton").hidden=false;$("#mapsLinkStatus").textContent='링크의 위치를 확인했습니다.';$("#mapsLinkStatus").className='field-hint is-success';renderEditorMap(state.pendingPlace);return;}
  throw new Error('이 링크에서 위치를 확인하지 못했습니다. 장소 이름으로 검색하거나 Google 지도에서 장소 공유 링크를 다시 복사해 주세요.');
}


// Explicit time selection works across desktop and mobile without a numeric keyboard.
let timeDraft = { prefix: 'start', hour: '09', minute: '00' };
function openTimePicker(prefix) {
  const value = readTimeFields(prefix) || (prefix === 'end' ? readTimeFields('start') : '') || '09:00';
  timeDraft = { prefix, hour: value.slice(0, 2), minute: value.slice(3, 5) };
  $('#timePickerTitle').textContent = prefix === 'start' ? '시작 시간 선택' : '종료 시간 선택';
  renderTimePicker();
  $('#timePickerDialog').showModal();
  requestAnimationFrame(() => {
    $('#hourOptions [aria-pressed="true"]')?.scrollIntoView({ block: 'center' });
    $('#minuteOptions [aria-pressed="true"]')?.scrollIntoView({ block: 'center' });
  });
}
function renderTimePicker() {
  for (const [part, count, selector] of [['hour', 24, '#hourOptions'], ['minute', 60, '#minuteOptions']]) {
    const container = $(selector);
    container.innerHTML = Array.from({ length: count }, (_, n) => {
      const value = String(n).padStart(2, '0');
      return `<button type="button" data-time-part="${part}" data-time-value="${value}" aria-pressed="${timeDraft[part] === value}">${value}${part === 'hour' ? '시' : '분'}</button>`;
    }).join('');
    $$('[data-time-part]', container).forEach(button => button.addEventListener('click', () => {
      timeDraft[part] = button.dataset.timeValue;
      $$('[data-time-part]', container).forEach(option => option.setAttribute('aria-pressed', String(option === button)));
    }));
  }
}
$$('[data-time-picker]').forEach(button => button.addEventListener('click', () => openTimePicker(button.dataset.timePicker)));
$('#confirmTime').addEventListener('click', () => {
  setTimeFields(timeDraft.prefix, `${timeDraft.hour}:${timeDraft.minute}`);
  $('#timePickerDialog').close();
  $(`#${timeDraft.prefix}TimeButton`).focus();
});
$('#clearTime').addEventListener('click', () => {
  setTimeFields(timeDraft.prefix, '');
  if (timeDraft.prefix === 'end') toggleEndTime(false);
  $('#timePickerDialog').close();
});

function syncPlaceCardExpansion() {
  const collapsed = Boolean(state.placeCardCollapsed);
  $('#placeCardDetails').hidden = collapsed;
  $('#placeCard').classList.toggle('is-collapsed', collapsed);
  $('#togglePlaceCard').setAttribute('aria-expanded', String(!collapsed));
  $('#togglePlaceCard').textContent = collapsed ? '펼치기 ⌃' : '접기 ⌄';
}
$('#togglePlaceCard').addEventListener('click', () => {
  state.placeCardCollapsed = !state.placeCardCollapsed;
  syncPlaceCardExpansion();
  const preview=state.mapSearchItem || selectedItem();
  if (!state.placeCardCollapsed && preview?.maps_url) renderPlacePreview(preview);
  else state.placePreviewRequest++;
});

let mapSearchRequest=0;
function clearMapSearchPlace(){
  mapSearchRequest++;$('#mapSearchResults').hidden=true;$('#mapSearchStatus').textContent='';
  state.mapSearchPlace=null;state.mapSearchItem=null;
  if(state.mapSearchMarker){state.mapSearchMarker.map=null;state.mapSearchMarker=null;}
}
function setMapSearchOpen(open){
  $('#mapSearch').classList.toggle('is-open',open);
  $('#toggleMapSearch').setAttribute('aria-expanded',String(open));
  if(open)$('#mapSearchInput').focus();
  else {mapSearchRequest++;$('#mapSearchResults').hidden=true;$('#mapSearchStatus').textContent='';}
}
async function searchMainMap(event){
  event?.preventDefault();
  const query=$('#mapSearchInput').value.trim(),request=++mapSearchRequest;
  $('#mapSearchResults').replaceChildren();$('#mapSearchResults').hidden=true;
  if(!query){$('#mapSearchStatus').textContent='장소 이름이나 지역을 입력해 주세요.';return;}
  $('#mapSearchStatus').textContent='장소를 찾는 중…';
  try{
    const places=await findGooglePlaces(query);
    if(request!==mapSearchRequest)return;
    $('#mapSearchStatus').textContent=places.length?`${places.length}곳을 찾았어요. 장소를 눌러 정보를 확인하세요.`:'검색 결과가 없습니다. 지역명과 함께 검색해 보세요.';
    for(const place of places){
      const button=document.createElement('button');button.type='button';button.className='map-search-result';
      button.innerHTML=`<strong>${safe(place.displayName || '이름 없는 장소')}</strong><small>${safe(place.formattedAddress || '')}</small>`;
      button.addEventListener('click',()=>previewMapSearchPlace(place));$('#mapSearchResults').append(button);
    }
    $('#mapSearchResults').hidden=!places.length;
  }catch(error){if(request===mapSearchRequest)$('#mapSearchStatus').textContent=error.message || '검색하지 못했습니다. 다시 시도해 주세요.';}
}
async function previewMapSearchPlace(place){
  if(!place.location){$('#mapSearchStatus').textContent='위치 정보가 없는 장소입니다. 다른 결과를 선택해 주세요.';return;}
  clearMapSearchPlace();dismissMapPick();
  state.mapSearchPlace=place;
  state.mapSearchItem={id:'search-'+place.id,place_id:place.id,name:place.displayName || '선택한 장소',memo:place.formattedAddress || '',maps_url:place.googleMapsURI || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(place.displayName || '')}&query_place_id=${encodeURIComponent(place.id)}`,latitude:place.location.lat(),longitude:place.location.lng()};
  state.placeCardCollapsed=false;
  $('#mapSearchResults').hidden=true;$('#mapSearchStatus').textContent='';$('#mapSearchInput').blur();
  setMapSearchOpen(false);updatePlaceCard(state.mapSearchItem);
  state.map?.panTo(place.location);state.map?.setZoom(16);
  try{
    const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
    if(state.mapSearchPlace!==place)return;
    state.mapSearchMarker=new AdvancedMarkerElement({map:state.map,position:place.location,title:place.displayName,zIndex:240});
  }catch{/* Place details and add-to-schedule remain available without the marker. */}
}
$('#mapSearchForm').addEventListener('submit',searchMainMap);
$('#toggleMapSearch').addEventListener('click',()=>setMapSearchOpen(!$('#mapSearch').classList.contains('is-open')));
$('#closeMapSearch').addEventListener('click',()=>setMapSearchOpen(false));
$('#mapSearchInput').addEventListener('input',()=>{mapSearchRequest++;$('#mapSearchResults').hidden=true;$('#mapSearchStatus').textContent='';});
$('#mapSearchInput').addEventListener('keydown',event=>{if(event.key==='Escape')setMapSearchOpen(false);});
$('#closeSearchPlace').addEventListener('click',()=>{clearMapSearchPlace();updatePlaceCard(selectedItem());});
$('#addSearchPlace').addEventListener('click',()=>{
  const place=state.mapSearchPlace;if(!place)return;
  openSchedule();
  if($('#scheduleDialog').open)selectGooglePlace(place);
});

function clearEditorMarkers() {
  if (state.editorMarker) { state.editorMarker.map = null; state.editorMarker = null; }
  (state.editorResultMarkers || []).forEach(marker => { marker.map = null; });
  state.editorResultMarkers = [];
}
function showPlaceResults(places) {
  state.editorResults = places;
  const results = $('#placeSearchResults');
  results.innerHTML = places.length ? places.map((place, index) => `<button type="button" role="option" aria-selected="false" data-place-index="${index}"><span class="result-number">${index + 1}</span><span><strong>${safe(place.displayName)}</strong><small>${safe(place.formattedAddress || '주소 정보 없음')}</small></span></button>`).join('') : '<p>검색 결과가 없습니다. 지도에서 직접 위치를 선택할 수도 있어요.</p>';
  results.hidden = false;
  $('#placeSearchInput').setAttribute('aria-expanded', 'true');
  $$('[data-place-index]', results).forEach(button => button.addEventListener('click', () => selectGooglePlace(places[Number(button.dataset.placeIndex)])));
}
async function renderEditorMap(place = null, results = []) {
  const request = ++state.editorMapRequest;
  const wrap = $('#editorMapWrap');
  wrap.hidden = false;
  $('#editorPlaceName').textContent = place?.name || (results.length ? `${results.length}개 장소를 지도에서 비교해요` : '지도에서 직접 골라도 좋아요');
  $('#editorPlaceAddress').textContent = place?.address || '원하는 장소나 빈 위치를 눌러 핀을 선택하세요.';
  try {
    await loadGoogleMaps();
    const [{ Map }, { AdvancedMarkerElement }] = await Promise.all([google.maps.importLibrary('maps'), google.maps.importLibrary('marker')]);
    if (request !== state.editorMapRequest || !$('#scheduleDialog').open) return;
    const position = place?.latitude != null ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null;
    if (!state.editorMap) {
      state.editorMap = new Map($('#editorMap'), {
        center: position || { lat: 37.5665, lng: 126.9780 },
        zoom: 14, mapId: 'DEMO_MAP_ID', renderingType: 'RASTER', mapTypeControl: false, streetViewControl: false,
        fullscreenControl: false, gestureHandling: 'cooperative', clickableIcons: true
      });
      applyPastelMap(state.editorMap);
      state.editorMap.addListener('click', event => handleEditorMapClick(event));
    }
    google.maps.event.trigger(state.editorMap, 'resize');
    clearEditorMarkers();
    const located = results.filter(result => result.location);
    if (located.length) {
      const bounds = new google.maps.LatLngBounds();
      located.forEach(result => {
        const index = results.indexOf(result);
        const content = document.createElement('div');
        content.className = 'search-map-pin'; content.textContent = String(index + 1);
        const marker = new AdvancedMarkerElement({ map: state.editorMap, position: result.location, content, title: `${index + 1}. ${result.displayName}`, gmpClickable: true });
        marker.addEventListener('gmp-click', () => selectGooglePlace(result));
        state.editorResultMarkers.push(marker); bounds.extend(result.location);
      });
      if (located.length === 1) { state.editorMap.setCenter(located[0].location); state.editorMap.setZoom(15); }
      else state.editorMap.fitBounds(bounds, 38);
    } else if (position) {
      state.editorMap.setCenter(position); state.editorMap.setZoom(16);
      state.editorMarker = new AdvancedMarkerElement({ map: state.editorMap, position, title: place.name || '선택한 위치' });
    } else {
      state.editorMap.setCenter({lat:37.5665,lng:126.9780}); state.editorMap.setZoom(14);
    }
  } catch (error) {
    if (request !== state.editorMapRequest) return;
    $('#editorPlaceAddress').textContent = '지도 미리보기를 불러오지 못했습니다. 검색 목록에서 장소를 선택하거나 장소 없이 저장할 수 있어요.';
  }
}
async function placeFromMapEvent(event) {
  if (event.placeId) {
    const { Place } = await google.maps.importLibrary('places');
    const place = new Place({ id: event.placeId });
    await place.fetchFields({ fields: ['id', 'displayName', 'formattedAddress', 'location', 'googleMapsURI'] });
    if (!place.location) throw new Error('이 장소의 위치를 불러오지 못했습니다. 다른 핀을 선택해 주세요.');
    return place;
  }
  const location = event.latLng;
  if (!location) return null;
  const latitude = location.lat(), longitude = location.lng();
  let address = `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
  try {
    const { Geocoder } = await google.maps.importLibrary('geocoding');
    const { results } = await new Geocoder().geocode({ location });
    address = results?.[0]?.formatted_address || address;
  } catch { /* An exact coordinate can still be saved if geocoding is unavailable. */ }
  return { id: null, displayName: '', formattedAddress: address, location,
    googleMapsURI: `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}` };
}
async function handleEditorMapClick(event) {
  event.stop?.();
  clearTimeout(placeSearchTimer);
  const request = ++state.placeResolveRequest;
  state.editorMapRequest++;
  $('#mapsLinkStatus').textContent = '선택한 위치를 확인하는 중…';
  try {
    const place = await placeFromMapEvent(event);
    if (request !== state.placeResolveRequest || !$('#scheduleDialog').open || !place) return;
    selectGooglePlace(place);
  } catch (error) {
    if (request === state.placeResolveRequest) $('#mapsLinkStatus').textContent = error.message || '장소를 확인하지 못했습니다.';
  }
}
let mainMapPickRequest = 0;
function positionMapPick() {
  const card=$('#mapPickCard');if(card.hidden)return;
  const panel=$('.map-viewport'),bounds=panel.getBoundingClientRect();
  let point=state.mapPickPixel;
  if(state.mapPickPosition&&state.mapPickOverlay?.getProjection()) {
    const projected=state.mapPickOverlay.getProjection().fromLatLngToContainerPixel(state.mapPickPosition);
    if(projected)point=projected;
  }
  if(!point)point={x:bounds.width/2,y:bounds.height/2};
  const width=card.offsetWidth||218,height=card.offsetHeight||116,padding=10;
  const right=point.x+16+width<=bounds.width-padding;
  const x=Math.max(padding,Math.min(bounds.width-width-padding,right?point.x+16:point.x-width-16));
  const y=Math.max(52,Math.min(bounds.height-height-34,point.y-height*.35));
  card.style.left=x+'px';card.style.top=y+'px';card.style.right='auto';
  card.dataset.side=right?'right':'left';
  card.style.setProperty('--pick-arrow-y',Math.max(14,Math.min(height-14,point.y-y))+'px');
}
function anchorMapPick(event) {
  state.mapPickPosition=event.latLng||null;
  const bounds=$('.map-viewport').getBoundingClientRect(),dom=event.domEvent;
  state.mapPickPixel=dom&&Number.isFinite(dom.clientX)?{x:dom.clientX-bounds.left,y:dom.clientY-bounds.top}:null;
  if(!state.mapPickOverlay&&google.maps.OverlayView) {
    class PickProjection extends google.maps.OverlayView {
      onAdd(){} draw(){positionMapPick();} onRemove(){}
    }
    state.mapPickOverlay=new PickProjection();state.mapPickOverlay.setMap(state.map);
  }
  positionMapPick();
}
async function handleMainMapClick(event) {
  event.stop?.();
  const request = ++mainMapPickRequest;
  const tripId = state.trip.id;
  state.mapPickedPlace = null;
  if(state.pickMarker){state.pickMarker.map=null;state.pickMarker=null;}
  $('#mapPickCard').hidden = false;
  anchorMapPick(event);
  $('#mapPickName').textContent = '장소 확인 중…';
  $('#mapPickAddress').textContent = '';
  $('#mapPickInfo').textContent = '';
  $('#addMapPlace').disabled = true;
  try {
    const place = await placeFromMapEvent(event);
    if (request !== mainMapPickRequest || tripId !== state.trip.id || !place) return;
    state.mapPickedPlace = place;
    state.mapPickPosition = place.location;
    positionMapPick();
    $('#mapPickName').textContent = place.displayName || '선택한 위치';
    $('#mapPickAddress').textContent = place.formattedAddress || '';
    $('#addMapPlace').disabled = false;
    window.PlaceInfo?.preview(place,$('#mapPickInfo')).then(()=>{if(request===mainMapPickRequest)positionMapPick();});
    requestAnimationFrame(positionMapPick);
    const {AdvancedMarkerElement}=await google.maps.importLibrary('marker');
    if(request!==mainMapPickRequest)return;
    if(state.pickMarker)state.pickMarker.map=null;
    const dot=document.createElement('div');dot.className='picked-location-dot';
    dot.innerHTML='<span class="captain-radar"><i></i><i></i></span><b></b>';
    state.pickMarker=new AdvancedMarkerElement({map:state.map,position:place.location,content:dot,title:'선택한 위치',zIndex:230});
  } catch (error) {
    if (request === mainMapPickRequest) { $('#mapPickCard').hidden = true; showToast(error.message || '장소를 확인하지 못했습니다.'); }
  }
}
$('#dismissMapPick').addEventListener('click', dismissMapPick);
$('#placeMore').addEventListener('click',()=>{
 const item=state.mapSearchItem?.id===state.previewItemId?state.mapSearchItem:state.items.find(i=>i.id===state.previewItemId);
 if(item)window.PlaceInfo?.open(()=>getPlaceDetails(item));
});
window.addEventListener('resize',positionMapPick);
function dismissMapPick() {
  mainMapPickRequest++; state.mapPickedPlace = null; state.mapPickPosition=null; $('#mapPickCard').hidden = true; state.pickMarker && (state.pickMarker.map=null);
}
$('#addMapPlace').addEventListener('click', () => {
  const place = state.mapPickedPlace;
  if (!place) return;
  openSchedule();
  if ($('#scheduleDialog').open) { selectGooglePlace(place); dismissMapPick(); }
});

function openNamedDialog(id) {
  if (id === "settlementDialog") renderReceipt();
  if (id === "inviteDialog") renderMembers();
  document.getElementById(id).showModal();
}
$$("[data-open-dialog]").forEach(button => button.addEventListener("click", () => openNamedDialog(button.dataset.openDialog)));
$$(".dialog-close, .dialog-close-text").forEach(button => button.addEventListener("click", event => {event.preventDefault();event.stopPropagation();button.closest("dialog").close();}));
$$("dialog").forEach(dialog => dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const box = dialog.getBoundingClientRect();
  if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
}));
$("#addScheduleButton").addEventListener("click", () => openSchedule());
$('#mobileAddScheduleButton').addEventListener('click',()=>openSchedule());
$('#scheduleDate').addEventListener('change',()=>{if(validateScheduleDate())$('#formError').textContent='';});
$$('[data-trip-panel]').forEach(button=>button.addEventListener('click',()=>showTripManagerPanel(button.dataset.tripPanel)));
$("#deleteScheduleButton").addEventListener("click", deleteSchedule);
$("#scheduleForm").addEventListener("submit", saveSchedule);
$("#tripSelect").addEventListener("change", event => switchTrip(event.target.value).catch(error => showToast(error.message)));
$("#manageTripsButton").addEventListener("click", () => openTripManager());
$("#newTripButton").addEventListener("click", () => resetTripForm());
$("#tripForm").addEventListener("submit", saveTrip);
$("#manualSaveButton").addEventListener("click",manualSave);
$$('input[type="date"]').forEach(input=>input.addEventListener('click',()=>{
  if(!input.disabled && !input.readOnly)try{input.showPicker?.();}catch{/* Native input remains usable in browsers without showPicker. */}
}));
$("#deleteTripButton").addEventListener("click", deleteTrip);
$("#splitType").addEventListener("change", event => { if (event.target.value === "custom") renderRatioFields(); toggleSettlement($("#settlementEnabled").checked); });
$("#toggleEndTime").addEventListener("change", event => toggleEndTime(event.target.checked));
let placeSearchTimer;
$("#placeSearchInput").addEventListener("input", event => {
  clearTimeout(placeSearchTimer);
  state.placeResolveRequest++; state.editorMapRequest++; state.pendingPlace = null;
  clearEditorMarkers();
  $("#mapsUrlInput").value = "";
  $("#clearPlaceButton").hidden = !event.target.value;
  placeSearchTimer = setTimeout(() => searchGooglePlaces(event.target.value), 350);
});
$("#clearPlaceButton").addEventListener("click", () => clearPlaceSelection());
$("#scheduleForm").elements.name.addEventListener("input", event => { event.target.dataset.autoFilled = "false"; });
$("#addCategory").addEventListener("click", addCategory);
$("#newCategory").addEventListener("keydown", event => { if (event.key === "Enter") { event.preventDefault(); addCategory(); } });
let dayTransitionToken=0;
function selectDay(date){
  dayTransitionToken++;state.dayTransitionBusy=false;$('#dayTransition').hidden=true;
  clearMapSearchPlace();dismissMapPick();state.activeDate=date;state.selectedId=null;state.mobileExpandedId=null;
  const clock=clockParts();state.clockTrip=state.trip.id;state.clockSelectionKey=state.trip.id+'|'+clock.date+' '+clock.time;
  state.fitDayRequested=state.trip.id+':'+date;render();
}
async function navigateStop(direction){
  if(state.dayTransitionBusy)return;
  const items=activeItems(),index=items.findIndex(i=>i.id===state.selectedId),next=index+direction;
  if(index<0&&items.length){selectStop((direction>0?items[0]:items.at(-1)).id,true);return;}
  if(next>=0&&next<items.length){selectStop(items[next].id,true);return;}
  const date=new Date(state.activeDate+'T12:00:00');date.setDate(date.getDate()+direction);
  const target=[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
  if(target<state.trip.start_date||target>state.trip.end_date)return;
  const token=++dayTransitionToken,tripId=state.trip.id,origin=state.activeDate,overlay=$('#dayTransition');
  state.dayTransitionBusy=true;$('#previousStop').disabled=true;$('#nextStop').disabled=true;
  overlay.innerHTML=`<img src="./assets/captain/guide-flag.webp" alt=""><span>${direction>0?'다음날':'하루 전'}</span>`;overlay.hidden=false;
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  try{
    if(!reduced)await sleep(450);
    if(token!==dayTransitionToken||state.trip.id!==tripId||state.activeDate!==origin)return;
    clearMapSearchPlace();dismissMapPick();state.activeDate=target;state.mobileExpandedId=null;
    const clock=clockParts();state.clockTrip=tripId;state.clockSelectionKey=tripId+'|'+clock.date+' '+clock.time;
    const day=activeItems();state.selectedId=(direction>0?day[0]:day.at(-1))?.id||null;render();
    if(!reduced)await sleep(300);
  }finally{if(token===dayTransitionToken){overlay.hidden=true;state.dayTransitionBusy=false;updatePlaceCard(state.mapSearchItem||selectedItem());}}
}
$('#previousStop').addEventListener('click',()=>navigateStop(-1));
$('#nextStop').addEventListener('click',()=>navigateStop(1));
$("#imageDialog .image-close").addEventListener("click", () => $("#imageDialog").close());
$("#copyInvite").addEventListener("click", copyInvite);
$("#googleSignIn").addEventListener("click", signInWithGoogle);
$("#signOutButton").addEventListener("click", signOut);

$("#settlementEnabled").addEventListener("change",event=>toggleSettlement(event.target.checked));
$("#openMemo").addEventListener("click",()=>{$("#memoEditor").value=$("#savedMemo").value;$("#memoDialog").showModal();});
$("#saveMemo").addEventListener("click",()=>{$("#savedMemo").value=$("#memoEditor").value.trim();$("#memoSummary").textContent=$("#savedMemo").value || "＋ 세부 메모 추가";$("#memoDialog").close();});
$("#categoryDropdown").addEventListener("click",()=>{const open=$("#categoryMenu").hidden;$("#categoryMenu").hidden=!open;$("#categoryDropdown").setAttribute("aria-expanded",String(open));});
$("#openCategoryManager").addEventListener("click",()=>{closeCategoryMenu();$("#categoryDialog").showModal();});
$("#openAttendees").addEventListener("click",openAttendees);
$("#attendEveryone").addEventListener("change",event=>{if(event.target.checked)$$("input",$("#attendeeOptions")).forEach(input=>{input.checked=true;});});
$("#saveAttendees").addEventListener("click",()=>{const selected=$$("input:checked",$("#attendeeOptions")).map(input=>input.value);if(!selected.length){$("#attendeeError").textContent="한 명 이상 선택해 주세요.";return;}state.participantIds=$("#attendEveryone").checked?null:selected;renderAttendeeSummary();renderRatioFields();toggleSettlement($("#settlementEnabled").checked);$("#attendeeDialog").close();});
$("#addTraveler").addEventListener("click",()=>{if(state.draftTravelers.length>=100)return showToast("최대 100명까지 추가할 수 있습니다.");state.draftTravelers.push({id:newLocalId(),nickname:"",avatar:`female-${String(state.draftTravelers.length%200+1).padStart(3,'0')}`});renderDraftTravelers();});
$$('[data-avatar-group]').forEach(button=>button.addEventListener('click',()=>{state.avatarGroup=button.dataset.avatarGroup;state.avatarPage=0;renderAvatarGrid();}));
$("#avatarPrevious").addEventListener("click",()=>{state.avatarPage=Math.max(0,state.avatarPage-1);renderAvatarGrid();});
$("#avatarNext").addEventListener("click",()=>{state.avatarPage=Math.min(8,state.avatarPage+1);renderAvatarGrid();});
$("#placeSearchInput").addEventListener("keydown",event=>{if(event.key==='Enter'){event.preventDefault();clearTimeout(placeSearchTimer);searchGooglePlaces(event.target.value);}if(event.key==='Escape'){$("#placeSearchResults").hidden=true;event.stopPropagation();}});
$("#scheduleDialog").addEventListener("close",()=>{state.placeResolveRequest++;state.editorMapRequest++;clearTimeout(placeSearchTimer);clearEditorMarkers();closeCategoryMenu();});
$("#scheduleDialog").addEventListener("click",event=>{if(!event.target.closest('.category-picker'))closeCategoryMenu();});
bindGuestUI();
renderCategories();
render();
Promise.allSettled([initMap(), initializeAuth()]);
setTimeout(scrollToCurrentScheduleOnMobile, 500);
setInterval(updateAutoSaveStatus, 60000);
setInterval(tickTripClock, 15000);

// Use the actual visible height as Safari bars and the keyboard change size.
function syncVisibleViewport(){
  const viewport=window.visualViewport;
  if(viewport && viewport.scale!==1)return;
  document.documentElement.style.setProperty('--visible-height',`${viewport?.height || window.innerHeight}px`);
}
window.visualViewport?.addEventListener('resize',syncVisibleViewport);
window.addEventListener('resize',syncVisibleViewport);
syncVisibleViewport();
