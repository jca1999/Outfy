// Isolated actual routes/helpers with an in-memory PostgREST double.
// No Supabase credentials, network requests to Supabase, SQL or persistent writes.
import assert from "node:assert/strict";
import { test } from "node:test";
import { build } from "esbuild";
import { createRequire } from "node:module";
import Module from "node:module";
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const express = require("express");
globalThis.__notificationWarnings = [];
const compiled = await build({
  stdin: {
    contents: `
      export { default as router } from "./src/routes/notifications";
      export { default as connections } from "./src/routes/connections";
      export { default as activities } from "./src/routes/activities";
      export { createNotification, notifyInvitationResponse } from "./src/lib/notifications";`,
    resolveDir: root,
  },
  bundle: true, platform: "node", format: "cjs", write: false, external: ["express"],
  plugins: [{
    name: "isolate-notification-dependencies",
    setup(bundler) {
      bundler.onLoad({ filter: /\/routes\/auth\.ts$/ }, () => ({
        contents: 'export async function currentSession(req) { const id=req.get("x-test-user"); return id?{user:{id}}:null; }', loader:"js",
      }));
      bundler.onLoad({ filter: /\/lib\/supabase\.ts$/ }, () => ({
        contents: "export function getSupabaseAdmin(){return globalThis.__notificationDb;}", loader:"js",
      }));
      bundler.onLoad({ filter: /\/lib\/logger\.ts$/ }, () => ({
        contents: "export const logger={warn:(...args)=>globalThis.__notificationWarnings.push(args)};", loader:"js",
      }));
      bundler.onLoad({ filter: /\/lib\/push-config\.ts$/ }, () => ({
        contents: "export const getPushConfiguration=()=>null;", loader:"js",
      }));
    },
  }],
});
const mod = new Module(`${root}tests/notifications-isolated.cjs`);
mod.paths = Module._nodeModulePaths(root);
mod._compile(compiled.outputFiles[0].text, `${root}tests/notifications-isolated.cjs`);
const { router, connections, activities, createNotification } = mod.exports;
const A="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const C="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ACT="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
let sequence=0;
const uuid=()=>`00000000-0000-4000-8000-${String(++sequence).padStart(12,"0")}`;
const profile=(id, extra={})=>({
  id, username:id===A?"alice":id===B?"bob":"carla", display_name:"Private name",
  display_name_visibility:"friends", is_profile_private:true, avatar_path:null,
  notify_connections:true, notify_activities:true, notify_messages:true, notify_reminders:true, ...extra,
});
function fakeDb() {
  const tables={
    profiles:[profile(A),profile(B),profile(C)], notifications:[], connections:[],
    activities:[{id:ACT,creator_id:A,title:"Private plan",visibility:"invite_only",status:"active",starts_at:"2099-01-01T00:00:00Z",participation_mode:"unlimited"}],
    activity_members:[], activity_invitations:[],
  };
  const db={tables,fail:{},headErrorWithoutBody:false,rpcResult:"joined",
    storage:{from:()=>({createSignedUrls:async paths=>({data:paths.map(path=>({path,signedUrl:`signed:${path}`})),error:null})})},
    async rpc(_name,args){
      if(db.rpcResult==="joined") tables.activity_members.push({activity_id:args.p_activity_id,user_id:args.p_user_id,role:"participant"});
      return {data:[{result:db.rpcResult,member_count:1,max_participants:null}],error:null};
    },
    from(table) {
      let op="read", values, single=false, count=false, head=false, limit=Infinity;
      const predicates=[], orders=[];
      const q={
        select(_fields,opts={}){count=opts.count==="exact";head=!!opts.head;return q;},
        insert(v){op="insert";values=v;return q;},
        update(v){op="update";values=v;return q;},
        delete(){op="delete";return q;},
        eq(k,v){predicates.push(r=>r[k]===v);return q;},
        is(k,v){predicates.push(r=>(r[k]??null)===v);return q;},
        not(k,op,v){
          predicates.push(r=>op==="is"?(r[k]??null)!==v:op==="in"?!String(v).includes(r[k]):r[k]!==v);
          return q;
        },
        in(k,v){predicates.push(r=>v.includes(r[k]));return q;},
        lte(k,v){predicates.push(r=>r[k]<=v);return q;},
        order(k,opts){orders.push([k,opts?.ascending!==false]);return q;},
        limit(n){limit=n;return q;},
        abortSignal(){return q;},
        maybeSingle(){single=true;return q;},
        single(){single=true;return q;},
        or(text){
          const ids=[...text.matchAll(/(?:requester_id|addressee_id)\.eq\.([0-9a-f-]+)/g)].map(m=>m[1]);
          if(text.startsWith("and(")) predicates.push(r=>ids.slice(0,2).includes(r.requester_id)&&ids.slice(0,2).includes(r.addressee_id));
          else predicates.push(r=>ids.includes(r.requester_id)||ids.includes(r.addressee_id));
          return q;
        },
        then(resolve,reject){
          try {
            if(head && db.headErrorWithoutBody) return Promise.resolve({data:null,count:null,error:null}).then(resolve,reject);
            if(db.fail[table]) return Promise.resolve({data:null,error:{code:db.fail[table]}}).then(resolve,reject);
            if(op==="insert"){
              if(table==="notifications" && values.dedupe_key && tables.notifications.some(r=>r.dedupe_key===values.dedupe_key))
                return Promise.resolve({data:null,error:{code:"23505"}}).then(resolve,reject);
              const row={id:uuid(),created_at:new Date().toISOString(),updated_at:new Date(Date.now()+sequence).toISOString(),read_at:null,status:"pending",...values};
              tables[table].push(row);
              return Promise.resolve({data:single?row:[row],error:null}).then(resolve,reject);
            }
            let rows=tables[table].filter(r=>predicates.every(p=>p(r)));
            for(const [key,asc] of [...orders].reverse()) rows.sort((a,b)=>(a[key]===b[key]?0:a[key]<b[key]?-1:1)*(asc?1:-1));
            rows=rows.slice(0,limit);
            if(op==="update") rows.forEach(r=>Object.assign(r,values,{updated_at:new Date(Date.now()+(++sequence)).toISOString()}));
            if(op==="delete") tables[table]=tables[table].filter(r=>!rows.includes(r));
            return Promise.resolve({data:head?null:single?rows[0]??null:rows,count:count?rows.length:null,error:null}).then(resolve,reject);
          } catch(error){return Promise.reject(error).then(resolve,reject);}
        },
      };
      return q;
    },
  };
  return db;
}
async function harness(run) {
  const db=fakeDb();globalThis.__notificationDb=db;
  const app=express();app.use(express.json());
  app.use((req,_res,next)=>{
    req.log={warn(){},error(...args){
      if(process.env.DEBUG_NOTIFICATIONS_TEST) console.error(...args);
    }};next();
  });
  app.use("/api",router,connections,activities);
  const server=app.listen(0,"127.0.0.1");
  await new Promise(resolve=>server.once("listening",resolve));
  const call=async(user,path,method="GET",body)=>{
    const response=await fetch(`http://127.0.0.1:${server.address().port}/api${path}`,{
      method,headers:{"Content-Type":"application/json",...(user?{"x-test-user":user}:{})},
      ...(body?{body:JSON.stringify(body)}:{}),
    });
    return {status:response.status,body:await response.json(),headers:response.headers};
  };
  try{await run(db,call);}finally{await new Promise(resolve=>server.close(resolve));}
}
const notification=(recipientId,extra={})=>({
  id:uuid(),recipient_id:recipientId,actor_id:null,activity_id:null,type:"connection_request",
  metadata:{},read_at:null,created_at:"2020-01-01T00:00:00.000Z",...extra,
});

