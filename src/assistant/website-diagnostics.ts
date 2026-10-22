import {createHash} from 'node:crypto';
export const URL_RESOLVER_VERSION='url-ledger-v1-20261021';
/** Temporary opt-in boundary diagnostics. No URLs, user text, credentials or error bodies. */
export function websiteDiagnostic(event:string,details:Record<string,string|number|boolean|undefined>={}){
 if(process.env.PROPOSAL_URL_DIAGNOSTICS==='1')console.warn(JSON.stringify({diagnostic:'proposal-url',version:URL_RESOLVER_VERSION,event,...details}));
}
export function urlFingerprint(input:string){
 return createHash('sha256').update(input).digest('hex').slice(0,16);
}
export function urlFailureCategory(error:unknown){
 const message=error instanceof Error?error.message:'';
 if(/HTTP (\d{3})/.test(message))return `http-${message.match(/HTTP (\d{3})/)![1]}`;
 if(/Ambiguous website/.test(message))return 'ambiguous-reference';
 if(/explicitly supplied/.test(message))return 'not-in-url-ledger';
 if(/public HTTPS|private or reserved/.test(message))return 'security-rejection';
 if(/captured salesperson/.test(message))return 'missing-current-user-source';
 if(/integrity/.test(message))return 'source-integrity';
 if(/ENOTFOUND|EAI_AGAIN|getaddrinfo/.test(message))return 'dns';
 return 'other-tool-error';
}
