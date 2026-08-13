import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
  server = spawn(process.execPath,["server.mjs"],{ cwd:new URL("..",import.meta.url), env:{...process.env,PORT:String(PORT),DATA_DIR:dataDir,DEV_OTP_CODE:"246810",ADMIN_KEY:"test-admin"}, stdio:["ignore","pipe","pipe"] });
  await waitForServer();
});

test.after(() => {
  server?.kill("SIGTERM");
  rmSync(dataDir,{recursive:true,force:true});
});

test("closed beta flow persists identity, signals, echoes, answers and chat", async () => {
  const lockedPhone = "13600136000";
  await request("/api/auth/send-code",{method:"POST",body:{phone:lockedPhone}});
  for (let attempt=0; attempt<5; attempt+=1) {
    const response = await fetch(`${BASE}/api/auth/verify`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:lockedPhone,code:"000000",inviteCode:"ANHAO2026"})});
    assert.equal(response.status,400);
  }
  const locked = await fetch(`${BASE}/api/auth/verify`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({phone:lockedPhone,code:"000000",inviteCode:"ANHAO2026"})});
  assert.equal(locked.status,429);

  const phone = "13800138000";
  const code = await request("/api/auth/send-code",{method:"POST",body:{phone}});
  assert.equal(code.devCode,"246810");

  const login = await request("/api/auth/verify",{method:"POST",body:{phone,code:"246810",inviteCode:"ANHAO2026"}});
  assert.ok(login.token);
  assert.equal(login.user.profileCompleted,false);

  const profile = await request("/api/me",{token:login.token,method:"PATCH",body:{nickname:"小河",city:"杭州",birthYear:1998,gender:"不公开",bio:"喜欢散步和没有安排的周末"}});
  assert.equal(profile.user.nickname,"小河");
  assert.equal(profile.user.city,"杭州");

  const me = await request("/api/me",{token:login.token});
  assert.match(me.invite.code,/^AH[A-F0-9]{8}$/);

  const updatedProfile = await request("/api/me",{token:login.token,method:"PATCH",body:{nickname:"小河",city:"苏州",birthYear:1998,gender:"不公开",bio:"喜欢散步和没有安排的周末"}});
  assert.equal(updatedProfile.user.city,"苏州");

  const reviewedProfile = await fetch(`${BASE}/api/me`,{method:"PATCH",headers:{"content-type":"application/json",authorization:`Bearer ${login.token}`},body:JSON.stringify({nickname:"小河",city:"苏州",bio:"加我微信 13800138001"})});
  assert.equal(reviewedProfile.status,422);

  const signal = await request("/api/signals",{token:login.token,method:"POST",body:{contentId:"7653500525270670770",creator:"@自信阳光",title:"晚饭后，一个人慢慢走回生活里",cover:"night-walk.jpg",reaction:"我抗拒，但停下了"}});
  assert.equal(signal.traceCount,1);
  assert.ok(signal.echo?.id);

  const echoes = await request("/api/echoes",{token:login.token});
  assert.equal(echoes.echoes.length,1);
  assert.equal(echoes.echoes[0].otherAnswered,true);
  assert.equal(echoes.echoes[0].revealed,false);

  const answered = await request(`/api/echoes/${signal.echo.id}/answer`,{token:login.token,method:"POST",body:{answer:"我会主动问一次发生了什么"}});
  assert.equal(answered.echo.revealed,true);
  assert.equal(answered.echo.other.nickname,"默默");

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

  const analytics = await request("/api/admin/analytics?days=7",{headers:{"x-admin-key":"test-admin"}});
  assert.equal(analytics.totals.users,1);
  assert.equal(analytics.totals.pendingReports,1);
  assert.equal(analytics.totals.activeBlocks,1);
  assert.ok(analytics.totals.moderatedContent>=2);
  await request(`/api/admin/reports/${report.report.id}/status`,{method:"POST",headers:{"x-admin-key":"test-admin"},body:{status:"resolved"}});
});
