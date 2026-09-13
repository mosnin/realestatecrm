import {NextRequest,NextResponse} from 'next/server';
import {jwtVerify} from 'jose';
import {createHash} from 'node:crypto';
import {supabase} from '@/lib/supabase';
import {tenantTable} from '@/lib/tenant-db';
import {checkRateLimit,getClientIp} from '@/lib/rate-limit';
export async function POST(req:NextRequest){
 const headers={'Cache-Control':'no-store'};
 if(!(await checkRateLimit(`mcp:revoke:${getClientIp(req)}`,30,60)).allowed)return NextResponse.json({error:'rate_limit_exceeded'},{status:429,headers});
 const body=await req.text();if(body.length>16384)return NextResponse.json({error:'invalid_request'},{status:400,headers});
 const p=new URLSearchParams(body),token=p.get('token'),client=p.get('client_id');
 if(!token||!client||p.getAll('token').length!==1||p.getAll('client_id').length!==1)return NextResponse.json({error:'invalid_request'},{status:400,headers});
 const secret=process.env.MCP_JWT_SECRET;if(!secret)return NextResponse.json({error:'temporarily_unavailable'},{status:503,headers});
 let payload;
 try{payload=(await jwtVerify(token,new TextEncoder().encode(secret),{algorithms:['HS256']})).payload;}catch{return new Response(null,{status:200,headers});}
 if(payload.sub!==client || typeof payload.spaceId!=='string' || typeof payload.exp!=='number')return new Response(null,{status:200,headers});
 const {error}=await tenantTable(supabase,'McpOAuthRevocation',{spaceId:payload.spaceId}).upsert({spaceId:payload.spaceId,clientId:client,tokenHash:createHash('sha256').update(token).digest('hex'),expiresAt:new Date(payload.exp*1000).toISOString()},{onConflict:'tokenHash'});
 if(error)return NextResponse.json({error:'server_error'},{status:500,headers});
 return new Response(null,{status:200,headers});
}
