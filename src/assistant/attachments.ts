import {createHash} from 'node:crypto';
/** Only inline bytes delivered by human Studio messages; never dereference URLs. */
export function capturedImages(raw:unknown) {
 const message=raw as {content?:{parts?:unknown[]}|unknown[];parts?:unknown[]};
 const parts=Array.isArray(message.content)?message.content:message.content&&typeof message.content==='object'&&'parts' in message.content?message.content.parts:message.parts;
 return (parts??[]).filter((p:any)=>p?.type==='file'||p?.type==='image').slice(0,3).map((p:any,index)=>{
  const data=p.data??p.image??p.url;
  if(typeof data!=='string'||data.length>1_400_000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(data))return {index,error:'Unsupported attachment: supply an inline PNG/JPEG below 1 MB or confirm its relevant facts in text.'};
  const bytes=Buffer.from(data.split(',')[1]!,'base64');const png=data.startsWith('data:image/png;');
  if(bytes.length>1_000_000||!(png?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):bytes[0]===255&&bytes[1]===216))return {index,error:'Unsupported attachment: invalid image bytes.'};
  return {index,bytes,hash:createHash('sha256').update(bytes).digest('hex'),mime:png?'image/png':'image/jpeg'};
 });
}