test("notification endpoints authenticate, isolate owners, order/limit, exact counts and idempotent read",()=>harness(async(db,call)=>{
  for(const [path,method] of [["/notifications","GET"],["/notifications/unread-count","GET"],["/notifications/read-all","POST"],[`/notifications/${uuid()}/read`,"POST"]])
    assert.equal((await call(null,path,method)).status,401);
  const foreign=notification(B);db.tables.notifications.push(foreign);
  for(let i=0;i<60;i++)db.tables.notifications.push(notification(A,{created_at:new Date(Date.UTC(2020,0,1,i)).toISOString()}));
  const list=await call(A,`/notifications?recipientId=${B}`);
  assert.equal(list.status,200);assert.equal(list.body.notifications.length,50);
  assert.match(list.headers.get("cache-control"),/no-store/);
  assert.ok(!list.body.notifications.some(n=>n.id===foreign.id));
  assert.ok(list.body.notifications[0].createdAt>list.body.notifications[49].createdAt);
  assert.equal((await call(A,"/notifications/unread-count")).body.count,60);
  assert.equal((await call(A,`/notifications/${foreign.id}/read`,"POST")).status,404);
  assert.equal(foreign.read_at,null);
  assert.equal((await call(A,"/notifications/invalid/read","POST")).status,400);
  const id=list.body.notifications[0].id;
  const read=await call(A,`/notifications/${id}/read`,"POST",{recipientId:B});
  assert.equal(read.status,200);
  assert.equal((await call(A,`/notifications/${id}/read`,"POST")).body.readAt,read.body.readAt);
  assert.equal((await call(A,"/notifications/unread-count")).body.count,59);
  assert.equal((await call(A,"/notifications/read-all","POST")).status,200);
  assert.equal((await call(A,"/notifications/unread-count")).body.count,0);
  assert.equal(foreign.read_at,null);
  db.fail.notifications="42P01";
  assert.equal((await call(A,"/notifications")).body.code,"notifications_migration_required");
  db.headErrorWithoutBody=true;
  assert.equal((await call(A,"/notifications/unread-count")).status,503);
}));

