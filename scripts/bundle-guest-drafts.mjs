import {readFileSync,writeFileSync} from 'node:fs';
const source=readFileSync(new URL('../dist/guest-drafts.js',import.meta.url),'utf8');
const path=new URL('../dist/app.js',import.meta.url);
const start='// BEGIN BUNDLED GUEST DRAFTS';
const end='// END BUNDLED GUEST DRAFTS';
const bundle=start+'\n'+source.replace('(() => {','const GuestDrafts = (() => {').replace('window.GuestDrafts={KEY,Store,transfer,clone};','return {KEY,Store,transfer,clone};').trim()+'\n'+end;
const app=readFileSync(path,'utf8');
const expected=app.includes(start)?app.slice(0,app.indexOf(start))+bundle+app.slice(app.indexOf(end)+end.length):bundle+'\n\n'+app;
if(process.argv.includes('--check')){
  if(expected!==app)throw new Error('Guest bundle is stale. Run npm run build:guest.');
}else writeFileSync(path,expected);
