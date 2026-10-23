import qrcode from "/vendor/qrcode-generator/qrcode.mjs";

let posterBlob;
const $ = (id) => document.getElementById(id);

export async function openPoster(card) {
  posterBlob = null;
  $("posterDlg").showModal();
  $("posterStatus").textContent = "正在生成分享图…";
  $("downloadPoster").disabled = $("nativeSharePoster").disabled = true;
  const canvas = $("posterCanvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  try {
    const url = new URL(card.shareUrl);
    if (!["https:", "http:"].includes(url.protocol)) throw new Error("卡片链接不可用");
    // ASCII encoding keeps the QR payload independent of the encoder's Unicode mode.
    const qr = qrcode(0, "M");
    qr.addData(url.href);
    qr.make();
    await document.fonts.ready;
    ctx.fillStyle = "#fff4e6"; ctx.fillRect(0, 0, 900, 1200);
    ctx.fillStyle = "#231b2e"; ctx.fillRect(55, 65, 800, 1090);
    ctx.fillStyle = "#fff"; ctx.fillRect(40, 50, 800, 1090);
    ctx.strokeStyle = "#231b2e"; ctx.lineWidth = 4; ctx.strokeRect(40, 50, 800, 1090);
    ctx.fillStyle = "#ffd23f"; ctx.fillRect(90, 105, 220, 62);
    ctx.fillStyle = "#231b2e"; ctx.font = "bold 32px sans-serif"; ctx.fillText("暗号卡 · 内测", 105, 148);
    ctx.font = "bold 58px sans-serif";
    ctx.fillText("只有自己人", 90, 265); ctx.fillText("才解得开", 90, 340);
    ctx.font = "30px sans-serif";
    ctx.fillText(`来自：${card.senderName || "一位朋友"}`, 90, 420, 690);
    ctx.fillStyle = "#7a6f80"; ctx.font = "28px sans-serif";
    ctx.fillText("有一道关于我们的小题，等你来答。", 90, 485, 690);
    const count = qr.getModuleCount();
    const cell = Math.floor(460 / (count + 8));
    const size = cell * (count + 8);
    const left = Math.floor((900 - size) / 2), top = 545;
    ctx.fillStyle = "#fff"; ctx.fillRect(left, top, size, size);
    ctx.fillStyle = "#000";
    for (let row = 0; row < count; row++) {
      for (let col = 0; col < count; col++) {
        if (qr.isDark(row, col)) ctx.fillRect(left + (col + 4) * cell, top + (row + 4) * cell, cell, cell);
      }
    }
    ctx.fillStyle = "#231b2e"; ctx.font = "bold 30px sans-serif"; ctx.textAlign = "center";
    ctx.fillText("扫码对暗号 · 答对解锁惊喜", 450, 1050);
    ctx.fillStyle = "#7a6f80"; ctx.font = "23px sans-serif";
    ctx.fillText("仅限 18 岁以上 · 请私下发给收卡人", 450, 1100);
    ctx.textAlign = "start";
    posterBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!posterBlob) throw new Error("图片生成失败，请重试");
    $("downloadPoster").disabled = false;
    const file = new File([posterBlob], "暗号卡.png", { type: "image/png" });
    $("nativeSharePoster").disabled = !navigator.canShare?.({ files: [file] });
    $("posterStatus").textContent = $("nativeSharePoster").disabled ? "可保存图片后发送给朋友；当前浏览器不支持直接分享图片。" : "已生成，可以保存或分享给朋友。";
  } catch (error) { $("posterStatus").textContent = error.message; }
}

export function savePoster() {
  if (!posterBlob) return;
  const url = URL.createObjectURL(posterBlob);
  const link = document.createElement("a");
  link.href = url; link.download = "暗号卡.png"; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  $("posterStatus").textContent = "已请求保存；若在微信内未出现下载，请用浏览器打开后保存。";
}

export async function sharePoster() {
  if (!posterBlob) return;
  try {
    await navigator.share({ files: [new File([posterBlob], "暗号卡.png", { type: "image/png" })], title: "有张暗号卡等你解开" });
  } catch (error) {
    if (error.name !== "AbortError") $("posterStatus").textContent = "分享未完成，可以先保存图片再发送。";
  }
}
