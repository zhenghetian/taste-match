import { inspectAIConfig, resolveModel, resolveProvider } from "./llm/config.mjs";
import { transaction } from "./sql-transaction.mjs";

const limits = {
  timeoutMs: [1000, 60000], maxTokens: [256, 8192], concurrency: [1, 8],
  globalDailyLimit: [0, 10000], userDailyLimit: [0, 1000]
};
const instructions = ["icebreakerInstruction", "replyInstruction", "autoInstruction"];
const keys = ["enabled", "provider", "model", "allowAutoReply", ...Object.keys(limits), ...instructions];
const credentialPattern = /sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----/;
function error(message, status = 400, code = "INVALID_AGENT_CONFIG") {
  return Object.assign(new Error(message), { status, code });
}
function bounded(value, fallback, min, max) {
  const number = Number(value ?? fallback);
  return Number.isInteger(number) && number >= min && number <= max ? number : fallback;
}
function environmentSettings(env) {
  return {
    enabled: env.ANHAO_LLM_ENABLED === "true",
    provider: ["anthropic", "deepseek"].includes(resolveProvider(env)) ? resolveProvider(env) : "anthropic",
    model: resolveModel(env),
    allowAutoReply: env.ANHAO_LLM_AUTO_REPLY_ENABLED !== "false",
    timeoutMs: bounded(env.ANHAO_LLM_TIMEOUT_MS, 20000, ...limits.timeoutMs),
    maxTokens: bounded(env.ANHAO_LLM_MAX_TOKENS, 4096, ...limits.maxTokens),
    concurrency: bounded(env.ANHAO_LLM_CONCURRENCY, 2, ...limits.concurrency),
    globalDailyLimit: bounded(env.ANHAO_LLM_DAILY_LIMIT, 100, ...limits.globalDailyLimit),
    userDailyLimit: bounded(env.ANHAO_LLM_USER_DAILY_LIMIT, 10, ...limits.userDailyLimit),
    icebreakerInstruction: "", replyInstruction: "", autoInstruction: ""
  };
}
export function settingsEnvironment(settings, env = process.env) {
  return {
    ...env,
    ANHAO_LLM_ENABLED: String(settings.enabled), ANHAO_LLM_PROVIDER: settings.provider,
    ANHAO_LLM_MODEL: settings.model, ANHAO_LLM_AUTO_REPLY_ENABLED: String(settings.allowAutoReply),
    ANHAO_LLM_TIMEOUT_MS: String(settings.timeoutMs), ANHAO_LLM_MAX_TOKENS: String(settings.maxTokens),
    ANHAO_LLM_CONCURRENCY: String(settings.concurrency), ANHAO_LLM_DAILY_LIMIT: String(settings.globalDailyLimit),
    ANHAO_LLM_USER_DAILY_LIMIT: String(settings.userDailyLimit),
    ANHAO_LLM_ICEBREAKER_INSTRUCTION: settings.icebreakerInstruction,
    ANHAO_LLM_REPLY_INSTRUCTION: settings.replyInstruction,
    ANHAO_LLM_AUTO_INSTRUCTION: settings.autoInstruction
  };
}

