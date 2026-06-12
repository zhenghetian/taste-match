const contentCards = [
  {
    title: "凌晨两点的城市散步",
    format: "短视频 / 生活切片",
    tags: ["城市散步", "夜晚情绪", "低饱和审美"],
    visual:
      "linear-gradient(135deg, #19232d 0%, #2b5f73 46%, #d0a85a 47%, #d0a85a 52%, #4c3841 53%, #1d2329 100%)",
  },
  {
    title: "真实小店探访，不打卡也好吃",
    format: "探店 / 烟火气",
    tags: ["美食小店", "真实生活", "同城"],
    visual:
      "linear-gradient(135deg, #603b2e 0%, #b45f3f 38%, #e3c06f 39%, #e3c06f 52%, #55705a 53%, #26322f 100%)",
  },
  {
    title: "一句话把职场荒谬讲透",
    format: "吐槽 / 冷幽默",
    tags: ["职场观察", "冷幽默", "观点"],
    visual:
      "linear-gradient(135deg, #2d3035 0%, #52616b 35%, #d1d6d9 36%, #d1d6d9 49%, #a6533d 50%, #3a2421 100%)",
  },
  {
    title: "周末临时起意去看展",
    format: "Vlog / 城市活动",
    tags: ["展览", "周末计划", "审美"],
    visual:
      "linear-gradient(135deg, #f0e8d2 0%, #c28b2c 31%, #253f52 32%, #253f52 54%, #b65b75 55%, #583241 100%)",
  },
  {
    title: "抽象段子，离谱但很懂",
    format: "搞笑 / 梗文化",
    tags: ["抽象搞笑", "互联网梗", "轻松聊天"],
    visual:
      "linear-gradient(135deg, #1d2329 0%, #8b3a55 30%, #f0c55d 31%, #f0c55d 45%, #2b7a78 46%, #132f35 100%)",
  },
  {
    title: "不鸡血的自我照顾",
    format: "生活方式 / 轻疗愈",
    tags: ["松弛感", "自我照顾", "慢生活"],
    visual:
      "linear-gradient(135deg, #e6decf 0%, #8fa27e 40%, #5f744a 41%, #5f744a 60%, #35453a 61%, #1d2329 100%)",
  },
  {
    title: "深夜歌单和无人街景",
    format: "音乐 / 情绪氛围",
    tags: ["音乐", "夜晚情绪", "城市散步"],
    visual:
      "linear-gradient(135deg, #111820 0%, #273c67 35%, #b65b75 36%, #b65b75 48%, #d8a84d 49%, #1d2329 100%)",
  },
  {
    title: "低成本旅行，不赶路",
    format: "旅行 / 生活方式",
    tags: ["旅行", "慢节奏", "真实生活"],
    visual:
      "linear-gradient(135deg, #274b4c 0%, #68a0a2 36%, #e5d0a5 37%, #e5d0a5 50%, #a6533d 51%, #39251f 100%)",
  },
  {
    title: "知识讲清楚，但不端着",
    format: "科普 / 解释型内容",
    tags: ["知识科普", "表达清晰", "观点"],
    visual:
      "linear-gradient(135deg, #22313d 0%, #3d6e82 30%, #f0efe6 31%, #f0efe6 42%, #c28b2c 43%, #59431f 100%)",
  },
  {
    title: "热闹现场，音乐一响就想出门",
    format: "演出 / 现场感",
    tags: ["音乐现场", "展览演出", "社交活动"],
    visual:
      "linear-gradient(135deg, #2b1f30 0%, #7b3c68 34%, #ef8b55 35%, #ef8b55 48%, #2b7a78 49%, #173b3a 100%)",
  },
];

