import {readFile,realpath} from 'node:fs/promises';
import {join,relative,isAbsolute} from 'node:path';
import {registerApiRoute} from '@mastra/core/server';
import {WorkspaceStore} from './store.js';

const types: Record<string,string> = {'email.html':'text/html; charset=utf-8','proposal.html':'text/html; charset=utf-8','proposal.pdf':'application/pdf','design.json':'application/json','proposal.json':'application/json','email.txt':'text/plain; charset=utf-8'};
export function previewLinks(directory:string) {
 const parts=directory.split(/[\\/]/);
 const origin=process.env.PROPOSAL_PREVIEW_ORIGIN ?? 'http://localhost:4111';
 return Object.fromEntries(Object.keys(types).map(file=>[file,`${origin}/proposal-previews/${parts.at(-2)}/${parts.at(-1)}/${file}`]));
}
/** Single-owner loopback server. Never expose the workspace or arbitrary filesystem paths. */
export function previewRoutes(store:WorkspaceStore) {
 return [registerApiRoute('/proposal-previews/:session/:proposal/:file', {method:'GET',handler:async c=>{
  const {session,proposal,file}=c.req.param();
  if(!/^[a-f0-9]{64}$/.test(session) || !/^[a-f0-9-]{36}$/.test(proposal) || !Object.hasOwn(types,file)) return c.notFound();
  const workspace=await store.read();
  const artifact=workspace.sessions[session]?.artifacts;
  if(!artifact?.current || artifact.directory!==join(store.root,'previews',session,proposal)) return c.notFound();
  try {
   const path=await realpath(join(artifact.directory,file));
   const root=await realpath(join(store.root,'previews'));
   const within=relative(root,path);
   if(within.startsWith('..') || isAbsolute(within))return c.notFound();
   const bytes=await readFile(path);
   return new Response(bytes,{headers:{'Content-Type':types[file]!, 'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
    'Content-Security-Policy':"sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    ...(file.endsWith('.json')?{'Content-Disposition':`attachment; filename="${file}"`}:{})}});
  }catch(error){if((error as NodeJS.ErrnoException).code==='ENOENT')return c.notFound();throw error;}
 }})];
}
