// Deterministic safety rules for 暗号卡 text. Teasing is fine; hurting people is not.
const RULES = [
  { code: "sensitive_id", reason: "身份证号", pattern: /\b\d{17}[\dXx]\b|身份证/ },
  { code: "sensitive_phone", reason: "手机号或联系方式", pattern: /(?<!\d)1[3-9]\d{9}(?!\d)|微信号|加.{0,3}(微信|vx|v信)/i },
  { code: "sensitive_finance", reason: "银行卡、密码或财务信息", pattern: /(?<!\d)\d{16,19}(?!\d)|银行卡|卡号|密码|存款|工资|月薪|年薪|欠款|欠债|贷款|负债/ },
  { code: "sensitive_address", reason: "住址", pattern: /住址|家庭地址|门牌|\d+\s*号楼|\d+\s*单元|\d{2,4}\s*室|[路街道巷弄]\s*\d+\s*号/ },
  { code: "sensitive_health", reason: "健康或医疗信息", pattern: /病历|诊断|确诊|抑郁症|艾滋|HIV|癌症|精神病|住院|怀孕|流产|吃药/i },
  { code: "sexual", reason: "色情或性暗示", pattern: /色情|裸照|裸聊|约炮|做爱|性交|上床|性感照|胸部|下体|黄片|成人视频|性服务/ },
  { code: "insult", reason: "辱骂或羞辱", pattern: /傻[逼比b]|sb\b|废物|垃圾人|去死|滚蛋|贱人|婊|死胖子|丑八怪|脑残|智障|弱智|穷鬼|loser/i },
  { code: "violence", reason: "暴力威胁", pattern: /杀了你|弄死你|砍死你|人肉你|打死你/ },
  { code: "politics", reason: "政治内容", pattern: /习近平|共产党|台独|藏独|疆独|六四|法轮|民主运动|政府倒台|总书记|国家主席/ },
  { code: "gambling", reason: "赌博或诈骗", pattern: /博彩|赌博|刷单|返利群|先转账/ }
];

export function cardSafetyIssue(text) {
  const value = String(text || "");
  for (const rule of RULES) if (rule.pattern.test(value)) return { code: rule.code, reason: rule.reason };
  return null;
}