const videoMeta = [
  {
    creator: "@晚风散步",
    caption: "这条路没有目的地，但很适合把一天走完。",
    music: "城市噪音采样 - midnight walk",
    likes: "3.2w",
    comments: "1280",
    saves: "609",
  },
  {
    creator: "@小店雷达",
    caption: "人均 38，不用排队，老板会记得你上次点了什么。",
    music: "后厨白噪音 - local bite",
    likes: "5.8w",
    comments: "2144",
    saves: "1.1w",
  },
  {
    creator: "@不想开会",
    caption: "当甲方说“这个需求很简单”的时候。",
    music: "键盘声和叹气 - office loop",
    likes: "8.4w",
    comments: "5360",
    saves: "942",
  },
  {
    creator: "@周末不宅",
    caption: "临时买票，临时出门，反而看到了今天最喜欢的一张。",
    music: "展厅脚步声 - weekend cut",
    likes: "2.6w",
    comments: "740",
    saves: "3021",
  },
  {
    creator: "@离谱观察员",
    caption: "这梗第一秒没懂，第三秒开始笑到停不下来。",
    music: "互联网碎片 - meme radio",
    likes: "12.7w",
    comments: "9801",
    saves: "2.4w",
  },
  {
    creator: "@慢一点也行",
    caption: "今天没有变好也没关系，先把房间灯打开。",
    music: "窗边白噪音 - soft reset",
    likes: "4.1w",
    comments: "1802",
    saves: "1.5w",
  },
  {
    creator: "@夜路歌单",
    caption: "适合戴耳机走过三个路口，不发朋友圈的那种歌。",
    music: "无人街景 - night playlist",
    likes: "6.9w",
    comments: "2600",
    saves: "3.7w",
  },
  {
    creator: "@不赶路旅行",
    caption: "没有景点任务，只有一辆慢车和一碗热汤。",
    music: "绿皮车窗 - slow trip",
    likes: "3.7w",
    comments: "1190",
    saves: "8600",
  },
  {
    creator: "@讲明白了",
    caption: "三分钟把这个概念讲清楚，不用装懂。",
    music: "白板笔声 - clear take",
    likes: "7.3w",
    comments: "3420",
    saves: "2.1w",
  },
  {
    creator: "@今晚有票吗",
    caption: "前奏一响，突然就觉得应该出门见见人。",
    music: "live house 片段 - crowd warmup",
    likes: "9.6w",
    comments: "4721",
    saves: "1.9w",
  },
];

