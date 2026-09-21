const {strict:assert}=require('assert');
function client(){
 const db={mt_trips:new Map(),mt_trip_members:new Map(),mt_itinerary_items:new Map()};const api={db,failItems:false,loseTripReply:false,calls:[]};
 api.from=table=>{let action='select',rows,filters=[],single=false;return {
 select(){return this},eq(k,v){filters.push(r=>r[k]===v);return this},in(k,values){filters.push(r=>values.includes(r[k]));return this},maybeSingle(){single=true;return this},single(){single=true;return this},insert(value){action='insert';rows=[value];return this},upsert(value,opts){assert.equal(opts.ignoreDuplicates,true);action='upsert';rows=Array.isArray(value)?value:[value];return this},
 then(resolve,reject){return Promise.resolve().then(()=>{
 api.calls.push({table,action});if(table==='mt_itinerary_items'&&action==='upsert'&&api.failItems)return {error:{message:'offline'}};
 if(action!=='select')for(const row of rows){const key=table==='mt_trip_members'?row.trip_id+row.user_id:row.id;if(db[table].has(key)&&action==='insert')return {error:{code:'23505'}};if(!db[table].has(key))db[table].set(key,JSON.parse(JSON.stringify(row)));}
 if(table==='mt_trips'&&action==='insert'&&api.loseTripReply){api.loseTripReply=false;return {error:{message:'response lost'}};}
 const found=[...db[table].values()].filter(r=>filters.every(f=>f(r)));return {data:single?found[0]||null:found,error:null};
 }).then(resolve,reject)}
 }};return api;
}
module.exports={client};
