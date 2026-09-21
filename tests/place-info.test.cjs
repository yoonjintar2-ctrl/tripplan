const {JSDOM}=require('jsdom'),fs=require('fs'),assert=require('assert/strict');
const dom=new JSDOM('<body><div id="preview"></div>',{runScripts:'outside-only'}),w=dom.window;
w.HTMLDialogElement.prototype.showModal=function(){this.open=true;};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'));};
w.eval(fs.readFileSync('dist/place-info.js','utf8'));
(async()=>{
 const place={displayName:'카페 <테스트>',formattedAddress:'서울',googleMapsURI:'https://www.google.com/maps/?q=test',rating:4.5,userRatingCount:100,photos:[{getURI:()=> 'https://example.com/photo.jpg',authorAttributions:[{displayName:'사진작가',uri:'https://example.com/author'}]}],reviews:[{text:'좋은 장소',rating:5,authorAttribution:{displayName:'손님'}}],regularOpeningHours:{weekdayDescriptions:['월요일 10–18시']},nationalPhoneNumber:'02-123-4567',websiteURI:'https://example.com'};
 const node=w.document.querySelector('#preview');await w.PlaceInfo.preview(place,node);assert(node.querySelector('img'));assert.match(node.textContent,/좋은 장소/);node.querySelector('button').click();await new Promise(r=>setImmediate(r));assert(w.document.querySelector('dialog').open);assert.match(w.document.querySelector('dialog').textContent,/월요일 10–18시/);assert.equal(w.document.querySelector('dialog h2').textContent,'카페 <테스트>');w.document.querySelector('dialog>header button').click();assert.equal(w.document.querySelector('dialog').open,false);
 let resolve;const pending=w.PlaceInfo.open(()=>new Promise(r=>resolve=r));w.document.querySelector('dialog').close();resolve(place);await pending;assert.equal(w.document.querySelector('dialog').open,false);
 await w.PlaceInfo.preview({displayName:'선택한 위치',formattedAddress:'서울'},node);assert.match(node.textContent,/제공되는 사진이 없습니다/);assert.equal(node.querySelectorAll('img').length,0);
 console.log('PASS: place preview, detail dialog, photos/reviews/credits, escaping, close during loading, and coordinate-only empty state');
})().catch(e=>{console.error(e);process.exitCode=1});
