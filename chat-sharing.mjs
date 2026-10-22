export function initChatSharing({ getContext, apiFetch, afterSend, toast, escapeHtml }) {
  const $ = (selector) => document.querySelector(selector);
  let pending = null;
  let selectionVersion = 0;
  let busy = false;
  const sameChat = (context) => context && getContext()?.key === context.key && getContext()?.version === context.version;
  const stickers = [
    ["收到啦", "👌", "#e2ecdf"], ["笑出声", "😆", "#f5e6bf"], ["慢慢说", "☕", "#e7e3f2"],
    ["抱抱你", "🫂", "#f4dfdf"], ["好耶", "🎉", "#dce9f0"], ["让我想想", "🤔", "#ebe8d9"]
  ];
  const panel = $("#chatSharePanel");
  function setStatus(text) { $("#chatShareStatus").textContent = text; }
  function setBusy(value) {
    busy = value;
    $("#confirmChatShare").disabled = value;
    $("#chatShareActions").inert = value;
    $("#chatShareFields").inert = value;
    $("#confirmChatShare").textContent = value ? "正在发送…" : "确认发送";
  }
  function toggle(open = panel.hidden) {
    panel.hidden = !open;
    $("#openChatShare").setAttribute("aria-expanded", String(open));
  }
  function clearSelection() {
    selectionVersion += 1;
    if (pending?.preview) URL.revokeObjectURL(pending.preview);
    pending = null;
    $("#chatSharePreview").replaceChildren();
    $("#chatShareFields").hidden = true;
    $("#confirmChatShare").hidden = true;
    $("#chatShareFile").value = "";
    setStatus("");
    setBusy(false);
  }
  function reset() {
    clearSelection(); toggle(false);
    $("#chatImageViewer").hidden = true;
    $("#chatImageLarge").removeAttribute("src");
  }
  function selectLink() {
    if (busy || !getContext()) return;
    clearSelection(); toggle(true);
    pending = { kind: "link", context: getContext() };
    $("#chatShareFields").hidden = false;
    $("#chatShareUrl").value = ""; $("#chatShareTitle").value = "";
    $("#confirmChatShare").hidden = false;
    $("#chatShareUrl").focus();
  }
  function validateLink() {
    let link;
    try { link = new URL($("#chatShareUrl").value.trim()); } catch { throw new Error("请输入完整的 http 或 https 链接"); }
    if (!["http:", "https:"].includes(link.protocol) || link.username || link.password) throw new Error("只支持不含账号密码的 http 或 https 链接");
    if (link.href.length > 2000) throw new Error("链接太长，请换一个链接");
    return { url: link.href, title: $("#chatShareTitle").value.trim() || link.hostname };
  }
  function updateLinkPreview() {
    if (pending?.kind !== "link") return;
    const target = $("#chatSharePreview");
    target.replaceChildren();
    try {
      const link = validateLink();
      const card = document.createElement("div"); card.className = "share-link-preview";
      const title = document.createElement("strong"); title.textContent = link.title;
      const host = document.createElement("small"); host.textContent = new URL(link.url).hostname;
      card.append(title, host); target.append(card); setStatus("");
    } catch { /* Incomplete URLs are validated when the user confirms. */ }
  }
  async function selectFile(file, kind = "image") {
    if (!file || busy || !getContext()) return;
    clearSelection(); toggle(true);
    const version = selectionVersion;
    const context = getContext();
    if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type)) return setStatus("请选择 PNG、JPG、GIF 或 WebP 图片");
    if (!file.size || file.size > 3 * 1024 * 1024) return setStatus("图片需小于等于 3 MB，请压缩后重试");
    const preview = URL.createObjectURL(file);
    const image = new Image(); image.src = preview;
    try { await image.decode(); } catch { URL.revokeObjectURL(preview); if (version === selectionVersion) setStatus("图片无法打开，请换一个文件"); return; }
    if (version !== selectionVersion || !sameChat(context)) { URL.revokeObjectURL(preview); return; }
    if (image.naturalWidth > 4096 || image.naturalHeight > 4096 || image.naturalWidth * image.naturalHeight > 16000000) { URL.revokeObjectURL(preview); return setStatus("图片尺寸过大，请缩小后重试"); }
    pending = { kind: file.type === "image/gif" ? "sticker" : kind, file, preview, context };
    image.alt = kind === "sticker" ? "待发送的表情包" : "待发送的图片";
    $("#chatSharePreview").append(image);
    $("#confirmChatShare").hidden = false;
    setStatus(file.type === "image/gif" ? "GIF 表情包 · 确认后发送" : "仅发送给当前会话，对方可点击放大");
  }
  async function selectSticker(index) {
    if (busy || !getContext()) return;
    const context = getContext();
    const [label, emoji, color] = stickers[index];
    const canvas = document.createElement("canvas"); canvas.width = 320; canvas.height = 280;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = color; ctx.fillRect(0, 0, 320, 280);
    ctx.textAlign = "center"; ctx.font = "88px sans-serif"; ctx.fillText(emoji, 160, 135);
    ctx.fillStyle = "#294d40"; ctx.font = "bold 36px sans-serif"; ctx.fillText(label, 160, 220);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (blob && sameChat(context)) await selectFile(new File([blob], `${label}.png`, { type: "image/png" }), "sticker");
  }
  const fileData = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(new Error("读取图片失败，请重新选择"));
    reader.readAsDataURL(file);
  });
  async function send() {
    const selection = pending;
    if (busy || !selection || !sameChat(selection.context)) return;
    let payload;
    try { if (selection.kind === "link") payload = { kind: "link", link: validateLink() }; }
    catch (error) { setStatus(error.message); return; }
    setBusy(true); setStatus("正在发送，请稍候…");
    const version = selectionVersion;
    const context = selection.context;
    try {
      if (!payload) {
        if (!selection.attachment) {
          const data = await fileData(selection.file);
          if (!sameChat(context) || version !== selectionVersion) return;
          const result = await apiFetch(`/api/agent/threads/${context.kind}/${encodeURIComponent(context.id)}/attachments`, {
            method: "POST", body: JSON.stringify({ data, mimeType: selection.file.type, name: selection.file.name })
          });
          selection.attachment = result.attachment;
        }
        if (!sameChat(context) || version !== selectionVersion) return;
        payload = { kind: selection.kind, attachmentId: selection.attachment.id };
      }
      await apiFetch(context.messagesPath, { method: "POST", body: JSON.stringify(payload) });
      if (!sameChat(context) || version !== selectionVersion) return;
      clearSelection(); toggle(false);
      await afterSend(context); toast("已发送");
    } catch (error) {
      if (sameChat(context) && version === selectionVersion) setStatus(`${error.message}；可重试或取消`);
    } finally { if (sameChat(context) && version === selectionVersion) setBusy(false); }
  }
  $("#openChatShare").addEventListener("click", () => { if (getContext()) toggle(); });
  $("#shareChatLink").addEventListener("click", selectLink);
  $("#shareChatImage").addEventListener("click", () => $("#chatShareFile").click());
  $("#chatShareFile").addEventListener("change", (event) => selectFile(event.target.files[0]));
  $("#chatShareUrl").addEventListener("input", updateLinkPreview);
  $("#chatShareTitle").addEventListener("input", updateLinkPreview);
  $("#cancelChatShare").addEventListener("click", () => { if (!busy) { clearSelection(); toggle(false); } });
  $("#confirmChatShare").addEventListener("click", send);
  $("#chatStickerGrid").innerHTML = stickers.map(([label, emoji, color], index) => `<button type="button" data-sticker="${index}" aria-label="${label}" style="background:${color}"><span>${emoji}</span><small>${label}</small></button>`).join("");
  $("#chatStickerGrid").addEventListener("click", (event) => { const button = event.target.closest("[data-sticker]"); if (button) selectSticker(Number(button.dataset.sticker)); });
  $("#chatMessages").addEventListener("click", (event) => {
    const button = event.target.closest("[data-chat-image]"); if (!button) return;
    $("#chatImageLarge").src = button.dataset.chatImage;
    $("#chatImageViewer").hidden = false; $("#closeChatImage").focus();
  });
  $("#closeChatImage").addEventListener("click", () => { $("#chatImageViewer").hidden = true; $("#chatImageLarge").removeAttribute("src"); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { $("#chatImageViewer").hidden = true; if (!busy) toggle(false); } });
  function render(item, token) {
    if (item.kind === "link" && item.link) {
      try {
        const link = new URL(item.link.url);
        if (!["http:", "https:"].includes(link.protocol) || link.username || link.password) return escapeHtml(item.body);
        return `<a class="chat-link" href="${escapeHtml(link.href)}" target="_blank" rel="noopener noreferrer" referrerpolicy="no-referrer"><small>分享内容 ↗</small><strong>${escapeHtml(item.link.title || link.hostname)}</strong><span>${escapeHtml(link.hostname)}</span></a>`;
      } catch { return escapeHtml(item.body); }
    }
    if (["image", "sticker"].includes(item.kind) && item.attachment?.id) {
      const url = `/api/chat-attachments/${encodeURIComponent(item.attachment.id)}?token=${encodeURIComponent(token)}`;
      return `<button class="chat-image ${item.kind === "sticker" ? "is-sticker" : ""}" type="button" data-chat-image="${escapeHtml(url)}" aria-label="放大${item.kind === "sticker" ? "表情包" : "图片"}"><img src="${escapeHtml(url)}" alt="${item.kind === "sticker" ? "表情包" : "图片"}" loading="lazy" referrerpolicy="no-referrer" /></button>`;
    }
    return escapeHtml(item.body);
  }
  return { reset, render };
}