const mockPeople = [
  {
    id: "person_ac",
    name: "阿澈",
    meta: "25 / 上海 / 城市散步",
    initials: "AC",
    bg: "linear-gradient(135deg, #18303a, #2b7a78 44%, #d0a85a 45%, #6d3e43)",
    profile: {
      themes: ["城市散步", "音乐", "美食小店", "夜晚情绪"],
      hook: "一个人走路时听什么歌",
      difference: "TA 更偏音乐现场，你更偏安静街景。",
    },
  },
  {
    id: "person_mina",
    name: "Mina",
    meta: "24 / 上海 / 展览探店",
    initials: "MI",
    bg: "linear-gradient(135deg, #f0e8d2, #b65b75 38%, #253f52 39%, #1d2329)",
    profile: {
      themes: ["展览", "真实生活", "低饱和审美", "周末计划"],
      hook: "最近想去但还没去的展",
      difference: "TA 更爱展览和影像，你更容易从街头生活切入。",
    },
  },
  {
    id: "person_sz",
    name: "山竹",
    meta: "26 / 上海 / 饭搭子",
    initials: "SZ",
    bg: "linear-gradient(135deg, #663f2f, #c28b2c 38%, #5f744a 39%, #1d2329)",
    profile: {
      themes: ["美食小店", "冷幽默", "真实生活", "同城"],
      hook: "一家不想发到社交平台的小店",
      difference: "TA 的内容更烟火气，你的内容更有夜晚氛围。",
    },
  },
  {
    id: "person_yu",
    name: "予白",
    meta: "23 / 上海 / 抽象快乐",
    initials: "YB",
    bg: "linear-gradient(135deg, #1d2329, #8b3a55 35%, #f0c55d 36%, #2b7a78)",
    profile: {
      themes: ["抽象搞笑", "互联网梗", "轻松聊天", "冷幽默"],
      hook: "最近刷到最离谱但又想分享的视频",
      difference: "TA 更偏抽象快乐，你的偏好里有更多生活氛围。",
    },
  },
  {
    id: "person_nuo",
    name: "糯糯",
    meta: "24 / 上海 / 松弛生活",
    initials: "NN",
    bg: "linear-gradient(135deg, #e6decf, #8fa27e 42%, #5f744a 43%, #26322f)",
    profile: {
      themes: ["松弛感", "自我照顾", "慢生活", "真实生活"],
      hook: "一个不需要很努力也能让人舒服的周末",
      difference: "TA 更像慢生活路线，你的内容更有城市移动感。",
    },
  },
  {
    id: "person_xi",
    name: "西柚",
    meta: "26 / 上海 / 知识收集",
    initials: "XY",
    bg: "linear-gradient(135deg, #22313d, #3d6e82 36%, #f0efe6 37%, #c28b2c)",
    profile: {
      themes: ["知识科普", "表达清晰", "观点", "职场观察"],
      hook: "一个最近被讲清楚的复杂问题",
      difference: "TA 更爱解释型内容，你更容易从具体生活画面切入。",
    },
  },
  {
    id: "person_lin",
    name: "林间",
    meta: "25 / 上海 / 低成本旅行",
    initials: "LJ",
    bg: "linear-gradient(135deg, #274b4c, #68a0a2 40%, #e5d0a5 41%, #a6533d)",
    profile: {
      themes: ["旅行", "慢节奏", "真实生活", "周末计划"],
      hook: "一个不赶路也很值得去的地方",
      difference: "TA 更偏离开城市，你更偏在城市里重新发现路线。",
    },
  },
  {
    id: "person_dora",
    name: "Dora",
    meta: "24 / 上海 / 音乐现场",
    initials: "DO",
    bg: "linear-gradient(135deg, #2b1f30, #7b3c68 38%, #ef8b55 39%, #173b3a)",
    profile: {
      themes: ["音乐现场", "展览演出", "社交活动", "音乐"],
      hook: "下一场想去的演出",
      difference: "TA 更有现场能量，你更偏安静观察。",
    },
  },
  {
    id: "person_ke",
    name: "可乐",
    meta: "22 / 上海 / 职场吐槽",
    initials: "KL",
    bg: "linear-gradient(135deg, #2d3035, #52616b 34%, #d1d6d9 35%, #a6533d)",
    profile: {
      themes: ["职场观察", "冷幽默", "观点", "轻松聊天"],
      hook: "一个只有打工人才懂的荒谬瞬间",
      difference: "TA 更擅长吐槽现实，你的偏好更柔和一点。",
    },
  },
  {
    id: "person_momo",
    name: "Momo",
    meta: "23 / 上海 / 周末影像",
    initials: "MO",
    bg: "linear-gradient(135deg, #f0e8d2, #253f52 34%, #b65b75 35%, #583241)",
    profile: {
      themes: ["展览", "审美", "低饱和审美", "周末计划"],
      hook: "一张你会停下来看的照片",
      difference: "TA 更重视影像和展陈，你更重视生活场景本身。",
    },
  },
  {
    id: "person_qing",
    name: "晴也",
    meta: "27 / 上海 / 情绪共鸣",
    initials: "QY",
    bg: "linear-gradient(135deg, #111820, #273c67 34%, #b65b75 35%, #d8a84d)",
    profile: {
      themes: ["夜晚情绪", "音乐", "自我照顾", "真实生活"],
      hook: "一首适合夜路循环的歌",
      difference: "TA 更偏情绪和音乐，你更容易把情绪落到城市细节里。",
    },
  },
  {
    id: "person_he",
    name: "河岸",
    meta: "26 / 上海 / 同城活动",
    initials: "HA",
    bg: "linear-gradient(135deg, #345b63, #2b7a78 38%, #c28b2c 39%, #5f744a)",
    profile: {
      themes: ["同城", "社交活动", "美食小店", "展览演出"],
      hook: "一个适合第一次见面的低压力路线",
      difference: "TA 更会把兴趣变成出门计划，你的偏好更像内容品味入口。",
    },
  },
];

