import test from 'node:test';
import assert from 'node:assert/strict';
import {searchSettings,cleanExperience,islandState,undoSnapshot,undoChange,preferenceDifference} from '../client/experience-model.js';

test('settings search accepts Japanese aliases, multiple words, and bounded results',()=>{
 assert.equal(searchSettings('とけい いろ')[0].label,'時計の色');
 assert.equal(searchSettings('省エネ')[0].selector,'#design-power-controls');
 assert.equal(searchSettings('<script>')[0],undefined);
 assert.deepEqual(searchSettings('   '),[]);
 assert.equal(searchSettings('ｆｏｎｔ')[0].label,'時計のフォント');
});
test('island shows active data with timer priority and expires transient notices',()=>{
 const now=10000,music={name:'曲',artists:'Artist'};
 assert.equal(islandState({music,timers:[{title:'集中',end:15000}],now}).kind,'timer');
 assert.equal(islandState({music,timers:[{title:'終了',end:9000}],now}).kind,'music');
 assert.equal(islandState({music,notice:{message:'保存した',until:12000},now}).kind,'notice');
 assert.equal(islandState({notice:{message:'古い',until:5000},newsCount:3,now}).kind,'news');
 assert.equal(islandState({timers:[{end:12000,_deleted:true}],online:false,now}).detail.startsWith('オフライン'),true);
 assert.deepEqual(cleanExperience({enabled:'yes',music:false,timer:1,news:null}),{enabled:true,music:false,timer:true,news:true});
});
test('undo stores only preferences and does not retain records or references',()=>{
 const original={design:{color:'#abcdef'},background:{kind:'preset'},tasks:[{title:'secret'}],account:{email:'private'}};
 const copy=undoSnapshot(original);original.design.color='#000000';
 assert.equal(copy.design.color,'#abcdef');assert.equal('tasks' in copy,false);assert.equal('account' in copy,false);
 assert.equal(preferenceDifference(copy,{...copy,design:{color:'#111111'}}),true);
 assert.equal(preferenceDifference(copy,structuredClone(copy)),false);
});

test('undo limits restoration to changed fields, preserving later unrelated preferences',()=>{
 const before={design:{color:'#123456'},location:{name:'Tokyo'},favoriteApps:['weather']};
 const after={...before,design:{color:'#654321'}};
 const changed=undoChange(before,after);
 assert.deepEqual(Object.keys(changed),['design']);
 const current={...after,location:{name:'Osaka'},favoriteApps:['news']};
 assert.deepEqual({...current,...changed},{...current,design:before.design});
});
