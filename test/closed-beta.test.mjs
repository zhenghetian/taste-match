import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CONTENT_LIBRARY, QUESTION_BANK } from "../content-library.mjs";

const PORT = 4197;
const BASE = `http://127.0.0.1:${PORT}`;
const dataDir = mkdtempSync(join(tmpdir(), "anhao-test-"));
let server;

async function waitForServer() {
  for (let i=0; i<50; i+=1) {
    try { if ((await fetch(`${BASE}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve,100));
  }
  throw new Error("test server did not start");
}

async function request(path, { token, method="GET", body, headers={} } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type":"application/json", ...(token ? { authorization:`Bearer ${token}` } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined
  });
  const payload = await response.json();
  assert.equal(response.ok,true,`${method} ${path}: ${JSON.stringify(payload)}`);
  return payload;
}

test.before(async () => {
  server = spawn(process.execPath,["server.mjs"],{ cwd:new URL("..",import.meta.url), env:{...process.env,PORT:String(PORT),DATA_DIR:dataDir,NODE_ENV:"production",BETA_TEST_CODE:"123456",SMS_WEBHOOK_URL:"",ADMIN_KEY:"test-admin",DEMO_MATCHING_ENABLED:"true",ANHAO_LLM_ENABLED:"false",MODERATION_WEBHOOK_URL:""}, stdio:["ignore","pipe","pipe"] });
  await waitForServer();
});

test.after(() => {
  server?.kill("SIGTERM");
  rmSync(dataDir,{recursive:true,force:true});
});

test("content library has complete playable assets and varied prompts", () => {
  assert.equal(CONTENT_LIBRARY.length,24);
  assert.equal(new Set(CONTENT_LIBRARY.map((item)=>item.id)).size,CONTENT_LIBRARY.length);
  assert.ok(new Set(CONTENT_LIBRARY.map((item)=>item.kind)).size>=12);
  assert.ok(QUESTION_BANK.length>=8);
  for (const item of CONTENT_LIBRARY) {
    assert.ok(existsSync(new URL(`../assets/taste-videos/${item.video}`,import.meta.url)),`missing video ${item.video}`);
    assert.ok(existsSync(new URL(`../assets/taste-covers/${item.cover}`,import.meta.url)),`missing cover ${item.cover}`);
  }
});

test("static serving exposes only public pages, scripts and assets", async () => {
  for (const path of ["/", "/signal-mvp.html", "/index.html", "/admin.html", "/echo-prototype.html", "/ia-prototype.html", "/app.js", "/content-library.mjs", "/styles.css", "/sw.js", "/manifest.webmanifest", "/assets/taste-covers/night-walk.jpg"]) {
    const response = await fetch(`${BASE}${path}`);
    assert.equal(response.status,200,path);
    await response.arrayBuffer();
  }
  for (const path of ["/server.mjs", "/.env", "/.env.example", "/.git/config", "/data/anhao.db", "/test/closed-beta.test.mjs", "/llm/icebreaker.mjs", "/harness/runs.json", "/docs/plan.md", "/package.json", "/package-lock.json", "/node_modules/@anthropic-ai/sdk/package.json", "/README.md", "/assets/taste-videos/SOURCES.md", "/assets", "/%2eenv", "/assets/%2e%2e%2fserver.mjs", "/assets/..%5cserver.mjs", "/assets/%252e%252e/server.mjs", "/%ZZ"]) {
    const response = await fetch(`${BASE}${path}`);
    assert.equal(response.status,404,path);
    assert.equal((await response.json()).error.code,"NOT_FOUND",path);
  }
});

async function expectFailure(path, status, code, { token, body } = {}) {
  const response = await fetch(`${BASE}${path}`, {
    method:body ? "POST" : "GET",
    headers:{"content-type":"application/json",...(token ? {authorization:`Bearer ${token}`} : {})},
    body:body ? JSON.stringify(body) : undefined
  });
  assert.equal(response.status,status,path);
  assert.equal((await response.json()).error.code,code,path);
}

test("closed beta flow persists identity, signals, echoes, answers and chat", async () => {
  const providers = await request("/api/auth/providers");
  assert.equal(providers.betaTestMode,true);
  assert.equal(providers.devMode,false);

  const lockedPhone = "13600136000";
  await request("/api/auth/send-code",{method:"POST",body:{phone:lockedPhone}});
  for (let attempt=0; attempt<5; attempt+=1) {
    const response = await fetch(`${BASE}/api/auth/verify`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:lockedPhone,code:"000000",inviteCode:"2026"})});
    assert.equal(response.status,400);
  }
  const locked = await fetch(`${BASE}/api/auth/verify`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:lockedPhone,code:"000000",inviteCode:"2026"})});
  assert.equal(locked.status,429);

  const phone = "13800138000";
  const code = await request("/api/auth/send-code",{method:"POST",body:{phone}});
  assert.equal(code.delivery,"beta");
  assert.equal("devCode" in code,false);

  const login = await request("/api/auth/verify",{method:"POST",body:{phone,code:"123456",inviteCode:"2026"}});
  assert.ok(login.token);
  assert.equal(login.user.profileCompleted,false);

  await expectFailure("/api/ai/status",401,"AUTH_REQUIRED");
  const aiStatus = await request("/api/ai/status",{token:login.token});
  assert.equal(aiStatus.enabled,false);
  assert.equal(aiStatus.consentRequired,true);
  assert.equal(aiStatus.feature,"icebreakers");
  assert.equal(aiStatus.replyDrafts.feature,"reply_drafts");
  assert.equal(aiStatus.replyDrafts.autoSend,false);
  assert.equal(aiStatus.replyDrafts.consentRequired,true);

  const profile = await request("/api/me",{token:login.token,method:"PATCH",body:{nickname:"小河",city:"杭州",birthYear:1998,gender:"不公开",bio:"喜欢散步和没有安排的周末"}});
  assert.equal(profile.user.nickname,"小河");
  assert.equal(profile.user.city,"杭州");

  const me = await request("/api/me",{token:login.token});
  assert.match(me.invite.code,/^AH[A-F0-9]{8}$/);

  const updatedProfile = await request("/api/me",{token:login.token,method:"PATCH",body:{nickname:"小河",city:"苏州",birthYear:1998,gender:"不公开",bio:"喜欢散步和没有安排的周末"}});
  assert.equal(updatedProfile.user.city,"苏州");

  await request("/api/auth/send-code",{method:"POST",body:{phone}});
  const returningLogin = await request("/api/auth/verify",{method:"POST",body:{phone,code:"123456",inviteCode:""}});
  assert.equal(returningLogin.user.id,login.user.id);

  const reviewedProfile = await fetch(`${BASE}/api/me`,{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${login.token}`},body:JSON.stringify({nickname:"小河",city:"苏州",bio:"加我微信 13800138001"})});
  assert.equal(reviewedProfile.status,422);

  const signal = await request("/api/signals",{token:login.token,method:"POST",body:{contentId:"7653500525270670770",creator:"@自信阳光",title:"晚饭后，一个人慢慢走回生活里",cover:"night-walk.jpg",reaction:"我抗拒，但停下了"}});
  assert.equal(signal.traceCount,1);
  assert.ok(signal.echo?.id);

  const repeatedSignal = await request("/api/signals",{token:login.token,method:"POST",body:{contentId:"7653500525270670770",reaction:"我抗拒，但停下了"}});
  assert.equal(repeatedSignal.traceCount,1);
  assert.equal(repeatedSignal.echo.id,signal.echo.id);
  assert.equal(repeatedSignal.updated,true);

  const echoes = await request("/api/echoes",{token:login.token});
  assert.equal(echoes.echoes.length,1);
  assert.equal(echoes.echoes[0].otherAnswered,true);
  assert.equal(echoes.echoes[0].revealed,false);
  const icebreakersPath = `/api/echoes/${signal.echo.id}/icebreakers`;
  await expectFailure(icebreakersPath,401,"AUTH_REQUIRED",{body:{consent:true}});
  await expectFailure(icebreakersPath,403,"ECHO_LOCKED",{token:login.token,body:{consent:true}});
  await expectFailure("/api/echoes/not-an-echo/icebreakers",404,"ECHO_NOT_FOUND",{token:login.token,body:{consent:true}});

  const answered = await request(`/api/echoes/${signal.echo.id}/answer`,{token:login.token,method:"POST",body:{answer:"我会主动问一次发生了什么"}});
  assert.equal(answered.echo.revealed,true);
  assert.equal(answered.echo.other.nickname,"默默");
  for (const consent of [undefined,false,"true",1]) {
    await expectFailure(icebreakersPath,400,"AI_CONSENT_REQUIRED",{token:login.token,body:{consent}});
  }
  const suggested = await request(icebreakersPath,{token:login.token,method:"POST",body:{consent:true,context:{title:"CALLER_CONTEXT_MUST_BE_IGNORED",reaction:"CALLER_CONTEXT_MUST_BE_IGNORED",question:"CALLER_CONTEXT_MUST_BE_IGNORED"}}});
  assert.equal(suggested.source,"fallback");
  assert.equal(suggested.reason,"disabled");
  assert.equal(suggested.suggestions.length,3);
  assert.ok(suggested.suggestions.every((item)=>typeof item === "string" && item.length>0));
  assert.equal(new Set(suggested.suggestions).size,3);
  assert.ok("runId" in suggested);
  assert.equal(JSON.stringify(suggested).includes("CALLER_CONTEXT_MUST_BE_IGNORED"),false);
  const beforeSending = await request(`/api/echoes/${signal.echo.id}/messages`,{token:login.token});
  assert.equal(beforeSending.messages.length,0,"generating suggestions must not send a message");

  const notifications = await request("/api/notifications",{token:login.token});
  assert.ok(notifications.notifications.some((item) => item.type === "reveal"));
  await request("/api/notifications/read",{token:login.token,method:"POST"});
  const readNotifications = await request("/api/notifications",{token:login.token});
  assert.ok(readNotifications.notifications.every((item) => item.readAt));

  const sent = await request(`/api/echoes/${signal.echo.id}/messages`,{token:login.token,method:"POST",body:{body:"我也会担心问出口以后，关系就真的变了。"}});
  assert.equal(sent.message.senderName,"小河");

  const reviewedMessage = await fetch(`${BASE}/api/echoes/${signal.echo.id}/messages`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${login.token}`},body:JSON.stringify({body:"加我微信 13800138001"})});
  assert.equal(reviewedMessage.status,422);

  const messages = await request(`/api/echoes/${signal.echo.id}/messages`,{token:login.token});
  assert.equal(messages.messages.length,1);
  assert.equal(messages.messages[0].body,"我也会担心问出口以后，关系就真的变了。");

  const persistedSignals = await request("/api/signals",{token:login.token});
  assert.equal(persistedSignals.signals[0].reaction,"我抗拒，但停下了");

  const report = await request("/api/users/usr_demo_momo/report",{token:login.token,method:"POST",body:{echoId:signal.echo.id,reason:"其他"}});
  assert.equal(report.report.status,"pending");
  await request("/api/users/usr_demo_momo/block",{token:login.token,method:"POST"});
  const blocks = await request("/api/blocks",{token:login.token});
  assert.equal(blocks.blocks[0].id,"usr_demo_momo");
  const hiddenEchoes = await request("/api/echoes",{token:login.token});
  assert.equal(hiddenEchoes.echoes.length,0);
  const blockedMessage = await fetch(`${BASE}/api/echoes/${signal.echo.id}/messages`,{headers:{authorization:`Bearer ${login.token}`}});
  assert.equal(blockedMessage.status,403);
  await expectFailure(icebreakersPath,403,"USER_BLOCKED",{token:login.token,body:{consent:true}});

  const analytics = await request("/api/admin/analytics?days=7",{headers:{"x-admin-key":"test-admin"}});
  assert.equal(analytics.totals.users,1);
  assert.equal(analytics.totals.pendingReports,1);
  assert.equal(analytics.totals.activeBlocks,1);
  assert.ok(analytics.totals.moderatedContent>=2);
  await request(`/api/admin/reports/${report.report.id}/status`,{method:"POST",headers:{"x-admin-key":"test-admin"},body:{status:"resolved"}});
});

test("two people can bring the same external content and form a real echo", async () => {
  async function register(phone, nickname) {
    await request("/api/auth/send-code",{method:"POST",body:{phone}});
    const login = await request("/api/auth/verify",{method:"POST",body:{phone,code:"123456",inviteCode:"2026"}});
    await request("/api/me",{token:login.token,method:"PATCH",body:{nickname,city:"上海",birthYear:1999,gender:"不公开",bio:"愿意从一句具体的话开始认识人"}});
    return login.token;
  }

  const firstToken = await register("13700137001","小满");
  const secondToken = await register("13700137002","迟迟");
  const shared = {
    sourceUrl:"https://www.example.com/watch?id=quiet-night&utm_source=test",
    title:"那天晚上，我突然不想再逞强",
    reaction:"我停下来不是因为难过，而是第一次承认自己也希望有人问一句累不累。"
  };

  const firstSignal = await request("/api/signals",{token:firstToken,method:"POST",body:shared});
  assert.equal(firstSignal.signal.sourceType,"shared");
  assert.equal(firstSignal.echo,null);

  const secondSignal = await request("/api/signals",{token:secondToken,method:"POST",body:{...shared,reaction:"我总以为自己能消化所有情绪，看到这里才发现并不是。"}});
  assert.ok(secondSignal.echo?.id);
  assert.equal(secondSignal.echo.content.sourceType,"shared");
  assert.equal(secondSignal.echo.content.sourceUrl,"https://www.example.com/watch?id=quiet-night");

  const firstEchoes = await request("/api/echoes",{token:firstToken});
  assert.equal(firstEchoes.echoes.length,1);
  assert.equal(firstEchoes.echoes[0].otherReaction,"我总以为自己能消化所有情绪，看到这里才发现并不是。");
  const foreignPath = `/api/echoes/${secondSignal.echo.id}/icebreakers`;
  await request("/api/auth/send-code",{method:"POST",body:{phone:"13800138000"}});
  const outsider = await request("/api/auth/verify",{method:"POST",body:{phone:"13800138000",code:"123456"}});
  await expectFailure(foreignPath,404,"ECHO_NOT_FOUND",{token:outsider.token,body:{consent:true}});

  await request(`/api/echoes/${secondSignal.echo.id}/answer`,{token:firstToken,method:"POST",body:{answer:"我希望有人先问一句，但不逼我马上说清楚"}});
  const revealed = await request(`/api/echoes/${secondSignal.echo.id}/answer`,{token:secondToken,method:"POST",body:{answer:"我更习惯自己开口，只是需要一点时间"}});
  assert.equal(revealed.echo.revealed,true);
  assert.equal(revealed.echo.other.nickname,"小满");
  const ownSuggestions = await request(foreignPath,{token:firstToken,method:"POST",body:{consent:true}});
  assert.equal(ownSuggestions.source,"fallback");
  assert.equal(ownSuggestions.suggestions.length,3);
  await request(`/api/users/${revealed.echo.other.id}/block`,{token:secondToken,method:"POST"});
  await expectFailure(foreignPath,403,"USER_BLOCKED",{token:firstToken,body:{consent:true}});
  await expectFailure(foreignPath,403,"USER_BLOCKED",{token:secondToken,body:{consent:true}});

  const invalidUrl = await fetch(`${BASE}/api/signals`,{method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${firstToken}`},body:JSON.stringify({sourceUrl:"javascript:alert(1)",title:"不安全链接",reaction:"这是一句完整的感受"})});
  assert.equal(invalidUrl.status,400);
});