test("notification helper respects all existing preferences, deduplicates and never throws delivery failures",()=>harness(async(db)=>{
  const input={recipientId:B,actorId:A,type:"connection_request",dedupeKey:"request:1"};
  await Promise.all([createNotification(input),createNotification(input)]);
  assert.equal(db.tables.notifications.length,1);
  for(const [type,pref] of [["connection_accepted","notify_connections"],["activity_invitation","notify_activities"],["activity_invitation_accepted","notify_activities"],["activity_invitation_declined","notify_activities"],["activity_reminder","notify_reminders"],["chat_message","notify_messages"]]){
    db.tables.profiles[1][pref]=false;
    await createNotification({...input,type,dedupeKey:type});
    assert.equal(db.tables.notifications.length,1);
    db.tables.profiles[1][pref]=true;
  }
  await createNotification({...input,actorId:B,dedupeKey:"self"});
  await createNotification({...input,dedupeKey:"x".repeat(201)});
  await createNotification({...input,metadata:[]});
  assert.equal(db.tables.notifications.length,1);
  const before=globalThis.__notificationWarnings.length;
  db.fail.notifications="42P01";
  await assert.doesNotReject(()=>createNotification({...input,dedupeKey:"failure"}));
  assert.equal(globalThis.__notificationWarnings.length,before+1);
}));

