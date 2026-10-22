import https from 'node:https';
import {lookup} from 'node:dns/promises';
import {isIP} from 'node:net';

export const WEB_LIMIT=2_000_000;
export function publicAddress(address:string):boolean {
 if(isIP(address)===4) {
  const [a=0,b=0,c=0]=address.split('.').map(Number);
  return !(a===0||a===10||a===127||a>=224||a===100&&b>=64&&b<=127||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0||b===88&&c===99)||a===198&&(b===18||b===19||b===51&&c===100)||a===203&&b===0&&c===113);
 }
 // Only ordinary global-unicast IPv6; reject mapped/NAT64/local/multicast and special ranges.
 if(isIP(address)===6) {
  const [first,second]=address.toLowerCase().split(':');
  const special=first==='2001' && (parseInt(second||'0',16)<=0x1ff||parseInt(second||'0',16)===0xdb8);
  return /^2[0-9a-f]{3}:/i.test(address) && first!=='2002' && !special;
 }
 return false;
}
export function publicUrl(input:string):URL {
 const url=new URL(input);
 const host=url.hostname.replace(/^\[|\]$/g,'').toLowerCase();
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!host.includes('.')&&!isIP(host)||/(?:^|\.)(?:localhost|local|internal|lan|home|test|invalid)$/.test(host)||isIP(host)&&!publicAddress(host))throw new Error('Use a public HTTPS URL without credentials or a custom port.');
 url.hash='';return url;
}
export type WebPage={url:string;requestedUrl:string;html:string;retrievedAt:string;partial?:boolean};
export type WebTransport=(url:URL,signal:AbortSignal)=>Promise<{status:number;location?:string;type:string;body:string;partial?:boolean}>;
export async function resolvePublicAddress(host:string,signal:AbortSignal,resolver:(host:string)=>Promise<{address:string;family:number}[]>=host=>lookup(host,{all:true})) {
 signal.throwIfAborted();
 const addresses=await Promise.race([resolver(host),new Promise<never>((_,reject)=>signal.addEventListener('abort',()=>reject(new Error('Website request timed out.')),{once:true}))]);
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Website resolves to a private or reserved address.');
 return addresses[0]!;
}
/** Resolution is validated and pinned in the socket lookup: no DNS check/fetch race. */
const transport:WebTransport=async(url,signal)=>{
 const host=url.hostname.replace(/^\[|\]$/g,'');
 const target=await resolvePublicAddress(host,signal);
 return new Promise((resolve,reject)=>{
  const request=https.request(url,{signal,agent:false,family:target.family,headers:{accept:'text/html,text/plain','accept-encoding':'identity','user-agent':'SalesProposalDiscovery/1.0'},lookup:(_host,_options,callback)=>callback(null,target.address,target.family)},response=>{
   const status=response.statusCode??0;
   if(status>=300&&status<400){response.destroy();resolve({status,location:response.headers.location,type:'',body:''});return;}
   if(response.headers['content-encoding']&&response.headers['content-encoding']!=='identity'){response.destroy();reject(new Error('Compressed website response unsupported.'));return;}
   const chunks:Buffer[]=[];let size=0;
   response.on('data',(chunk:Buffer)=>{if(size+chunk.length>WEB_LIMIT){chunks.push(chunk.subarray(0,WEB_LIMIT-size));resolve({status,type:String(response.headers['content-type']??''),body:Buffer.concat(chunks).toString('utf8'),partial:true});response.destroy();return;}size+=chunk.length;chunks.push(chunk);});
   response.on('error',reject);
   response.on('end',()=>resolve({status,type:String(response.headers['content-type']??''),body:Buffer.concat(chunks).toString('utf8')}));
  });request.on('error',reject);request.end();
 });
};
export async function fetchWebsite(input:string,send:WebTransport=transport,timeoutMs=15_000):Promise<WebPage> {
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),timeoutMs);
 const requested=publicUrl(input);let url=requested;
 try {
  for(let redirects=0;redirects<=3;redirects++) {
   const response=await send(url,controller.signal);
   if(response.status>=300&&response.status<400) {
    if(!response.location||redirects===3)throw new Error('Website redirect limit exceeded or missing target.');
    url=publicUrl(new URL(response.location,url).href);continue;
   }
   if(response.status<200||response.status>=300)throw new Error(`Website returned HTTP ${response.status}.`);
   if(!/^(?:text\/html|text\/plain|application\/xhtml\+xml)(?:;|$)/i.test(response.type))throw new Error('Website must return HTML or plain text.');
   const partial=response.partial||Buffer.byteLength(response.body)>WEB_LIMIT;
   return {requestedUrl:requested.href,url:url.href,html:Buffer.from(response.body).subarray(0,WEB_LIMIT).toString('utf8'),partial:Boolean(partial),retrievedAt:new Date().toISOString()};
  }
  throw new Error('Website redirect limit exceeded.');
 }finally{clearTimeout(timer);controller.abort();}
}
/** Non-executing text projection. No scripts, styles, remote assets or page navigation. */
export function websiteText(html:string):string {
 return html.replace(/<!--[^]*?(?:-->|$)/g,' ').replace(/<(script|style|svg|noscript|template)\b[^<>]*>[^]*?(?:<\/\1\s*>|$)/gi,' ')
  .replace(/<meta\b[^<>]*>/gi,tag=>{const value=tag.match(/\bcontent\s*=\s*(["'])(.*?)\1/i)?.[2];return /(?:og:site_name|name=["']description|property=["']og:description)/i.test(tag)&&value?'\n'+value+'\n':' ';})
  .replace(/<\/?(?:p|div|section|article|li|h[1-6]|br|tr|td|title)\b[^<>]*>/gi,'\n').replace(/<[^<>]*>/g,' ')
  .replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,n:string)=>{const code=n[0]?.toLowerCase()==='x'?parseInt(n.slice(1),16):Number(n);return code>0&&code<=0x10ffff?String.fromCodePoint(code):' ';})
  .replace(/&(amp|lt|gt|quot|apos|nbsp);/g,(_,n:string)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[n]!))
  .split('\n').map(line=>line.replace(/\s+/g,' ').trim()).filter(Boolean).join('\n');
}