const state = {
  index: 0,
  reactions: [],
  profile: null,
  selectedMatch: null,
  feedback: {
    profile: null,
    matches: null,
    icebreaker: null,
  },
  events: [],
};

const views = [
  document.querySelector("#viewInput"),
  document.querySelector("#viewProfile"),
  document.querySelector("#viewMatches"),
  document.querySelector("#viewChat"),
];

const steps = [...document.querySelectorAll(".step")];
const contentCardEl = document.querySelector("#contentCard");
const signalListEl = document.querySelector("#signalList");
const cardCountEl = document.querySelector("#cardCount");
const completionTextEl = document.querySelector("#completionText");
const progressBarEl = document.querySelector("#progressBar");
const generateProfileBtn = document.querySelector("#generateProfileBtn");
const freeTextEl = document.querySelector("#freeText");

function showView(index) {
  views.forEach((view, viewIndex) => {
    view.classList.toggle("is-visible", viewIndex === index);
  });
  steps.forEach((step, stepIndex) => {
    step.classList.toggle("is-active", stepIndex === index);
  });
}

function renderCard() {
  const card = contentCards[state.index] || contentCards[contentCards.length - 1];
  const meta = videoMeta[state.index] || videoMeta[0];
  contentCardEl.innerHTML = `
    <div class="content-visual" style="--visual: ${card.visual}">
      <div class="video-status">
        <span>12:48</span>
        <span>For You</span>
      </div>
      <div class="scene-layer" aria-hidden="true">
        <span class="scene-card scene-card-a"></span>
        <span class="scene-card scene-card-b"></span>
        <span class="scene-card scene-card-c"></span>
      </div>
      <div class="video-actions" aria-label="Short video actions">
        <span class="video-avatar">${meta.creator.slice(1, 2)}</span>
        <span class="action-icon">♥<b>${meta.likes}</b></span>
        <span class="action-icon">··<b>${meta.comments}</b></span>
        <span class="action-icon">↗<b>${meta.saves}</b></span>
      </div>
      <div class="video-caption">
        <span class="video-format">${card.format}</span>
        <strong>${meta.creator}</strong>
        <h3>${card.title}</h3>
        <p>${meta.caption}</p>
        <div class="music-bar">${meta.music}</div>
      </div>
    </div>
    <div class="content-meta">
      ${card.tags.map((tag) => `<span class="tag">${tag}</span>`).join("")}
    </div>
  `;

  const completed = state.reactions.length;
  const percent = Math.round((completed / contentCards.length) * 100);
  cardCountEl.textContent = `${Math.min(state.index + 1, contentCards.length)} / ${contentCards.length}`;
  completionTextEl.textContent = `完成 ${percent}%`;
  progressBarEl.style.width = `${percent}%`;
  generateProfileBtn.disabled = completed < 6;
  renderSignals();
}

function renderSignals() {
  const weights = getWeightedTags();
  const top = Object.entries(weights)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  if (!top.length) {
    signalListEl.innerHTML = `<div class="signal"><span>等待你的内容反应</span><b>0</b></div>`;
    return;
  }

  signalListEl.innerHTML = top
    .map(([tag, weight]) => `<div class="signal"><span>${tag}</span><b>${weight}</b></div>`)
    .join("");
}

function getWeightedTags() {
  const weights = {};
  const reactionWeights = {
    want_to_talk: 3,
    like: 2,
    neutral: 0,
    dislike: -2,
  };

  state.reactions.forEach((item) => {
    item.card.tags.forEach((tag) => {
      weights[tag] = (weights[tag] || 0) + reactionWeights[item.reaction];
    });
  });

  return weights;
}

