export function normalizeAnswer(value) {
  return String(value || "")
    .normalize("NFKC").toLowerCase()
    .replace(/[\s\p{P}\p{S}]/gu, "");
}

export function localMatch(guess, answers) {
  const g = normalizeAnswer(guess);
  if (!g) return false;
  return answers.map(normalizeAnswer).filter(Boolean).some((a) => a === g || (a.length >= 2 && g.includes(a)));
}

export const CARD_TEMPLATES = [
  { name: "生日惊喜", question: "去年生日，我们一起吃的是什么蛋糕？", hint: "想想那天大家抢着吃的口味", unlockType: "surprise", content: "今年的惊喜也准备好啦，见面给你！" },
  { name: "老友回忆", question: "那次旅行，我们给迷路的小队起了什么外号？", hint: "和我们当时的方向感有关", unlockType: "message", content: "下次还想和你们一起出发。" },
  { name: "聚会邀约", question: "我们每次聚会必点的那道菜是什么？", hint: "每次都是它最先光盘", unlockType: "invite", content: "老朋友，该聚一聚啦！", inviteWhen: "周六晚上 7 点", inviteWhere: "我们常去的那家店" },
  { name: "情侣默契", question: "第一次一起看的电影叫什么？", hint: "想想散场时我们聊的那句话", unlockType: "message", content: "和你在一起的普通日子，也值得记住。" }
];
