import {beforeEach,afterEach,describe,it,expect,vi} from 'vitest';
import {NextRequest} from 'next/server';
import {createHash} from 'node:crypto';
import {jwtVerify} from 'jose';
const state=vi.hoisted(()=>({code:null as any,key:null as any,revoked:new Map<string,any>(),failRevocation:false}));
vi.mock('@/lib/rate-limit',()=>({checkRateLimit:async()=>({allowed:true}),getClientIp:()=> 'test'}));
vi.mock('@/lib/supabase-guard',()=>({unscoped:(x:any)=>x}));
vi.mock('@/lib/supabase',()=>({supabase:{from:(table:string)=>{
 let operation='read',payload:any,filters:Record<string,any>={};
 const chain:any={select:()=>chain,eq:(k:string,v:any)=>{filters[k]=v;return chain;},gt:(k:string,v:any)=>{filters['gt:'+k]=v;return chain;},delete:()=>{operation='delete';return chain;},update:()=>chain,upsert:(v:any)=>{operation='upsert';payload=v;return chain;}};
 function result(){
  if(table==='McpAuthCode'){
   const row=state.code;
   if(!row||Object.entries(filters).some(([k,v])=>k.startsWith('gt:')?row[k.slice(3)]<=v:row[k]!==v))return {data:null,error:null};
   if(operation==='delete')state.code=null;
   return {data:{...row},error:null};
  }
  if(table==='McpApiKey')return {data:state.key?.clientId===filters.clientId?state.key:null,error:null};
  if(table==='McpOAuthRevocation'){
   if(state.failRevocation)return {data:null,error:{message:'unavailable'}};
   if(operation==='upsert'){state.revoked.set(payload.tokenHash,payload);return {data:null,error:null};}
   return {data:state.revoked.get(filters.tokenHash)||null,error:null};
  }
  throw new Error('Unexpected table '+table);
 }
 chain.maybeSingle=async()=>result();chain.then=(resolve:any)=>Promise.resolve(result()).then(resolve);return chain;
}}}));
import {POST as exchange} from '@/app/api/mcp/oauth/token/route';
import {POST as revoke} from '@/app/api/mcp/oauth/revoke/route';
import {authenticateKey} from '@/lib/mcp/authenticate';
const verifier='a'.repeat(43),secret='test-secret-that-is-not-a-production-credential';
function request(p:Record<string,string>={}){return new NextRequest('https://www.usechippi.com/api/mcp/oauth/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'authorization_code',client_id:'client',code:'chippi_ac_'+'f'.repeat(64),code_verifier:verifier,redirect_uri:'http://127.0.0.1:49152/oauth/callback',...p})});}
beforeEach(()=>{
 vi.stubEnv('MCP_JWT_SECRET',secret);state.revoked.clear();state.failRevocation=false;
 state.key={clientId:'client',spaceId:'team',expiresAt:null};
 state.code={code:createHash('sha256').update('chippi_ac_'+'f'.repeat(64)).digest('hex'),clientId:'client',spaceId:'team',codeChallenge:createHash('sha256').update(verifier).digest('base64url'),codeChallengeMethod:'S256',redirectUri:'http://127.0.0.1:49152/oauth/callback',expiresAt:new Date(Date.now()+300000).toISOString()};
});
afterEach(()=>vi.unstubAllEnvs());
describe('Chippi native OAuth',()=>{
 it('only one concurrent redemption returns a token for the whole team',async()=>{
  const responses=await Promise.all([exchange(request()),exchange(request())]);expect(responses.map(r=>r.status).sort()).toEqual([200,400]);
  const body=await responses.find(r=>r.status===200)!.json();const {payload}=await jwtVerify(body.access_token,new TextEncoder().encode(secret));expect(payload.spaceId).toBe('team');expect(payload.sub).toBe('client');expect(body.scope).toBe('crm:read');expect(state.code).toBeNull();
 });
 it.each<Record<string,string>>([{client_id:'other'},{redirect_uri:'http://127.0.0.1:49152/other'},{redirect_uri:''},{code_verifier:'b'.repeat(43)}])('binds code parameters without consuming a mismatched request: %j',async(p)=>{
  expect((await exchange(request(p))).status).toBe(400);expect(state.code).not.toBeNull();
 });
 it('rejects expiry and revoked parent connections',async()=>{
  state.code.expiresAt=new Date(Date.now()-1).toISOString();expect((await exchange(request())).status).toBe(400);
  state.code.expiresAt=new Date(Date.now()+300000).toISOString();state.key=null;expect((await exchange(request())).status).toBe(400);
 });
 it('MCP rechecks the connection and individual token revocation',async()=>{
  const token=(await (await exchange(request())).json()).access_token;
  const mcp=()=>new NextRequest('https://www.usechippi.com/api/mcp',{headers:{authorization:'Bearer '+token}});
  expect((await authenticateKey(mcp()))?.spaceId).toBe('team');
  const revoked=await revoke(new NextRequest('https://www.usechippi.com/api/mcp/oauth/revoke',{method:'POST',body:new URLSearchParams({token,client_id:'client'})}));expect(revoked.status).toBe(200);expect(await authenticateKey(mcp())).toBeNull();expect(state.key).not.toBeNull();
  state.revoked.clear();state.key=null;expect(await authenticateKey(mcp())).toBeNull();
 });
 it('missing revocation storage fails closed and does not pretend logout succeeded',async()=>{
  const token=(await (await exchange(request())).json()).access_token;state.failRevocation=true;
  const response=await revoke(new NextRequest('https://www.usechippi.com/api/mcp/oauth/revoke',{method:'POST',body:new URLSearchParams({token,client_id:'client'})}));expect(response.status).toBe(500);
  expect(await authenticateKey(new NextRequest('https://www.usechippi.com/api/mcp',{headers:{authorization:'Bearer '+token}}))).toBeNull();
 });
});
