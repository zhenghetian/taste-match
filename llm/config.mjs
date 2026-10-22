import { isIP } from "node:net";

export function resolveProvider(env = process.env) {
  return env.ANHAO_LLM_PROVIDER || "anthropic";
}

export function resolveModel(env = process.env) {
  if (resolveProvider(env) === "deepseek") return env.ANHAO_LLM_MODEL || "deepseek-flash";
  return env.ANHAO_LLM_MODEL || (env.ANTHROPIC_BASE_URL && env.ANTHROPIC_DEFAULT_OPUS_MODEL) || "claude-opus-5-5";
}

export function resolveEndpoint(env = process.env) {
  return resolveProvider(env) === "deepseek" ? "https://api.deepseek.com/anthropic" : env.ANTHROPIC_BASE_URL || "https://api.anthropic.com";
}

export function useServerFallbacks(env = process.env) {
  if (resolveProvider(env) === "deepseek") return false;
  const official = new URL(resolveEndpoint(env)).hostname === "api.anthropic.com";
  return env.ANHAO_LLM_SERVER_FALLBACKS === "true" || (official && env.ANHAO_LLM_SERVER_FALLBACKS !== "false");
}

export function thinkingOptions(env = process.env) {
  return resolveProvider(env) === "deepseek"
    ? { thinking: { type: "disabled" } }
    : { thinking: { type: "adaptive" }, output_config: { effort: "low" } };
}

function localHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (isIP(host) === 6) {
    if (host.startsWith("::ffff:")) {
      const tail = host.slice(7);
      if (isIP(tail) === 4) return localHost(tail);
      const [high, low] = tail.split(":").map((part) => parseInt(part, 16));
      return localHost(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return host === "::" || host === "::1" || /^(?:fc|fd|fe[89ab])/i.test(host);
  }
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || !host.includes(".")) return true;
  if (isIP(host) === 4) {
    const [a, b] = host.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
  }
  return false;
}

export function inspectAIConfig(env = process.env, { cloud = env.NODE_ENV === "production" } = {}) {
  const issues = [];
  const provider = resolveProvider(env);
  if (!["anthropic", "deepseek"].includes(provider)) issues.push("invalid_provider");
  let endpoint;
  try {
    endpoint = new URL(resolveEndpoint(env));
    if (!["http:", "https:"].includes(endpoint.protocol) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error();
  } catch { issues.push("invalid_endpoint"); endpoint = undefined; }
  const localEndpoint = endpoint ? localHost(endpoint.hostname) : false;
  if (cloud && localEndpoint) issues.push("local_endpoint");
  if (cloud && endpoint && endpoint.protocol !== "https:") issues.push("https_required");
  const credentialPresent = Boolean(provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  if ((cloud || provider === "deepseek") && !credentialPresent) issues.push("missing_cloud_credential");
  return {
    provider,
    enabled: env.ANHAO_LLM_ENABLED === "true",
    model: resolveModel(env),
    endpointHost: endpoint?.hostname || "invalid-url",
    localEndpoint,
    credentialPresent,
    cloud,
    configurationValid: issues.length === 0,
    connectionVerified: false,
    issues
  };
}

export function anthropicOptions(env = process.env) {
  const config = inspectAIConfig(env);
  // Local SDK profiles remain available in development; a cloud service needs its own credentials.
  if (!config.configurationValid) throw new Error("invalid_configuration");
  return {
    maxRetries: 0,
    baseURL: resolveEndpoint(env),
    apiKey: config.provider === "deepseek" ? env.DEEPSEEK_API_KEY : env.ANTHROPIC_API_KEY || null,
    authToken: config.provider === "deepseek" ? null : env.ANTHROPIC_AUTH_TOKEN || null
  };
}