test("presenter rechecks names, activity permissions and deleted references; metadata cannot leak snapshots",()=>harness(async(db,call)=>{
  db.tables.notifications.push(notification(A,{
    actor_id:B,activity_id:ACT,metadata:{secret:"leak",displayName:"Hidden",title:"Hidden",invitationId:uuid()},
  }));
  // A is organizer, but B's friends-only name is hidden until friendship accepted.
  let item=(await call(A,"/notifications")).body.notifications[0];
  assert.equal(item.actor.displayName,null);assert.equal(item.activity.title,"Private plan");
  assert.deepEqual(Object.keys(item.metadata),["invitationId"]);
  db.tables.activities[0].creator_id=C;
  item=(await call(A,"/notifications")).body.notifications[0];
  assert.equal(item.activity,null);
  db.tables.activity_invitations.push({id:uuid(),activity_id:ACT,invitee_id:A,status:"pending"});
  assert.equal((await call(A,"/notifications")).body.notifications[0].activity.title,"Private plan");
  db.tables.activity_invitations[0].status="declined";
  assert.equal((await call(A,"/notifications")).body.notifications[0].activity,null);
  db.tables.connections.push({id:uuid(),requester_id:A,addressee_id:B,status:"accepted"});
  assert.equal((await call(A,"/notifications")).body.notifications[0].actor.displayName,"Private name");
  db.tables.connections=[];
  assert.equal((await call(A,"/notifications")).body.notifications[0].actor.displayName,null);
  db.tables.activities[0].visibility="friends";
  assert.equal((await call(A,"/notifications")).body.notifications[0].activity,null);
  db.tables.activity_members.push({activity_id:ACT,user_id:A});
  assert.equal((await call(A,"/notifications")).body.notifications[0].activity.title,"Private plan");
  db.tables.profiles=db.tables.profiles.filter(p=>p.id!==B);db.tables.activities=[];
  item=(await call(A,"/notifications")).body.notifications[0];
  assert.equal(item.actor,null);assert.equal(item.activity,null);
}));

test("friend events emit exactly once after success, obey preferences and survive failed notification delivery",()=>harness(async(db,call)=>{
  const sent=await call(A,"/connections/requests","POST",{targetUserId:B});
  assert.equal(sent.status,201);
  assert.equal(db.tables.notifications[0].recipient_id,B);
  assert.equal(db.tables.notifications[0].actor_id,A);
  await call(A,"/connections/requests","POST",{targetUserId:B});
  assert.equal(db.tables.notifications.length,1);
  await call(B,`/connections/${sent.body.relationship.id}/accept`,"POST");
  assert.equal(db.tables.notifications.length,2);
  assert.equal(db.tables.notifications[1].type,"connection_accepted");
  assert.equal(db.tables.notifications[1].recipient_id,A);
  await call(B,`/connections/${sent.body.relationship.id}/accept`,"POST");
  assert.equal(db.tables.notifications.length,2);
  db.tables.profiles[2].notify_connections=false;
  assert.equal((await call(A,"/connections/requests","POST",{targetUserId:C})).status,201);
  assert.equal(db.tables.notifications.length,2);
  db.tables.connections=[];db.fail.notifications="42P01";
  assert.equal((await call(A,"/connections/requests","POST",{targetUserId:B})).status,201);
}));

test("private invitation, accept, decline and renewed invitation create correct deduped recipient events",()=>harness(async(db,call)=>{
  for(const id of [B,C])db.tables.connections.push({id:uuid(),requester_id:A,addressee_id:id,status:"accepted"});
  const send=id=>call(A,`/activities/${ACT}/invitations`,"POST",{inviteeId:id});
  const sent=await send(B);assert.equal(sent.status,201);
  const invitationId=sent.body.invitation.id;
  assert.equal(db.tables.notifications[0].type,"activity_invitation");
  assert.equal(db.tables.notifications[0].recipient_id,B);
  await send(B);assert.equal(db.tables.notifications.length,1);
  assert.equal((await call(B,`/activities/invitations/${invitationId}/accept`,"POST")).status,200);
  assert.equal(db.tables.notifications[1].type,"activity_invitation_accepted");
  assert.equal(db.tables.notifications[1].recipient_id,A);
  await call(B,`/activities/invitations/${invitationId}/accept`,"POST");
  assert.equal(db.tables.notifications.length,2);
  const sentC=await send(C);assert.equal(sentC.status,201);
  const cId=sentC.body.invitation.id;
  assert.equal((await call(C,`/activities/invitations/${cId}/decline`,"POST")).status,200);
  assert.equal(db.tables.notifications.at(-1).type,"activity_invitation_declined");
  const count=db.tables.notifications.length;
  await call(C,`/activities/invitations/${cId}/decline`,"POST");
  assert.equal(db.tables.notifications.length,count);
  await send(C);assert.equal(db.tables.notifications.length,count+1);
  await call(C,`/activities/invitations/${cId}/decline`,"POST");
  assert.equal(db.tables.notifications.length,count+2);
  assert.ok(db.tables.notifications.every(n=>n.activity_id===ACT));
  assert.equal(new Set(db.tables.notifications.map(n=>n.dedupe_key)).size,db.tables.notifications.length);
  db.tables.profiles[2].notify_activities=false;
  await send(C);assert.equal(db.tables.notifications.length,count+2);
}));

