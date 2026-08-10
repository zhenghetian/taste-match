const contentCards = [
  {
    id: "cat-report-card",
    title: "女儿成绩太差了，把它丢出去",
    format: "猫咪日常",
    tags: ["猫咪", "生活幽默", "真实生活"],
    creator: "@蕉糖馒头🥖",
    caption: "女儿成绩太差了，把它丢出去。#猫咪真实的样子",
    music: "抖音原声 · 蕉糖馒头",
    likes: "5.6万",
    comments: "817",
    peers: 28,
    douyinUrl: "https://v.douyin.com/PMg0WCVCmMs/",
    canonicalUrl: "https://www.douyin.com/video/7656275297339198138",
    cover: "./assets/covers/cat-report-card.jpg",
    visual: "linear-gradient(145deg, #31271f 0%, #8f603b 30%, #d4b17e 52%, #4c5345 76%, #161917 100%)",
  },
  {
    id: "basketball-reverse",
    title: "秃师傅假掩护反向上篮",
    format: "篮球高光",
    tags: ["篮球", "运动高光", "竞技反应"],
    creator: "@布卡（代拍剪）",
    caption: "秃师傅假掩护反向上篮！吴勇豪送钉板血帽。",
    music: "球场现场 · 篮球高光",
    likes: "3.3万",
    comments: "1,004",
    peers: 41,
    douyinUrl: "https://v.douyin.com/TD1_dzAY-zA/",
    canonicalUrl: "https://www.douyin.com/video/7653472854248719461",
    cover: "./assets/covers/basketball-reverse.jpg",
    visual: "linear-gradient(150deg, #11141b 0%, #283a57 28%, #a43334 29%, #e2a436 56%, #111217 100%)",
  },
  {
    id: "biography-reading",
    title: "读人物自传最大的感受",
    format: "阅读感悟",
    tags: ["人物自传", "长期主义", "自我成长"],
    creator: "@程冲冲",
    caption: "原来那些后来光芒万丈的人，也有很长一段无人问津的日子。",
    music: "图文笔记 · 人物自传",
    likes: "9,486",
    comments: "829",
    peers: 36,
    douyinUrl: "https://v.douyin.com/xSK2cfb4lvI/",
    canonicalUrl: "https://www.douyin.com/note/7649001209977664869",
    cover: "./assets/covers/biography-reading.jpg",
    visual: "linear-gradient(145deg, #ece2cf 0%, #bf985e 35%, #31425c 36%, #566d82 67%, #1d2027 100%)",
  },
  {
    id: "perfect-bgm",
    title: "这条视频终于迎来了最适合的 BGM",
    format: "BGM 梗",
    tags: ["BGM", "轻松聊天", "互联网梗"],
    creator: "@先别吉🥕",
    caption: "这条视频终于迎来了最适合的 BGM。",
    music: "热门配乐 · 反差现场",
    likes: "2.0万",
    comments: "1,011",
    peers: 52,
    douyinUrl: "https://v.douyin.com/O0R0TlxRdSI/",
    canonicalUrl: "https://www.douyin.com/video/7656988310985138803",
    cover: "./assets/covers/perfect-bgm.jpg",
    visual: "linear-gradient(140deg, #202128 0%, #5f5bd6 28%, #ed4f70 29%, #e0ad3d 57%, #151820 100%)",
  },
  {
    id: "beijing-cbd",
    title: "帝都的繁华与压迫感",
    format: "北京 CBD",
    tags: ["城市观察", "北京朝阳CBD", "压迫感"],
    creator: "@最靓的仔～",
    caption: "途经北京朝阳 CBD，镜头里是繁华，也是压迫感。",
    music: "城市环境声 · 北京朝阳",
    likes: "1.1万",
    comments: "515",
    peers: 33,
    douyinUrl: "https://v.douyin.com/DdtcO0wrNzU/",
    canonicalUrl: "https://www.douyin.com/video/7649030962278077923",
    cover: "./assets/covers/beijing-cbd.jpg",
    visual: "linear-gradient(150deg, #0d141c 0%, #2f4258 34%, #aebac9 35%, #5b748b 58%, #171d24 100%)",
  },
  {
    id: "relaxed-laugh",
    title: "仔细听听她说的啥，承包一年笑点",
    format: "松弛感笑点",
    tags: ["松弛感", "生活幽默", "笑点"],
    creator: "@喜遇金安",
    caption: "仔细听听她说的啥，承包我一年的笑点。",
    music: "生活现场 · 松弛感",
    likes: "1.2万",
    comments: "916",
    peers: 47,
    douyinUrl: "https://v.douyin.com/Hf-HJQXzwR0/",
    canonicalUrl: "https://www.douyin.com/video/7657870760896202918",
    cover: "./assets/covers/relaxed-laugh.jpg",
    visual: "linear-gradient(145deg, #dfcfbb 0%, #7f9b6e 38%, #dda73c 39%, #a8516a 62%, #252c2a 100%)",
  },
  {
    id: "future-montage",
    title: "如果我能为这样的未来而死",
    format: "燃向混剪",
    tags: ["燃向混剪", "未来想象", "理想主义"],
    creator: "@火星的井",
    caption: "如果我能为这样的未来而死。#了不起的混剪团",
    music: "电影混剪 · 未来想象",
    likes: "1.8万",
    comments: "1,206",
    peers: 39,
    douyinUrl: "https://v.douyin.com/XcVrwDBIc98/",
    canonicalUrl: "https://www.douyin.com/video/7652178073122835195",
    cover: "./assets/covers/future-montage.jpg",
    visual: "linear-gradient(150deg, #080d1d 0%, #213a72 34%, #d8546f 35%, #daa237 54%, #0f1118 100%)",
  },
  {
    id: "emperor-tamarin",
    title: "胡子长长的皇帝狨猴",
    format: "动物科普",
    tags: ["动物科普", "知识科普", "好奇心"],
    creator: "@科普的勾勾哒",
    caption: "胡子长长的皇帝狨猴。#动物科普 #狨猴",
    music: "科普旁白 · 动物世界",
    likes: "2.0万",
    comments: "510",
    peers: 31,
    douyinUrl: "https://v.douyin.com/BCUjL5RQFeM/",
    canonicalUrl: "https://www.douyin.com/video/7658193299651448090",
    cover: "./assets/covers/emperor-tamarin.jpg",
    visual: "linear-gradient(145deg, #243027 0%, #607c48 34%, #d0b47e 35%, #986840 58%, #181f1b 100%)",
  },
  {
    id: "love-yourself-first",
    title: "爱人先爱己：我们无法给孩子内心没有的东西",
    format: "关系访谈",
    tags: ["亲密关系", "养育", "自我照顾"],
    creator: "@凉子访谈录",
    caption: "爱人先爱己。我们无法给孩子，自己内心没有的东西。",
    music: "访谈现场 · 关系与养育",
    likes: "9.5万",
    comments: "2,506",
    peers: 64,
    douyinUrl: "https://v.douyin.com/d7xwFccudQA/",
    canonicalUrl: "https://www.douyin.com/video/7658182895558790435",
    cover: "./assets/covers/love-yourself-first.jpg",
    visual: "linear-gradient(145deg, #eadfd4 0%, #d8526d 32%, #6860cd 33%, #344059 61%, #1c1e25 100%)",
  },
  {
    id: "basketball-finishing",
    title: "美国球员为什么终结强、投篮还准",
    format: "篮球训练观察",
    tags: ["篮球", "训练方法", "运动分析"],
    creator: "@X-刘畅",
    caption: "我算是知道美国球员为什么终结能力强，投篮还准了。",
    music: "训练现场 · 技术拆解",
    likes: "5.7万",
    comments: "2,018",
    peers: 44,
    douyinUrl: "https://v.douyin.com/L_tJ9dSJo94/",
    canonicalUrl: "https://www.douyin.com/video/7657150975639816635",
    cover: "./assets/covers/basketball-finishing.jpg",
    visual: "linear-gradient(145deg, #171d24 0%, #9d5239 30%, #dda738 31%, #30445c 59%, #0e1116 100%)",
  },
];