export function createAgentConfigStore({ db, env = process.env }) {
  // Environment credentials and endpoints stay outside the persisted configuration.
  const baseEnv = { ...env };
  const defaults = environmentSettings(baseEnv);
  db.exec(`CREATE TABLE IF NOT EXISTS agent_config_revisions (
    revision INTEGER PRIMARY KEY AUTOINCREMENT, settings TEXT NOT NULL,
    reason TEXT NOT NULL, created_at TEXT NOT NULL, restored_from INTEGER
  )`);
  const latest = () => db.prepare("SELECT * FROM agent_config_revisions ORDER BY revision DESC LIMIT 1").get();
  if (!latest()) db.prepare("INSERT INTO agent_config_revisions(settings,reason,created_at) VALUES(?,?,?)")
    .run(JSON.stringify(defaults), "初始环境配置", new Date().toISOString());
  const parse = row => ({ revision: row.revision, settings: JSON.parse(row.settings), reason: row.reason, createdAt: row.created_at, restoredFrom: row.restored_from });
  function configuration(settings) {
    const config = inspectAIConfig(settingsEnvironment(settings, baseEnv));
    const issues = [...config.issues];
    if (settings.enabled && !config.credentialPresent && !issues.includes("missing_cloud_credential")) issues.push("missing_cloud_credential");
    return { configurationValid: !issues.length, issues, connectionVerified: false };
  }
  function snapshot() {
    const row = latest(), settings = JSON.parse(row.settings);
    return {
      revision: row.revision, settings, defaults: { ...defaults }, updatedAt: row.created_at,
      credentials: { anthropic: Boolean(baseEnv.ANTHROPIC_API_KEY || baseEnv.ANTHROPIC_AUTH_TOKEN), deepseek: Boolean(baseEnv.DEEPSEEK_API_KEY) },
      configuration: configuration(settings)
    };
  }
  function validate(settings) {
    const issues = [];
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) return { valid: false, issues: ["配置必须是对象"], configuration: null };
    if (Object.keys(settings).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(settings, key))) issues.push("配置字段不完整或包含不允许的字段");
    for (const name of ["enabled", "allowAutoReply"]) if (typeof settings[name] !== "boolean") issues.push(`${name} 必须是开关`);
    if (!["anthropic", "deepseek"].includes(settings.provider)) issues.push("请选择有效的模型供应商");
    if (typeof settings.model !== "string" || settings.model.length > 160 || (settings.model && !/^[A-Za-z0-9][A-Za-z0-9._:/\[\]-]*$/.test(settings.model)) || credentialPattern.test(settings.model || "")) issues.push("模型名称格式不正确");
    for (const [name, [min, max]] of Object.entries(limits)) if (!Number.isInteger(settings[name]) || settings[name] < min || settings[name] > max) issues.push(`${name} 必须是 ${min}–${max} 之间的整数`);
    for (const name of instructions) if (typeof settings[name] !== "string" || [...settings[name]].length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(settings[name]) || credentialPattern.test(settings[name])) issues.push(`${name} 最多 2000 字，且不能包含凭证或控制字符`);
    const config = issues.length ? null : configuration(settings);
    if (config && settings.enabled && !config.configurationValid) issues.push(...config.issues);
    return { valid: !issues.length, issues, configuration: config };
  }
  function write({ expectedRevision, settings, reason, restoredFrom = null }) {
    const result = validate(settings);
    if (!result.valid) throw error(result.issues.join("；"));
    if (typeof reason !== "string" || !reason.trim() || reason.trim().length > 300 || credentialPattern.test(reason) || /[\u0000-\u001f\u007f]/.test(reason)) throw error("请填写 1–300 字的修改原因，不能包含凭证或控制字符");
    if (!Number.isInteger(expectedRevision)) throw error("请提供当前配置版本");
    transaction(db, () => {
      if (latest().revision !== expectedRevision) throw error("配置已被其他窗口更新，请重新加载后再修改", 409, "CONFIG_CONFLICT");
      db.prepare("INSERT INTO agent_config_revisions(settings,reason,created_at,restored_from) VALUES(?,?,?,?)")
        .run(JSON.stringify(Object.fromEntries(keys.map(key => [key, settings[key]]))), reason.trim(), new Date().toISOString(), restoredFrom);
    });
    return snapshot();
  }
  return {
    snapshot, validate,
    save: ({ expectedRevision, settings, reason }) => write({ expectedRevision, settings, reason }),
    rollback({ expectedRevision, revision, reason }) {
      if (!Number.isInteger(revision)) throw error("请选择有效的历史版本");
      const row = db.prepare("SELECT * FROM agent_config_revisions WHERE revision=?").get(revision);
      if (!row) throw error("历史版本不存在", 404, "CONFIG_REVISION_NOT_FOUND");
      return write({ expectedRevision, settings: JSON.parse(row.settings), reason, restoredFrom: revision });
    },
    history: () => db.prepare("SELECT * FROM agent_config_revisions ORDER BY revision DESC LIMIT 100").all().map(parse),
    runtimeEnv: () => settingsEnvironment(JSON.parse(latest().settings), baseEnv)
  };
}