test("migration restricts table to service_role and contains metadata/dedupe/index protections",async()=>{
  const sql=await readFile(`${root}../../supabase/migrations/20261108164745_notifications.sql`,"utf8");
  for(const pattern of [/enable row level security/i,/from public, anon, authenticated/i,/to service_role/i,
    /jsonb_typeof\(metadata\) = 'object'/,/char_length\(dedupe_key\) <= 200/,/unique index/,/where read_at is null/])
    assert.match(sql,pattern);
  assert.doesNotMatch(sql,/create policy/i);
});

test("frontend API uses authenticated backend routes, propagates errors and rejects false empty/count payloads",async()=>{
  const bundle=await build({
    entryPoints:[`${root}../outfy/src/notifications/notifications-api.ts`],
    bundle:true,platform:"node",format:"cjs",write:false,
  });
  const clientModule=new Module(`${root}tests/notifications-client-isolated.cjs`);
  clientModule._compile(bundle.outputFiles[0].text,`${root}tests/notifications-client-isolated.cjs`);
  const client=clientModule.exports;
  const originalFetch=globalThis.fetch;
  const calls=[];
  let payload={notifications:[]},status=200;
  globalThis.fetch=async(url,options)=>{
    calls.push({url,options});
    return {ok:status===200,status,json:async()=>payload};
  };
  try {
    assert.deepEqual(await client.getNotifications(),{notifications:[]});
    payload={count:3};assert.equal((await client.getUnreadCount()).count,3);
    payload={readAt:new Date().toISOString()};
    await client.markNotificationRead(A);await client.markAllNotificationsRead();
    assert.deepEqual(calls.map(c=>c.url),["/api/notifications","/api/notifications/unread-count",`/api/notifications/${A}/read`,"/api/notifications/read-all"]);
    assert.ok(calls.every(c=>c.options.credentials==="include"));
    assert.ok(calls.slice(2).every(c=>c.options.method==="POST"));
    payload=null;await assert.rejects(()=>client.getUnreadCount(),e=>e.code==="invalid_notification_response");
    payload={notifications:[{id:A}]};await assert.rejects(()=>client.getNotifications());
    status=503;payload={error:"Unavailable",code:"notifications_migration_required"};
    await assert.rejects(()=>client.markNotificationRead(A),e=>e.status===503);
  } finally {globalThis.fetch=originalFetch;}
});

test("notification UI translations have ES/EN leaf-key parity and interpolate safe event names/titles",async()=>{
  const load=async lang=>JSON.parse(await readFile(`${root}../outfy/src/i18n/locales/${lang}/common.json`,"utf8")).notifications;
  const [es,en]=await Promise.all([load("es"),load("en")]);
  function leaves(value,prefix=""){
    return Object.entries(value).flatMap(([key,v])=>typeof v==="string"?[prefix+key]:leaves(v,`${prefix}${key}.`)).sort();
  }
  assert.deepEqual(leaves(es),leaves(en));
  for(const resource of [es,en]) for(const type of [
    "connection_request","connection_accepted","activity_invitation","activity_invitation_accepted","activity_invitation_declined",
  ]){
    assert.ok(resource.types[type]);
    assert.match(resource.types[type].actor,/\{\{name\}\}/);
    if(type.startsWith("activity_"))assert.match(resource.types[type].actorActivity,/\{\{title\}\}/);
  }
});