function handleReaction(reaction) {
  if (state.index >= contentCards.length) return;
  state.reactions.push({ card: contentCards[state.index], reaction });
  state.index += 1;

  if (state.index >= contentCards.length) {
    state.index = contentCards.length - 1;
  }

  renderCard();
}

function selectedIntents() {
  return [...document.querySelectorAll(".intent-field input:checked")].map((input) => input.value);
}

function logEvent(type, payload = {}) {
  state.events.push({
    type,
    payload,
    timestamp: new Date().toISOString(),
  });
}

function setFeedback(group, value, button) {
  state.feedback[group] = value;
  document
    .querySelectorAll(`[data-feedback-group="${group}"] button`)
    .forEach((item) => item.classList.toggle("is-selected", item === button));
  logEvent("feedback", { group, value });
}

function generateProfile() {
  const weights = getWeightedTags();
  const rankedTags = Object.entries(weights)
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);

  const text = freeTextEl.value.trim();
  const hasNight = rankedTags.some((tag) => tag.includes("夜晚") || tag.includes("城市散步"));
  const hasFood = rankedTags.some((tag) => tag.includes("美食") || tag.includes("同城"));
  const hasHumor = rankedTags.some((tag) => tag.includes("幽默") || tag.includes("搞笑"));
  const hasArt = rankedTags.some((tag) => tag.includes("展览") || tag.includes("审美"));

  const vibeName = hasNight
    ? "城市夜游型"
    : hasArt
      ? "周末审美探索型"
      : hasFood
        ? "烟火气雷达型"
        : "轻松同频观察型";

  const summaryParts = [
    hasNight ? "你似乎更容易被城市里的具体细节、夜晚氛围和不太用力的表达吸引" : "你更在意内容里的真实感和可以聊起来的生活细节",
    hasFood ? "也会对小店、同城路线和低压力见面场景有兴趣" : "比起宏大的自我介绍，你可能更愿意从一个具体话题开始认识人",
    hasHumor ? "你的笑点偏冷、偏观察，适合和能接住细微荒谬感的人聊天" : "你的内容偏好适合温和、慢一点的破冰方式",
  ];

  state.profile = {
    vibeName,
    summary: `${summaryParts.join("。")}。${text ? `你补充的偏好里还出现了“${text}”，这会被作为私密匹配信号。` : ""}`,
    themes: rankedTags.slice(0, 6),
    humor: hasHumor ? "冷幽默 / 观察型笑点 / 不喜欢太用力的梗" : "轻松自然 / 具体生活感 / 低压力表达",
    aesthetic: hasNight
      ? "低饱和城市感、街灯、步行路线、真实生活切片"
      : hasArt
        ? "展览、影像、周末路线和有质感的小发现"
        : "烟火气、真实小店、具体而不精致的人间细节",
    hooks: [
      rankedTags[0] ? `为什么会喜欢「${rankedTags[0]}」这类内容` : "最近刷到最想分享的一条视频",
      hasFood ? "一家不想发到平台上的小店" : "一个人散步时会听什么",
      selectedIntents().join("、") || "低压力聊天",
    ],
  };

  logEvent("profile_generated", {
    vibeName: state.profile.vibeName,
    themes: state.profile.themes,
    intents: selectedIntents(),
    freeText: text,
  });
  renderProfile();
  renderMatches();
  showView(1);
}

function renderProfile() {
  document.querySelector("#vibeName").textContent = state.profile.vibeName;
  document.querySelector("#vibeSummary").textContent = state.profile.summary;
  document.querySelector("#humorStyle").textContent = state.profile.humor;
  document.querySelector("#aestheticStyle").textContent = state.profile.aesthetic;
  document.querySelector("#themePills").innerHTML = state.profile.themes
    .map((theme) => `<span class="pill">${theme}</span>`)
    .join("");
  document.querySelector("#hooksList").innerHTML = state.profile.hooks
    .map((hook) => `<span class="hook">${hook}</span>`)
    .join("");
}

