const test=require('node:test'),assert=require('node:assert'),fs=require('fs'),path=require('path');
const root=path.join(__dirname,'..','frontend');
global.window={};require(path.join(root,'machine-types','catalog.js'));
test('every catalog type has a picture file',()=>{
  const l=window.BelmMachineTypes.list;assert.ok(l.length>=20);
  for(const n of l){const f=window.BelmMachineTypes.imageFor(n);assert.ok(fs.existsSync(path.join(root,f)),n+' -> '+f);}
});
test('unknown type falls back to generic image, case-insensitive match',()=>{
  assert.match(window.BelmMachineTypes.imageFor('reach stacker'),/reach-stacker/);
  assert.match(window.BelmMachineTypes.imageFor('Zzz'),/other-machine/);
});
test('machine form shows preview after choosing type',()=>{
  const m=fs.readFileSync(path.join(root,'customers-manager','manager.js'),'utf8');
  assert.match(m,/updateMachineTypePreview/);
});
