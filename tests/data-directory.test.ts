import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,isAbsolute} from 'node:path';
import {dataDirectory} from '../src/assistant/data-directory.js';
test('storage resolution is independent of cwd and requires absolute overrides',()=>{
 const original=process.cwd();const before=dataDirectory();
 try {process.chdir(tmpdir());assert.equal(dataDirectory(),before);assert.ok(isAbsolute(before));}
 finally {process.chdir(original);}
 assert.throws(()=>dataDirectory('./data'),/must be absolute/);
 assert.equal(dataDirectory('/private/tmp/explicit-data'),'/private/tmp/explicit-data');
});
test('existing legacy data is preserved; competing workspaces require explicit selection',async()=>{
 const root=await mkdtemp(join(tmpdir(),'storage-path-'));
 const legacy=join(root,'src/mastra/public/data/agent'),canonical=join(root,'data/agent');
 try {
  assert.equal(dataDirectory('',root),canonical);
  await mkdir(legacy,{recursive:true});await writeFile(join(legacy,'workspace.json'),'unchanged');
  assert.equal(dataDirectory('',root),legacy);
  assert.equal(await readFile(join(legacy,'workspace.json'),'utf8'),'unchanged');
  await mkdir(canonical,{recursive:true});await writeFile(join(canonical,'workspace.json'),'other');
  assert.throws(()=>dataDirectory('',root),/Multiple proposal workspaces/);
  assert.equal(dataDirectory(legacy,root),legacy);
 } finally {await rm(root,{recursive:true,force:true});}
});
