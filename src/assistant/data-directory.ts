import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,resolve,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';

/** Locate the project from module ancestry, including bundled .mastra/output. */
export function projectDirectory(from=dirname(fileURLToPath(import.meta.url))):string {
 let directory=resolve(from);
 while(true) {
  const manifest=join(directory,'package.json');
  if(existsSync(manifest) && JSON.parse(readFileSync(manifest,'utf8')).name==='sales-proposal-agent' && existsSync(join(directory,'fixtures')))return directory;
  const parent=dirname(directory);
  if(parent===directory)throw new Error('Cannot locate project data directory. Set absolute PROPOSAL_DATA_DIR.');
  directory=parent;
 }
}
export function dataDirectory(configured=process.env.PROPOSAL_DATA_DIR,project?:string):string {
 if(configured) {
  if(!isAbsolute(configured))throw new Error('PROPOSAL_DATA_DIR must be absolute; relative paths can split conversation history.');
  return resolve(configured);
 }
 const root=project ?? projectDirectory();
 const canonical=join(root,'data/agent');
 const legacy=join(root,'src/mastra/public/data/agent');
 const populated=[canonical,legacy].filter(path=>existsSync(join(path,'workspace.json')));
 if(populated.length>1)throw new Error('Multiple proposal workspaces exist. Set absolute PROPOSAL_DATA_DIR to the intended existing directory; no data was moved or merged.');
 // Preserve historical artifact paths and SQLite journals. No live database migration.
 return populated[0] ?? canonical;
}