const people = [
  {
    id: "momo",
    name: "默默",
    age: 25,
    city: "上海",
    bio: "猫咪、城市散步和不太用力的幽默",
    initials: "MM",
    bg: "linear-gradient(145deg, #2d372f 0%, #7f9a77 42%, #d7b78a 43%, #9a5e4a 72%, #25272a 100%)",
    themes: ["猫咪", "生活幽默", "城市观察", "真实生活"],
    hook: "你最近刷到哪只猫，第一反应是转给朋友",
    difference: "TA 更容易被毛茸茸的现场感打动，你们都喜欢真实、不端着的表达。",
    activity: "刚刚在线",
  },
  {
    id: "ayuan",
    name: "阿原",
    age: 27,
    city: "上海",
    bio: "球场、训练细节和周末随便走走",
    initials: "AY",
    bg: "linear-gradient(145deg, #10141b 0%, #243a58 37%, #a63135 38%, #d9a33d 66%, #111318 100%)",
    themes: ["篮球", "训练方法", "运动高光", "城市散步"],
    hook: "你看球时最容易被哪个动作点燃",
    difference: "TA 爱拆动作技术，你更可能先被临场反应和高光瞬间抓住。",
    activity: "12 分钟前在线",
  },
  {
    id: "mina",
    name: "Mina",
    age: 24,
    city: "上海",
    bio: "关系访谈、书和认真吃晚饭",
    initials: "MI",
    bg: "linear-gradient(145deg, #eadfce 0%, #b85d77 38%, #334b5d 39%, #1f252b 100%)",
    themes: ["亲密关系", "养育", "自我照顾", "长期主义"],
    hook: "一个人什么时候最需要先照顾自己",
    difference: "TA 常从关系和养育谈起，你更容易从自己的具体经历进入。",
    activity: "在线",
  },
  {
    id: "shanzhu",
    name: "山竹",
    age: 26,
    city: "上海",
    bio: "动物知识、猫和一些无用但有趣的事实",
    initials: "SZ",
    bg: "linear-gradient(145deg, #263229 0%, #69874d 38%, #d4ba87 39%, #9a6844 67%, #1d2320 100%)",
    themes: ["动物科普", "猫咪", "知识科普", "好奇心"],
    hook: "哪种动物瞬间最能治好你的一天",
    difference: "TA 喜欢追问动物知识，你更容易先被真实反应逗笑。",
    activity: "今天活跃",
  },
  {
    id: "yubai",
    name: "予白",
    age: 23,
    city: "杭州",
    bio: "BGM 梗、互联网考古和轻松聊天",
    initials: "YB",
    bg: "linear-gradient(145deg, #202126 0%, #74354e 34%, #deb343 35%, #2b7d77 64%, #16191d 100%)",
    themes: ["BGM", "互联网梗", "轻松聊天", "笑点"],
    hook: "最近刷到最离谱但又想分享的视频",
    difference: "TA 更敏感于音效和反差，你更容易从内容背后的情绪聊起。",
    activity: "1 小时前在线",
  },
  {
    id: "nuonuo",
    name: "糯糯",
    age: 24,
    city: "苏州",
    bio: "松弛笑点、菜市场和低压力周末",
    initials: "NN",
    bg: "linear-gradient(145deg, #dfd6c8 0%, #8da27c 42%, #60744d 43%, #26322f 100%)",
    themes: ["松弛感", "生活幽默", "笑点", "真实生活"],
    hook: "一个不需要很努力也能让人舒服的周末",
    difference: "TA 偏爱生活现场，你更可能被细微反差和情绪击中。",
    activity: "昨天在线",
  },
  {
    id: "xiyou",
    name: "西柚",
    age: 26,
    city: "北京",
    bio: "人物命运、长期主义和慢一点的回答",
    initials: "XY",
    bg: "linear-gradient(145deg, #202e39 0%, #386579 38%, #e5e2d7 39%, #b3832d 66%, #1a1d21 100%)",
    themes: ["人物自传", "长期主义", "自我成长", "知识科普"],
    hook: "最近哪本书或哪段访谈让你停下来",
    difference: "TA 爱追人物命运，你更容易从当下感受和现实选择切入。",
    activity: "今天活跃",
  },
  {
    id: "linjian",
    name: "林间",
    age: 25,
    city: "北京",
    bio: "建筑、城市压迫感和凌晨的公交车",
    initials: "LJ",
    bg: "linear-gradient(145deg, #0f171f 0%, #30465e 38%, #aebdce 39%, #5b758e 68%, #171d23 100%)",
    themes: ["城市观察", "北京朝阳CBD", "压迫感", "真实生活"],
    hook: "一座城市什么时候最让你有压迫感",
    difference: "TA 对空间和建筑更敏感，你更容易从人和情绪进入。",
    activity: "3 小时前在线",
  },
];