function scorePerson(person) {
  const userThemes = new Set(state.profile?.themes || []);
  const shared = person.profile.themes.filter((theme) => userThemes.has(theme));
  return Math.min(94, 72 + shared.length * 6);
}

function makeMatchReason(person) {
  const shared = person.profile.themes.filter((theme) => state.profile.themes.includes(theme));
  const sharedText = shared.length ? shared.join("、") : person.profile.themes.slice(0, 2).join("、");
  return `你们都对 ${sharedText} 有反应。${person.profile.difference} 一个自然入口是聊「${person.profile.hook}」。`;
}

function renderMatches() {
  const grid = document.querySelector("#matchGrid");
  grid.innerHTML = mockPeople
    .map((person, index) => ({ person, originalIndex: index, score: scorePerson(person) }))
    .sort((a, b) => b.score - a.score)
    .map((person, index) => {
      const score = person.score;
      const reason = makeMatchReason(person.person);
      return `
        <article class="match-card">
          <div class="match-visual" style="--match-bg: ${person.person.bg}">
            <div class="avatar">${person.person.initials}</div>
            <div class="score">${score}% 同频</div>
          </div>
          <div class="match-body">
            <div>
              <h3>${person.person.name}</h3>
              <p>${person.person.meta}</p>
            </div>
            <div class="pill-row">
              ${person.person.profile.themes.slice(0, 3).map((theme) => `<span class="pill">${theme}</span>`).join("")}
            </div>
            <p>${reason}</p>
            <div class="match-actions">
              <button class="ghost-btn" data-save="${person.originalIndex}" type="button">先收藏</button>
              <button class="primary-btn" data-chat="${person.originalIndex}" type="button">想认识</button>
            </div>
          </div>
        </article>
      `;
    })
    .join("");
}

function openChat(index) {
  state.selectedMatch = mockPeople[index];
  const person = state.selectedMatch;
  const reason = makeMatchReason(person);
  const icebreakers = [
    `你也会看「${person.profile.hook}」这种内容吗？我有点好奇你会怎么选。`,
    `你的 Vibe 看起来也挺适合低压力出门的，最近有没有想去但还没去的地方？`,
    `AI 说我们可能会从「${person.profile.themes[0]}」聊起来，我想验证一下它准不准。`,
  ];

  document.querySelector("#chatContext").innerHTML = `
    <p class="eyebrow">Match Context</p>
    <h3>${person.name}</h3>
    <div class="context-list">
      <div class="context-item"><b>AI 理由</b><br>${reason}</div>
      <div class="context-item"><b>共同话题</b><br>${person.profile.themes.join("、")}</div>
      <div class="context-item"><b>提醒</b><br>AI 只提供开场建议，不替你下判断，也不展示原始观看记录。</div>
    </div>
  `;

  document.querySelector("#messageList").innerHTML = `
    <div class="message ai">我根据你们的 Vibe Profile 生成了几个不太尴尬的开场。可以直接点，也可以改成更像你的语气。</div>
  `;
  document.querySelector("#icebreakers").innerHTML = icebreakers
    .map((text) => `<button class="icebreaker" type="button">${text}</button>`)
    .join("");
  document.querySelector("#chatInput").value = "";
  logEvent("match_opened", {
    personId: person.id,
    name: person.name,
    reason,
    icebreakers,
  });
  showView(3);
}

