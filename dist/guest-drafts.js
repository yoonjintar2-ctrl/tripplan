/* Durable guest handoff. No anonymous database writes or relaxed RLS. */
(() => {
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
  const itemFields = ['id','trip_id','item_date','start_time','end_time','icon','name','maps_url','place_id','latitude','longitude','category','memo','cost_won','settlement_enabled','participant_ids','split_ratios','sort_order'];
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
  window.GuestDrafts={KEY,Store,transfer,clone};
})();