const huntSignals = [
  {
    id: "slow-city",
    title: "在上海，找一个周末能一起散步，也愿意认真聊点什么的人",
    intent: "搭子",
    place: "上海",
    expires: "还会运行 6 天",
    tags: ["城市散步", "真实生活", "认真聊天"],
    peopleIds: ["momo", "mina", "nuonuo"],
    newCount: 3,
    mutualId: "momo",
    mutualCopy: "她也想认识一个不赶时间、愿意边走边聊的人",
  },
  {
    id: "weekend-ball",
    title: "找周末愿意上场，也爱拆篮球细节的人",
    intent: "搭子",
    place: "上海",
    expires: "还会运行 4 天",
    tags: ["篮球", "训练方法", "周末运动"],
    peopleIds: ["ayuan", "yubai", "linjian"],
    newCount: 1,
    mutualId: "ayuan",
    mutualCopy: "他也在找一个能聊球、偶尔一起上场的人",
  },
  {
    id: "deep-talk",
    title: "想认识能聊长期主义，也能谈真实生活的人",
    intent: "朋友",
    place: "不限城市",
    expires: "还会运行 7 天",
    tags: ["长期主义", "人物自传", "自我成长"],
    peopleIds: ["mina", "xiyou", "shanzhu"],
    newCount: 2,
    mutualId: "mina",
    mutualCopy: "她最近也在找愿意把一个问题聊深一点的人",
  },
];

const starterMessages = {
  mina: [
    { type: "system", text: "你们因为都停在关系访谈和自我照顾类内容而认识" },
    { type: "them", text: "你也会把访谈留到晚上再认真看吗？" },
    { type: "me", text: "会，而且经常从一条短视频一路找到完整访谈。" },
  ],
  momo: [
    { type: "system", text: "默默对你喜欢的猫咪视频留了一个暗号" },
    { type: "them", text: "那句“把它丢出去”我真的看了三遍。" },
  ],
  ayuan: [
    { type: "system", text: "你们都喜欢篮球高光，但关注的细节不太一样" },
    { type: "them", text: "反向上篮那一下，你先看脚步还是终结？" },
  ],
};

const state = {
  activeTab: "discover",
  index: 0,
  reactions: [],
  profile: null,
  profileReady: false,
  matchIndex: 0,
  selectedHuntId: "slow-city",
  unseenHuntCount: 3,
  draftHuntIntent: "搭子",
  draftHuntPlace: "上海",
  editingHunt: false,
  selectedMatchId: null,
  inviteCount: 0,
  likedContent: new Set(),
  likedPeople: new Set(),
  messages: cloneMessages(starterMessages),
  events: [],
  animating: false,
  touchStart: null,
  skipTapUntil: 0,
  lastTapAt: 0,
  toastTimer: null,
};

const appEl = document.querySelector("#app");
const contentCardEl = document.querySelector("#contentCard");
const heartBurstEl = document.querySelector("#heartBurst");
const replySheetEl = document.querySelector("#replySheet");
const replyInputEl = document.querySelector("#replyInput");
const toastEl = document.querySelector("#toast");
const tabButtons = [...document.querySelectorAll("[data-tab]")];

function cloneMessages(source) {
  return Object.fromEntries(
    Object.entries(source).map(([key, value]) => [key, value.map((message) => ({ ...message }))]),
  );
}