function sendMessage(text) {
  const cleaned = text.trim();
  if (!cleaned) return;
  const list = document.querySelector("#messageList");
  list.insertAdjacentHTML("beforeend", `<div class="message me">${cleaned}</div>`);
  logEvent("message_sent", {
    personId: state.selectedMatch?.id,
    text: cleaned,
    usedSuggestedIcebreaker: [...document.querySelectorAll(".icebreaker")].some(
      (button) => button.textContent === cleaned,
    ),
  });
  setTimeout(() => {
    list.insertAdjacentHTML(
      "beforeend",
      `<div class="message them">这个问题还挺自然的。我最近确实收藏了几个类似的地方，感觉比直接问“在干嘛”舒服多了。</div>`,
    );
    list.scrollTop = list.scrollHeight;
  }, 350);
  list.scrollTop = list.scrollHeight;
  document.querySelector("#chatInput").value = "";
}

function exportTestResults() {
  const payload = {
    exportedAt: new Date().toISOString(),
    prototype: "AI Vibe Match MVP",
    reactions: state.reactions.map((item) => ({
      title: item.card.title,
      tags: item.card.tags,
      reaction: item.reaction,
    })),
    freeText: freeTextEl.value.trim(),
    intents: selectedIntents(),
    weightedTags: getWeightedTags(),
    profile: state.profile,
    feedback: state.feedback,
    selectedMatch: state.selectedMatch
      ? {
          id: state.selectedMatch.id,
          name: state.selectedMatch.name,
          themes: state.selectedMatch.profile.themes,
        }
      : null,
    events: state.events,
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `vibe-match-test-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  logEvent("results_exported", {
    reactions: state.reactions.length,
    events: state.events.length,
  });
}

document.querySelectorAll(".reaction-btn").forEach((button) => {
  button.addEventListener("click", () => handleReaction(button.dataset.reaction));
});

steps.forEach((step, index) => {
  step.addEventListener("click", () => {
    if (index === 1 && !state.profile) generateProfile();
    if (index === 2 && !state.profile) generateProfile();
    if (index === 3 && !state.selectedMatch) openChat(0);
    showView(index);
  });
});

generateProfileBtn.addEventListener("click", generateProfile);
document.querySelector("#regenerateBtn").addEventListener("click", generateProfile);
document.querySelector("#goMatchesBtn").addEventListener("click", () => showView(2));
document.querySelector("#backToMatchesBtn").addEventListener("click", () => showView(2));
document.querySelector("#exportBtn").addEventListener("click", exportTestResults);
document.querySelector("#resetBtn").addEventListener("click", () => {
  state.index = 0;
  state.reactions = [];
  state.profile = null;
  state.selectedMatch = null;
  state.feedback = {
    profile: null,
    matches: null,
    icebreaker: null,
  };
  state.events = [];
  freeTextEl.value = "";
  document.querySelectorAll(".feedback-actions button").forEach((button) => {
    button.classList.remove("is-selected");
  });
  renderCard();
  showView(0);
});

document.querySelector("#matchGrid").addEventListener("click", (event) => {
  const chatButton = event.target.closest("[data-chat]");
  const saveButton = event.target.closest("[data-save]");
  if (saveButton) {
    const person = mockPeople[Number(saveButton.dataset.save)];
    logEvent("match_saved", { personId: person.id, name: person.name });
    saveButton.textContent = "已收藏";
  }
  if (chatButton) openChat(Number(chatButton.dataset.chat));
});

document.querySelector("#icebreakers").addEventListener("click", (event) => {
  const button = event.target.closest(".icebreaker");
  if (button) {
    document.querySelector("#chatInput").value = button.textContent;
    logEvent("icebreaker_selected", {
      personId: state.selectedMatch?.id,
      text: button.textContent,
    });
  }
});

document.querySelectorAll("[data-feedback-group]").forEach((group) => {
  group.addEventListener("click", (event) => {
    const button = event.target.closest("[data-feedback]");
    if (!button) return;
    setFeedback(group.dataset.feedbackGroup, button.dataset.feedback, button);
  });
});

document.querySelector("#sendBtn").addEventListener("click", () => {
  sendMessage(document.querySelector("#chatInput").value);
});

document.querySelector("#chatInput").addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendMessage(event.currentTarget.value);
  }
});

renderCard();
