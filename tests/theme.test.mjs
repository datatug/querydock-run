import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const script = readFileSync('public/theme.js','utf8');
function fixture({stored=null,dark=false,blocked=false}={}) {
 const attributes=new Map(); const classes=new Set(); const handlers={}; const events={}; const storage=[];
 const select={value:'',addEventListener:(name,fn)=>events[name]=fn};
 const root={style:{},getAttribute:k=>attributes.get(k),setAttribute:(k,v)=>attributes.set(k,v),classList:{toggle:(k,on)=>on?classes.add(k):classes.delete(k)}};
 const query={matches:dark,addEventListener:(name,fn)=>handlers[name]=fn};
 runInNewContext(script,{location:{pathname:'/en/graphql/'},window:{matchMedia:()=>query},document:{documentElement:root,addEventListener:(_,fn)=>fn(),getElementById:()=>select},localStorage:{getItem:()=>{if(blocked)throw Error('blocked');return stored;},setItem:(k,v)=>{if(blocked)throw Error('blocked');storage.push([k,v]);}}});
 return {root,select,storage,change:value=>{select.value=value;events.change();},os:value=>{query.matches=value;handlers.change();}};
}
test('landing follows the OS and System reacts to a live change',()=>{const f=fixture({dark:true});assert.equal(f.root.style.colorScheme,'dark');assert.equal(f.select.value,'auto');f.os(false);assert.equal(f.root.style.colorScheme,'light');});
test('explicit preference beats OS and is persisted with the shared key',()=>{const f=fixture({dark:true,stored:'light'});assert.equal(f.root.style.colorScheme,'light');f.change('dark');f.os(false);assert.equal(f.root.style.colorScheme,'dark');assert.deepEqual(f.storage,[['datatug.theme.v1','dark']]);f.change('auto');assert.equal(f.root.style.colorScheme,'light');});
test('invalid or inaccessible storage falls back safely and still permits changes',()=>{for(const options of [{stored:'invalid'}, {blocked:true}]){const f=fixture(options);assert.equal(f.root.style.colorScheme,'light');f.change('dark');f.os(false);assert.equal(f.root.style.colorScheme,'dark');}});