function refreshIcons() {
  if (!window.lucide) return;
  window.lucide.createIcons();
  document.documentElement.classList.add("icons-ready");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function logEvent(type, payload = {}) {
  state.events.push({ type, payload, timestamp: new Date().toISOString() });
}

function uniqueReactionCount() {
  return new Set(state.reactions.map((item) => item.cardId)).size;
}

function currentCard() {
  return contentCards[state.index % contentCards.length];
}

function findPerson(id) {
  return people.find((person) => person.id === id) || people[0];
}

function getWeightedTags() {
  const weights = {};
  const reactionWeights = { want_to_talk: 3, like: 2, neutral: 0, dislike: -2 };

  state.reactions.forEach((reaction) => {
    const card = contentCards.find((item) => item.id === reaction.cardId);
    if (!card) return;
    card.tags.forEach((tag) => {
      weights[tag] = (weights[tag] || 0) + reactionWeights[reaction.reaction];
    });
  });

  return weights;
}

function rankedTags() {
  return Object.entries(getWeightedTags())
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

function renderSignals() {
  const topSignals = Object.entries(getWeightedTags())
    .filter(([, weight]) => weight > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  const signalList = document.querySelector("#signalList");
  const signalCount = document.querySelector("#desktopSignalCount");

  signalCount.textContent = `${uniqueReactionCount()} 个信号`;
  signalList.innerHTML = topSignals.length
    ? topSignals
        .map(
          ([tag], index) =>
            `<span class="${index === 0 ? "is-leading" : ""}">${escapeHtml(tag)}</span>`,
        )
        .join("")
    : "<span>开始刷内容后生成</span>";
}

function renderContent() {
  const card = currentCard();
  const progress = Math.min(uniqueReactionCount(), 6);
  const progressPercent = Math.round((progress / 6) * 100);
  const creatorLetter = card.creator.replace("@", "").charAt(0) || "暗";
  const liked = state.likedContent.has(card.id);

  contentCardEl.innerHTML = `
    <div class="content-media" style="--content-visual:${card.visual}">
      <img class="content-cover" src="${card.cover}" alt="" aria-hidden="true" decoding="async" onerror="this.hidden=true">
      <span class="media-watermark"><i data-lucide="play"></i><span class="icon-fallback">▶</span> 来自真实抖音内容</span>
    </div>

    <div class="signal-progress" aria-label="暗号清晰度 ${progress} / 6">
      <b>${progress < 6 ? `暗号 ${progress}/6` : "暗号已形成"}</b>
      <span class="signal-progress-track"><span style="width:${progressPercent}%"></span></span>
    </div>

    <div class="content-actions" aria-label="内容互动">
      <button class="creator-avatar" type="button" aria-label="查看 ${escapeHtml(card.creator)}">${escapeHtml(creatorLetter)}</button>
      <button class="feed-action ${liked ? "is-liked" : ""}" data-content-action="like" type="button" aria-label="喜欢这条内容">
        <i data-lucide="heart"></i><span class="icon-fallback">♥</span>
        <b>${escapeHtml(card.likes)}</b>
      </button>
      <button class="feed-action feed-action-primary" data-content-action="reply" type="button" aria-label="给这条内容留暗号">
        <span class="feed-action-icon"><i data-lucide="message-circle-heart"></i><span class="icon-fallback">聊</span></span>
        <b>留暗号</b>
      </button>
      <button class="feed-action" data-content-action="dislike" type="button" aria-label="不喜欢这条内容">
        <i data-lucide="eye-off"></i><span class="icon-fallback">略</span>
        <b>不合</b>
      </button>
    </div>

    <div class="content-caption">
      <div class="content-creator">
        <span>${escapeHtml(card.creator)}</span>
        <span class="source-badge">${escapeHtml(card.format)}</span>
      </div>
      <h2>${escapeHtml(card.title)}</h2>
      <p>${escapeHtml(card.caption)}</p>
      <div class="content-tags">${card.tags.map((tag) => `<span>#${escapeHtml(tag)}</span>`).join("")}</div>
      <div class="content-social-proof">
        <div class="avatar-stack" aria-hidden="true">
          <span style="--avatar-bg:${people[0].bg}">${people[0].initials}</span>
          <span style="--avatar-bg:${people[2].bg}">${people[2].initials}</span>
          <span style="--avatar-bg:${people[4].bg}">${people[4].initials}</span>
        </div>
        <p><strong>${card.peers} 位同频的人</strong><br />也在这条内容前停下来</p>
      </div>
    </div>

    <a class="original-link" href="${card.douyinUrl}" target="_blank" rel="noopener noreferrer" aria-label="在抖音打开原内容">
      <i data-lucide="external-link"></i><span class="icon-fallback">↗</span>
      <span>原视频</span>
    </a>
  `;

  renderSignals();
  refreshIcons();
}

function profileFromSignals() {
  const tags = rankedTags();
  const has = (needles) => tags.some((tag) => needles.some((needle) => tag.includes(needle)));
  const hasSports = has(["篮球", "运动", "训练"]);
  const hasKnowledge = has(["科普", "自传", "成长", "长期"]);
  const hasTenderness = has(["养育", "亲密关系", "自我照顾"]);
  const hasAnimal = has(["猫咪", "动物"]);
  const hasCity = has(["城市", "北京", "压迫感"]);
  const hasMeme = has(["BGM", "互联网梗", "笑点", "幽默"]);
  const hasIdealism = has(["理想主义", "未来想象", "燃向"]);
  let vibeName = "轻松同频观察型";

  if (hasSports) vibeName = "球场反应型";
  else if (hasKnowledge) vibeName = "知识咀嚼型";
  else if (hasTenderness) vibeName = "温柔内省型";
  else if (hasIdealism) vibeName = "燃向理想型";
  else if (hasAnimal) vibeName = "毛茸茸雷达型";
  else if (hasCity) vibeName = "城市夜游型";

  const firstSentence = hasSports
    ? "你会被身体反应、技术细节和临场判断吸引，喜欢看见一个动作背后的训练逻辑。"
    : hasKnowledge
      ? "你会被人物经历、知识解释和长期主义吸引，习惯把短视频当成观察世界的入口。"
      : hasTenderness
        ? "你对关系、养育和自我照顾更敏感，容易被有真实经验、不过度说教的人打动。"
        : hasAnimal
          ? "你会被毛茸茸的真实瞬间和轻松日常击中，内容偏好里有很强的陪伴感。"
          : hasCity
            ? "你容易被城市里的具体细节、空间情绪和不太用力的表达吸引。"
            : "你更在意内容里的真实感，以及一件小事能不能自然聊起来。";
  const secondSentence = hasMeme
    ? "BGM、反差和生活笑点是你的低压力破冰入口。"
    : hasIdealism
      ? "你也会为未来想象和理想主义停下来，不只是在找消遣。"
      : "比起完整的自我介绍，你更愿意从一个具体内容开始认识人。";

  return {
    vibeName,
    summary: `${firstSentence}${secondSentence}`,
    themes: tags.length ? tags.slice(0, 6) : ["真实生活", "轻松聊天", "城市散步"],
    hooks: [
      tags[0] ? `为什么会喜欢「${tags[0]}」这类内容` : "最近刷到最想转给朋友的一条视频",
      hasSports
        ? "你看球时最容易被哪个动作点燃"
        : hasKnowledge
          ? "最近哪本书或哪段访谈让你停下来"
          : hasTenderness
            ? "一个人什么时候最需要先照顾自己"
            : hasAnimal
              ? "哪种动物瞬间最能治好你的一天"
              : "一个人散步时会听什么",
      hasMeme ? "最近一个只有同频的人才能接住的梗" : "什么样的周末会让你觉得刚刚好",
    ],
  };
}

function updateProfile() {
  state.profile = profileFromSignals();
  return state.profile;
}

function scorePerson(person) {
  const profile = state.profile || updateProfile();
  const userThemes = new Set(profile.themes);
  const shared = person.themes.filter((theme) => userThemes.has(theme));
  const signalBonus = Math.min(uniqueReactionCount(), 6) * 2;
  return Math.min(96, 68 + shared.length * 5 + signalBonus + Math.min(state.inviteCount, 2) * 2);
}

function rankedPeople() {
  return people
    .map((person) => ({ person, score: scorePerson(person) }))
    .sort((a, b) => b.score - a.score);
}

function sharedThemes(person) {
  const profile = state.profile || updateProfile();
  const shared = person.themes.filter((theme) => profile.themes.includes(theme));
  return shared.length ? shared : person.themes.slice(0, 2);
}

function matchReason(person) {
  const shared = sharedThemes(person);
  return `你们都在「${shared.join("、")}」上停下来。${person.difference}`;
}

function activeHuntSignal() {
  return huntSignals.find((signal) => signal.id === state.selectedHuntId) || huntSignals[0];
}

function huntPersonReason(signal, person) {
  const overlaps = person.themes.filter((theme) => signal.tags.includes(theme));
  const themes = overlaps.length ? overlaps : sharedThemes(person).slice(0, 2);
  return `你们都在「${themes.join("、")}」上有明显信号。${person.difference}`;
}

function renderHuntResults(signal) {
  const results = document.querySelector("#signalResults");
  results.innerHTML = signal.peopleIds
    .map((personId, index) => {
      const person = findPerson(personId);
      const isMutual = person.id === signal.mutualId;
      const hasReplied = state.likedPeople.has(person.id);
      const freshLabel = index === 0 ? "刚刚找到" : index === 1 ? "今天新增" : "新出现";
      const action = isMutual
        ? `<button class="signal-person-action is-mutual" data-person-chat="${person.id}" type="button">开始聊</button>`
        : `<button class="signal-person-action ${hasReplied ? "is-waiting" : ""}" data-signal-reply="${person.id}" type="button" ${hasReplied ? "disabled" : ""}>${hasReplied ? "等待回应" : "发出回应"}</button>`;

      return `
        <article class="signal-person-card ${isMutual ? "has-mutual" : ""}">
          <div class="signal-person-avatar" style="--person-bg:${person.bg}">
            <span>${person.initials}</span>
            <small>${freshLabel}</small>
          </div>
          <div class="signal-person-content">
            <div class="signal-person-heading">
              <span><strong>${escapeHtml(person.name)}，${person.age}</strong><small>${escapeHtml(person.city)} · ${escapeHtml(person.activity)}</small></span>
              <b>${scorePerson(person)}%</b>
            </div>
            <p>${escapeHtml(person.bio)}</p>
            <div class="signal-match-reason">
              <i data-lucide="sparkles"></i><span class="icon-fallback">✦</span>
              <span>${escapeHtml(isMutual ? signal.mutualCopy : huntPersonReason(signal, person))}</span>
            </div>
            <footer>
              <span>${isMutual ? "双方暗号已接上" : "只有双方回应后才会进入消息"}</span>
              ${action}
            </footer>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderSavedSignals(active) {
  document.querySelector("#savedSignalList").innerHTML = huntSignals
    .filter((signal) => signal.id !== active.id)
    .map(
      (signal) => `
        <button class="saved-signal" data-hunt-id="${signal.id}" type="button">
          <span class="saved-signal-icon"><i data-lucide="radio"></i><span class="icon-fallback">◎</span></span>
          <span>
            <strong>${escapeHtml(signal.title)}</strong>
            <small>${escapeHtml(signal.intent)} · ${escapeHtml(signal.place)} · 正在寻找</small>
          </span>
          <b>${signal.newCount} 新</b>
          <i data-lucide="chevron-right"></i><span class="icon-fallback">›</span>
        </button>
      `,
    )
    .join("");
}

function renderMatches() {
  updateProfile();
  const signal = activeHuntSignal();
  const signalPeople = signal.peopleIds.map(findPerson);
  const unseen = state.unseenHuntCount;

  document.querySelector("#activeSignalTitle").textContent = signal.title;
  document.querySelector("#activeSignalMeta").textContent = `${signal.intent} · ${signal.place} · ${signal.expires}`;
  document.querySelector("#activeSignalTags").innerHTML = signal.tags
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  document.querySelector("#huntAvatarStack").innerHTML = signalPeople
    .slice(0, 3)
    .map(
      (person) => `<span style="--person-bg:${person.bg}" title="${escapeHtml(person.name)}">${person.initials}</span>`,
    )
    .join("");
  document.querySelector("#huntFoundTitle").textContent = unseen ? `今天找到 ${signal.newCount} 位` : "本次新增已看完";
  document.querySelector("#huntFoundCopy").textContent = unseen
    ? "其中 1 位也在寻找你这样的人"
    : "暗号仍在运行，有新人时会提醒你";
  document.querySelector("#seeFreshBtn").textContent = unseen ? "看新的" : "已看完";
  document.querySelector("#seeFreshBtn").disabled = !unseen;
  const badge = document.querySelector("#signalTabBadge");
  badge.textContent = String(unseen || signal.newCount);
  badge.classList.toggle("is-hidden", !unseen);

  renderHuntResults(signal);
  renderSavedSignals(signal);
  refreshIcons();
}

function renderNewSignals() {
  const rail = document.querySelector("#newSignalsRail");
  rail.innerHTML = people
    .slice(0, 5)
    .map(
      (person) => `
        <button class="signal-person" data-person-id="${person.id}" type="button" aria-label="查看 ${escapeHtml(person.name)} 的暗号">
          <span class="signal-person-avatar" style="--person-bg:${person.bg}">${person.initials}</span>
          <span class="signal-person-badge"><i data-lucide="heart"></i><span class="icon-fallback">♥</span></span>
          <span>${escapeHtml(person.name)}</span>
        </button>
      `,
    )
    .join("");
}

function conversationPreview(person) {
  const messages = state.messages[person.id] || [];
  const latest = [...messages].reverse().find((message) => message.type !== "system");
  return latest?.text || `你们在「${sharedThemes(person)[0]}」上同频，打个招呼吧`;
}

function renderConversationList() {
  const list = document.querySelector("#conversationList");
  const order = ["mina", "momo", "ayuan", "shanzhu", "yubai", "linjian"];
  list.innerHTML = order
    .map((id, index) => {
      const person = findPerson(id);
      const unread = index < 2 ? index + 1 : 0;
      return `
        <button class="conversation-row" data-person-id="${person.id}" type="button">
          <span class="conversation-avatar ${index < 3 ? "is-online" : ""}" style="--person-bg:${person.bg}">${person.initials}</span>
          <span class="conversation-meta">
            <strong>${escapeHtml(person.name)}</strong>
            <span>${escapeHtml(conversationPreview(person))}</span>
          </span>
          <span class="conversation-side">
            <time>${index === 0 ? "刚刚" : index === 1 ? "12:48" : "昨天"}</time>
            ${unread ? `<b class="unread-dot">${unread}</b>` : ""}
          </span>
        </button>
      `;
    })
    .join("");
}

function renderThread() {
  const thread = document.querySelector("#chatThread");
  const home = document.querySelector("#inboxHome");
  if (!state.selectedMatchId) {
    appEl.classList.remove("is-chat-open");
    thread.hidden = true;
    home.hidden = false;
    return;
  }

  appEl.classList.add("is-chat-open");
  const person = findPerson(state.selectedMatchId);
  const messages = state.messages[person.id] || [];
  const shared = sharedThemes(person);
  home.hidden = true;
  thread.hidden = false;
  document.querySelector("#chatIdentity").innerHTML = `
    <span class="chat-identity-avatar" style="--person-bg:${person.bg}">${person.initials}</span>
    <span><strong>${escapeHtml(person.name)}</strong><span>${escapeHtml(person.activity)}</span></span>
  `;
  document.querySelector("#chatContext").innerHTML = `
    <span class="chat-context-thumb" style="--person-bg:${person.bg}">${person.initials}</span>
    <span><strong>你们共同停下来的内容</strong><span>${escapeHtml(shared.join("、"))} · ${escapeHtml(person.hook)}</span></span>
    <i data-lucide="chevron-right"></i><span class="icon-fallback">›</span>
  `;
  document.querySelector("#messageList").innerHTML = messages.length
    ? messages.map((message) => `<div class="message ${message.type}">${escapeHtml(message.text)}</div>`).join("")
    : `<div class="message system">你们因为都喜欢「${escapeHtml(shared[0])}」而被推荐到一起</div>`;
  document.querySelector("#icebreakers").innerHTML = [
    person.hook,
    `你也会收藏「${shared[0]}」吗？`,
    "这条我差点转给朋友",
  ]
    .map((text) => `<button class="icebreaker" type="button">${escapeHtml(text)}</button>`)
    .join("");
  document.querySelector("#chatInput").value = "";
  refreshIcons();
  requestAnimationFrame(() => {
    const list = document.querySelector("#messageList");
    list.scrollTop = list.scrollHeight;
  });
}

function renderInbox() {
  updateProfile();
  renderNewSignals();
  renderConversationList();
  renderThread();
  refreshIcons();
}

function renderProfile() {
  const profile = updateProfile();
  const count = uniqueReactionCount();
  const confidence = Math.min(96, count ? 34 + count * 10 : 18);
  const positives = state.reactions
    .filter((reaction) => ["like", "want_to_talk"].includes(reaction.reaction))
    .slice(-6)
    .reverse();

  document.querySelector("#profileVibeName").textContent = count ? profile.vibeName : "暗号正在形成";
  document.querySelector("#profileSignalStat").textContent = count;
  document.querySelector("#profileMatchStat").textContent = Math.min(people.length, 3 + state.inviteCount * 2);
  document.querySelector("#profileInviteStat").textContent = state.inviteCount;
  document.querySelector("#profileConfidence").textContent = `${confidence}%`;
  document.querySelector("#vibeName").textContent = count ? profile.vibeName : "再刷几条，让我先认识你";
  document.querySelector("#vibeSummary").textContent = count
    ? profile.summary
    : "你不需要填写冗长资料。每一次停留、喜欢和想聊，都会让这张卡更像你。";
  document.querySelector("#themePills").innerHTML = profile.themes
    .slice(0, count ? 6 : 3)
    .map((tag) => `<span>${escapeHtml(tag)}</span>`)
    .join("");
  document.querySelector("#tasteProgressBar").style.width = `${Math.min(100, (count / 6) * 100)}%`;
  document.querySelector("#hooksList").innerHTML = profile.hooks
    .map(
      (hook, index) => `
        <article class="profile-prompt">
          <small>${["最容易聊起来的内容", "一个可以直接问我的问题", "只有同频的人会懂"][index]}</small>
          <p>${escapeHtml(hook)}</p>
          <button type="button" aria-label="喜欢这条个人暗号"><i data-lucide="heart"></i><span class="icon-fallback">♥</span></button>
        </article>
      `,
    )
    .join("");
  document.querySelector("#tasteGrid").innerHTML = positives.length
    ? positives
        .map((reaction) => {
          const card = contentCards.find((item) => item.id === reaction.cardId);
          return `
            <button class="taste-tile" data-content-id="${card.id}" type="button" style="--content-visual:${card.visual}">
              <img src="${card.cover}" alt="" aria-hidden="true" loading="lazy" onerror="this.hidden=true">
              <span>${escapeHtml(card.title)}</span>
            </button>
          `;
        })
        .join("")
    : `<div class="taste-empty">双击喜欢的内容，它会出现在这里</div>`;

  refreshIcons();
}

function renderAllSecondaryViews() {
  renderMatches();
  renderInbox();
  renderProfile();
}

function showTab(tabName) {
  state.activeTab = tabName;
  appEl.scrollTop = 0;
  appEl.classList.toggle("is-chat-open", tabName === "inbox" && Boolean(state.selectedMatchId));
  appEl.dataset.activeTab = tabName;
  document.querySelectorAll("[data-view]").forEach((view) => {
    view.classList.toggle("is-active", view.dataset.view === tabName);
  });
  tabButtons.forEach((button) => {
    button.classList.toggle("is-active", button.dataset.tab === tabName);
  });

  if (tabName === "discover") renderContent();
  if (tabName === "matches") renderMatches();
  if (tabName === "inbox") renderInbox();
  if (tabName === "profile") {
    state.profileReady = false;
    document.querySelector("#profileTabDot").classList.remove("is-visible");
    renderProfile();
  }

  const activeView = document.querySelector(`[data-view="${tabName}"]`);
  if (activeView && tabName !== "discover") activeView.scrollTop = 0;
  requestAnimationFrame(() => {
    appEl.scrollTop = 0;
  });
  logEvent("tab_opened", { tab: tabName });
}

function reactionMessage(reaction) {
  if (reaction === "like") return "喜欢已记住，暗号更清晰了一点";
  if (reaction === "dislike") return "收到，这类内容会少一点";
  if (reaction === "want_to_talk") return "暗号已留下，会优先匹配能接住它的人";
  return "已换一条";
}

function handleReaction(reaction, options = {}) {
  if (state.animating) return;
  const card = currentCard();
  const previousCount = uniqueReactionCount();
  const existingIndex = state.reactions.findIndex((item) => item.cardId === card.id);
  const record = {
    cardId: card.id,
    reaction,
    note: options.note || "",
    timestamp: new Date().toISOString(),
  };

  if (existingIndex >= 0) state.reactions[existingIndex] = record;
  else state.reactions.push(record);

  if (["like", "want_to_talk"].includes(reaction)) state.likedContent.add(card.id);
  if (reaction === "dislike") state.likedContent.delete(card.id);
  updateProfile();
  const nextCount = uniqueReactionCount();
  if (previousCount < 6 && nextCount >= 6) {
    state.profileReady = true;
    document.querySelector("#profileTabDot").classList.add("is-visible");
    showToast("你的第一版暗号卡已经形成");
  } else {
    showToast(reactionMessage(reaction));
  }

  logEvent("content_reaction", { cardId: card.id, reaction, note: options.note || "" });
  renderAllSecondaryViews();
  animateToNextCard();
}

function animateToNextCard() {
  state.animating = true;
  contentCardEl.classList.add("is-leaving");
  window.setTimeout(() => {
    state.index = (state.index + 1) % contentCards.length;
    contentCardEl.classList.remove("is-leaving");
    state.animating = false;
    renderContent();
  }, 190);
}

function showHeartBurst() {
  heartBurstEl.classList.remove("is-visible");
  void heartBurstEl.offsetWidth;
  heartBurstEl.classList.add("is-visible");
}

function openReplySheet() {
  const card = currentCard();
  const suggestions = [
    `你也会收藏「${card.tags[0]}」吗？`,
    "这条我差点转给朋友",
    "你被哪一秒戳中了？",
  ];

  document.querySelector("#replyContentPreview").innerHTML = `
    <span class="reply-preview-thumb" style="--content-visual:${card.visual}"></span>
    <span><strong>${escapeHtml(card.title)}</strong><span>${escapeHtml(card.creator)} · ${escapeHtml(card.format)}</span></span>
  `;
  document.querySelector("#replySuggestions").innerHTML = suggestions
    .map((suggestion) => `<button class="reply-suggestion" type="button">${escapeHtml(suggestion)}</button>`)
    .join("");
  replyInputEl.value = "";
  replySheetEl.classList.add("is-open");
  replySheetEl.setAttribute("aria-hidden", "false");
  refreshIcons();
  window.setTimeout(() => replyInputEl.focus(), 220);
  logEvent("reply_sheet_opened", { cardId: card.id });
}

function closeReplySheet() {
  replySheetEl.classList.remove("is-open");
  replySheetEl.setAttribute("aria-hidden", "true");
}

function setHuntChoice(selector, value) {
  document.querySelectorAll(selector).forEach((button) => {
    const selectedValue = button.dataset.huntIntent || button.dataset.huntPlace;
    button.classList.toggle("is-active", selectedValue === value);
  });
}

function openHuntSheet(editing = false) {
  const signal = activeHuntSignal();
  state.editingHunt = editing;
  state.draftHuntIntent = editing ? signal.intent : "搭子";
  state.draftHuntPlace = editing ? signal.place : "上海";
  document.querySelector("#huntSheetTitle").textContent = editing ? "调整这条暗号" : "你现在想认识谁？";
  document.querySelector("#huntInput").value = editing
    ? signal.title
    : "在上海，找一个周末能一起散步，也愿意认真聊点什么的人";
  document.querySelector(".hunt-submit").textContent = editing ? "保存并继续寻找" : "让暗号开始寻找";
  setHuntChoice("[data-hunt-intent]", state.draftHuntIntent);
  setHuntChoice("[data-hunt-place]", state.draftHuntPlace);
  const sheet = document.querySelector("#huntSheet");
  sheet.classList.add("is-open");
  sheet.setAttribute("aria-hidden", "false");
  refreshIcons();
  window.setTimeout(() => document.querySelector("#huntInput").focus(), 220);
  logEvent("hunt_sheet_opened", { editing });
}

function closeHuntSheet() {
  const sheet = document.querySelector("#huntSheet");
  sheet.classList.remove("is-open");
  sheet.setAttribute("aria-hidden", "true");
}

function saveHuntSignal() {
  const title = document.querySelector("#huntInput").value.trim();
  if (!title) {
    document.querySelector("#huntInput").focus();
    showToast("先说说你想认识怎样的人");
    return;
  }

  if (state.editingHunt) {
    const signal = activeHuntSignal();
    signal.title = title;
    signal.intent = state.draftHuntIntent;
    signal.place = state.draftHuntPlace;
    signal.expires = "重新运行 7 天";
    state.unseenHuntCount = signal.newCount;
    logEvent("hunt_updated", { signalId: signal.id });
  } else {
    const id = `custom-${Date.now()}`;
    if (huntSignals.length >= 3) huntSignals.pop();
    huntSignals.unshift({
      id,
      title,
      intent: state.draftHuntIntent,
      place: state.draftHuntPlace,
      expires: "刚刚开始 · 运行 7 天",
      tags: rankedTags().slice(0, 3).length ? rankedTags().slice(0, 3) : ["真实生活", "轻松聊天", "好奇心"],
      peopleIds: rankedPeople().slice(0, 3).map(({ person }) => person.id),
      newCount: 4,
      mutualId: rankedPeople()[0].person.id,
      mutualCopy: "TA 的当前暗号与你的寻找方向正好重叠",
    });
    state.selectedHuntId = id;
    state.unseenHuntCount = 4;
    logEvent("hunt_created", { signalId: id });
  }

  closeHuntSheet();
  renderMatches();
  showToast(state.editingHunt ? "暗号已调整，继续替你寻找" : "暗号已经开始寻找");
}

function openChat(personId) {
  state.selectedMatchId = personId;
  if (!state.messages[personId]) state.messages[personId] = [];
  showTab("inbox");
  renderThread();
  logEvent("conversation_opened", { personId });
}

function sendMessage(text) {
  const cleaned = text.trim();
  if (!cleaned || !state.selectedMatchId) return;
  if (!state.messages[state.selectedMatchId]) state.messages[state.selectedMatchId] = [];
  state.messages[state.selectedMatchId].push({ type: "me", text: cleaned });
  logEvent("message_sent", { personId: state.selectedMatchId, text: cleaned });
  renderThread();
  showToast("消息已发出（原型演示）");
}

function shareText() {
  const profile = state.profile || updateProfile();
  return `我在「暗号」刷出了自己的同频暗号：${profile.vibeName}。${profile.summary} 你也来测一下，看看我们是不是同频。`;
}

async function copyText(text, eventName) {
  try {
    await navigator.clipboard.writeText(text);
    logEvent(eventName, { ok: true });
    return true;
  } catch (error) {
    const input = document.createElement("textarea");
    input.value = text;
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    const copied = document.execCommand("copy");
    input.remove();
    logEvent(eventName, { ok: copied, reason: error.message });
    return copied;
  }
}

function showToast(message) {
  window.clearTimeout(state.toastTimer);
  toastEl.textContent = message;
  toastEl.classList.add("is-visible");
  state.toastTimer = window.setTimeout(() => toastEl.classList.remove("is-visible"), 1800);
}

function simulateInvite() {
  if (state.inviteCount >= 2) {
    showToast("完整同频池已经解锁");
    return;
  }
  state.inviteCount += 1;
  copyText(shareText(), "invite_link_copied");
  renderMatches();
  renderProfile();
  showToast(`邀请文案已复制，演示进度 ${state.inviteCount}/2`);
  logEvent("invite_simulated", { inviteCount: state.inviteCount });
}

function exportResults() {
  const payload = {
    exportedAt: new Date().toISOString(),
    prototype: "暗号 social mobile MVP",
    reactions: state.reactions.map((reaction) => {
      const card = contentCards.find((item) => item.id === reaction.cardId);
      return { ...reaction, title: card?.title, tags: card?.tags };
    }),
    weightedTags: getWeightedTags(),
    profile: state.profile,
    activeHunt: activeHuntSignal(),
    huntSignals,
    inviteCount: state.inviteCount,
    likedPeople: [...state.likedPeople],
    selectedMatchId: state.selectedMatchId,
    events: state.events,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `anhao-social-mvp-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  showToast("内测数据已导出");
  logEvent("results_exported", { reactions: state.reactions.length });
}

function resetPrototype() {
  state.activeTab = "discover";
  state.index = 0;
  state.reactions = [];
  state.profile = null;
  state.profileReady = false;
  state.matchIndex = 0;
  state.selectedHuntId = "slow-city";
  state.unseenHuntCount = 3;
  state.draftHuntIntent = "搭子";
  state.draftHuntPlace = "上海";
  state.editingHunt = false;
  state.selectedMatchId = null;
  state.inviteCount = 0;
  state.likedContent = new Set();
  state.likedPeople = new Set();
  state.messages = cloneMessages(starterMessages);
  state.events = [];
  document.querySelector("#profileTabDot").classList.remove("is-visible");
  showTab("discover");
  renderAllSecondaryViews();
  showToast("已重新开始");
}

contentCardEl.addEventListener("click", (event) => {
  const action = event.target.closest("[data-content-action]")?.dataset.contentAction;
  if (action === "reply") openReplySheet();
  if (action === "like") {
    showHeartBurst();
    handleReaction("like");
  }
  if (action === "dislike") handleReaction("dislike");
});

contentCardEl.addEventListener(
  "touchstart",
  (event) => {
    const touch = event.changedTouches[0];
    state.touchStart = { x: touch.clientX, y: touch.clientY };
  },
  { passive: true },
);

contentCardEl.addEventListener(
  "touchend",
  (event) => {
    if (!state.touchStart || event.target.closest("button, a")) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - state.touchStart.x;
    const dy = touch.clientY - state.touchStart.y;
    state.touchStart = null;
    if (dy < -55 && Math.abs(dx) < 90) {
      state.skipTapUntil = Date.now() + 420;
      handleReaction("neutral");
    }
  },
  { passive: true },
);

contentCardEl.addEventListener("pointerup", (event) => {
  if (event.target.closest("button, a") || Date.now() < state.skipTapUntil) return;
  const now = Date.now();
  if (now - state.lastTapAt < 320) {
    state.lastTapAt = 0;
    showHeartBurst();
    handleReaction("like");
  } else {
    state.lastTapAt = now;
  }
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => showTab(button.dataset.tab));
});

document.querySelector("#discoverBrandBtn").addEventListener("click", () => showTab("profile"));
document.querySelector("#discoverProfileBtn").addEventListener("click", () => showTab("profile"));
document.querySelector("#createSignalBtn").addEventListener("click", () => openHuntSheet(false));
document.querySelector("#editSignalBtn").addEventListener("click", () => openHuntSheet(true));
document.querySelector("#seeFreshBtn").addEventListener("click", () => {
  state.unseenHuntCount = 0;
  renderMatches();
  document.querySelector("#freshPeopleSection").scrollIntoView({ behavior: "smooth", block: "start" });
  logEvent("fresh_hunt_results_opened", { signalId: state.selectedHuntId });
});
document.querySelector("#newMessageBtn").addEventListener("click", () => showTab("matches"));
document.querySelector("#profileMenuBtn").addEventListener("click", () => showToast("设置会在下一版接入"));
document.querySelector("#editProfileBtn").addEventListener("click", () => showToast("编辑暗号会在下一版接入"));
document.querySelector("#profileShareIcon").addEventListener("click", async () => {
  await copyText(shareText(), "profile_shared");
  showToast("主页分享文案已复制");
});
document.querySelector("#goDiscoverBtn").addEventListener("click", () => showTab("discover"));
document.querySelector("#savedSignalList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-hunt-id]");
  if (!button) return;
  state.selectedHuntId = button.dataset.huntId;
  state.unseenHuntCount = activeHuntSignal().newCount;
  renderMatches();
  document.querySelector("#viewMatches").scrollTo({ top: 0, behavior: "smooth" });
  logEvent("hunt_switched", { signalId: state.selectedHuntId });
});

document.querySelector("#signalResults").addEventListener("click", (event) => {
  const chatButton = event.target.closest("[data-person-chat]");
  if (chatButton) {
    openChat(chatButton.dataset.personChat);
    return;
  }
  const replyButton = event.target.closest("[data-signal-reply]");
  if (!replyButton) return;
  const person = findPerson(replyButton.dataset.signalReply);
  state.likedPeople.add(person.id);
  renderMatches();
  showToast(`回应已送达 ${person.name}，接上后会出现在消息里`);
  logEvent("hunt_response_sent", { signalId: state.selectedHuntId, personId: person.id });
});

document.querySelector("#huntIntentChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-hunt-intent]");
  if (!button) return;
  state.draftHuntIntent = button.dataset.huntIntent;
  setHuntChoice("[data-hunt-intent]", state.draftHuntIntent);
});

document.querySelector("#huntPlaceChoices").addEventListener("click", (event) => {
  const button = event.target.closest("[data-hunt-place]");
  if (!button) return;
  state.draftHuntPlace = button.dataset.huntPlace;
  setHuntChoice("[data-hunt-place]", state.draftHuntPlace);
});

document.querySelector("#huntForm").addEventListener("submit", (event) => {
  event.preventDefault();
  saveHuntSignal();
});

document.querySelectorAll("[data-close-hunt-sheet]").forEach((button) => {
  button.addEventListener("click", closeHuntSheet);
});

document.querySelector("#newSignalsRail").addEventListener("click", (event) => {
  const button = event.target.closest("[data-person-id]");
  if (button) openChat(button.dataset.personId);
});

document.querySelector("#conversationList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-person-id]");
  if (button) openChat(button.dataset.personId);
});

document.querySelector("#backToInboxBtn").addEventListener("click", () => {
  state.selectedMatchId = null;
  renderInbox();
});

document.querySelector("#icebreakers").addEventListener("click", (event) => {
  const button = event.target.closest(".icebreaker");
  if (!button) return;
  document.querySelector("#chatInput").value = button.textContent;
  document.querySelector("#chatInput").focus();
});

document.querySelector("#composerForm").addEventListener("submit", (event) => {
  event.preventDefault();
  sendMessage(document.querySelector("#chatInput").value);
});

document.querySelector("#tasteGrid").addEventListener("click", (event) => {
  const tile = event.target.closest("[data-content-id]");
  if (!tile) return;
  const index = contentCards.findIndex((card) => card.id === tile.dataset.contentId);
  if (index >= 0) state.index = index;
  showTab("discover");
});

document.querySelectorAll("[data-close-sheet]").forEach((button) => {
  button.addEventListener("click", closeReplySheet);
});

document.querySelector("#replySuggestions").addEventListener("click", (event) => {
  const button = event.target.closest(".reply-suggestion");
  if (!button) return;
  replyInputEl.value = button.textContent;
  replyInputEl.focus();
});

document.querySelector("#replyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const note = replyInputEl.value.trim();
  if (!note) {
    replyInputEl.focus();
    showToast("先留下一句话");
    return;
  }
  closeReplySheet();
  handleReaction("want_to_talk", { note });
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && replySheetEl.classList.contains("is-open")) closeReplySheet();
  if (event.key === "Escape" && document.querySelector("#huntSheet").classList.contains("is-open")) closeHuntSheet();
});

document.querySelector("#copyCardBtn").addEventListener("click", async () => {
  await copyText(shareText(), "profile_shared");
  showToast("主页分享文案已复制");
});

document.querySelector("#copyInviteBtn").addEventListener("click", simulateInvite);
document.querySelector("#regenerateBtn").addEventListener("click", () => {
  updateProfile();
  renderProfile();
  showToast("已根据最新信号重读一次");
});
document.querySelector("#exportBtn").addEventListener("click", exportResults);
document.querySelector("#resetBtn").addEventListener("click", resetPrototype);

renderContent();
renderAllSecondaryViews();
refreshIcons();
