import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const html = readFileSync(new URL("../signal-mvp.html", import.meta.url), "utf8");
const handler = html.match(/\$\("#messageForm"\)\.addEventListener\("submit", async \(event\) => \{([\s\S]*?)\n      \}\);/)[1];

test("successful send clears matching cached draft after chat switch without changing new chat", async () => {
  let finish;
  const input = { value: "已经发出的内容" };
  const state = { currentChatId: "chat-a" };
  const drafts = new Map([["chat-a", input.value]]);
  const context = vm.createContext({
    state, chatVersion: 1, chatDrafts: drafts,
    $: () => input,
    apiFetch: () => new Promise((resolve) => { finish = resolve; }),
    refreshChatMessages: () => assert.fail("must not refresh a different chat"),
    handleChatError: () => assert.fail("unexpected failure"),
    event: { preventDefault() {} }
  });
  const sending = vm.runInContext(`(async () => {${handler}\n})()`, context);
  state.currentChatId = "chat-b";
  context.chatVersion = 2;
  input.value = "新聊天中尚未发送的内容";
  finish({ message: { id: "sent-message" } });
  await sending;
  assert.equal(drafts.has("chat-a"), false);
  assert.equal(input.value, "新聊天中尚未发送的内容");
});
