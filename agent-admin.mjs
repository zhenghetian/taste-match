const $ = (id) => document.getElementById(id);
const labels = {
  enabled: '启用模型能力', provider: '模型供应商', model: '模型名称', allowAutoReply: '允许自动代回',
  timeoutMs: '请求超时（毫秒）', maxTokens: '最大输出令牌数', concurrency: '并发任务上限',
  globalDailyLimit: '全局每日额度', userDailyLimit: '单用户每日额度',
  icebreakerInstruction: '开场白补充要求', replyInstruction: '回复建议补充要求', autoInstruction: '自动代回补充要求',
};
const ranges = { timeoutMs: [1000, 60000], maxTokens: [256, 8192], concurrency: [1, 8], globalDailyLimit: [0, 10000], userDailyLimit: [0, 1000] };
const instructions = ['icebreakerInstruction', 'replyInstruction', 'autoInstruction'];
const fields = Object.keys(labels);
const sessionName = 'anhao_admin_key';
let adminKey = '';
try { adminKey = sessionStorage.getItem(sessionName) || ''; } catch { /* 禁用存储时仍可使用内存会话。 */ }
let config = null;
let busy = false;
let conflict = false;
let pending = null;
let retryAction = null;
let dialogRetry = null;

function settingsOf(value) {
  return Object.fromEntries(fields.map((key) => [key, value[key]]));
}
function draft() {
  return Object.fromEntries(fields.map((key) => {
    const input = $(key);
    return [key, input.type === 'checkbox' ? input.checked : key in ranges ? (input.value.trim() === '' ? NaN : Number(input.value)) : key === 'model' ? input.value.trim() : input.value];
  }));
}
function changes(from, to) { return fields.filter((key) => from[key] !== to[key]); }
function dirty() { return Boolean(config && changes(config.settings, draft()).length); }
function persistKey(value) {
  adminKey = value;
  try { value ? sessionStorage.setItem(sessionName, value) : sessionStorage.removeItem(sessionName); } catch { /* 内存会话仍可用。 */ }
}
function display(value, key) {
  if (typeof value === 'boolean') return value ? '开启' : '关闭';
  if (key === 'model' && !value) return '使用该供应商的默认模型';
  if (key === 'provider') return value === 'anthropic' ? 'Anthropic' : value === 'deepseek' ? 'DeepSeek' : String(value);
  if (value === '') return '（无补充要求）';
  if ((key === 'globalDailyLimit' || key === 'userDailyLimit') && value === 0) return '0（禁用）';
  return String(value ?? '未提供');
}
function date(value) { return value ? new Date(value).toLocaleString('zh-CN') : '未提供时间'; }
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function feedback(text = '', error = false, retry = null) {
  $('feedback').hidden = !text;
  $('feedback').classList.toggle('error', error);
  $('feedbackText').textContent = text;
  retryAction = retry;
  $('retry').hidden = !retry;
}
function showIssues(issues = []) {
  $('validation').replaceChildren();
  $('validation').hidden = !issues.length;
  if (issues.length) {
    const list = node('ul');
    for (const issue of issues) list.append(node('li', issue));
    $('validation').append(list);
  }
}
function sync() {
  const changed = dirty();
  $('fields').disabled = busy || !config || conflict || Boolean(pending);
  document.querySelectorAll('#workspace button').forEach((button) => { button.disabled = busy; });
  $('validate').disabled = busy || !config || conflict || Boolean(pending);
  $('preview').disabled = busy || !changed || conflict || Boolean(pending);
  $('reset').disabled = busy || !changed || Boolean(pending);
  $('draftState').textContent = conflict ? '版本冲突，需重新加载' : changed ? '有未保存的更改' : '草稿未改动';
  $('loginButton').disabled = busy;
  $('adminKey').disabled = busy;
  $('loginRetry').disabled = busy;
  $('clearSession').disabled = busy;
  $('reason').disabled = busy;
  $('cancelConfirm').disabled = busy;
  $('save').disabled = busy || !pending || !$('reason').value.trim() || Boolean(dialogRetry) || conflict;
  $('save').textContent = busy ? '处理中…' : pending?.kind === 'rollback' ? '确认恢复' : '确认保存';
  $('confirmRetry').disabled = busy;
  for (const key of instructions) $(key.replace('Instruction', 'Count')).textContent = `${Array.from($(key).value).length} / 2,000 字`;
  if (config) {
    const provider = $('provider').value;
    const configured = Boolean(config.credentials?.[provider]);
    $('credentialState').textContent = configured ? '凭证已配置；尚未验证连接' : '凭证未配置；开启模型能力将无法通过校验';
    $('modelDefault').textContent = config.defaults?.provider === provider && config.defaults.model
      ? `留空使用服务端默认模型：${config.defaults.model}。切换供应商将清空模型名称。`
      : '留空使用所选供应商的服务端默认模型；切换供应商将清空模型名称。';
  }
}
async function run(action) {
  if (busy) return;
  busy = true;
  sync();
  try { await action(); } finally { busy = false; sync(); }
}
function lockSession() {
  persistKey('');
  if ($('confirmDialog').open) $('confirmDialog').close();
  pending = null;
  $('workspace').hidden = true;
  $('gate').hidden = false;
  $('adminKey').value = '';
  $('loginRetry').hidden = true;
  $('clearSession').hidden = true;
  $('loginMessage').textContent = '管理密钥无效或已失效，请重新输入。';
}
async function api(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api/admin/agent/${path}`, {
      ...options, headers: { 'content-type': 'application/json', 'x-admin-key': adminKey },
      signal: AbortSignal.timeout(20000), cache: 'no-store',
    });
  } catch { throw new Error('网络请求失败或超时，请检查连接后重试。'); }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(body?.error?.message || `请求失败（${response.status}）`);
    error.status = response.status;
    error.code = body?.error?.code;
    if (response.status === 401 || response.status === 403) lockSession();
    throw error;
  }
  if (!body) throw new Error('接口未返回有效数据，请重试。');
  return body;
}
function renderDraft(settings) {
  for (const key of fields) {
    const input = $(key);
    if (input.type === 'checkbox') input.checked = Boolean(settings[key]);
    else input.value = settings[key] ?? '';
    input.removeAttribute('aria-invalid');
  }
  showIssues();
  $('validationNote').textContent = '配置校验不会调用模型，也不验证连接。';
  sync();
}
function applyConfig(data) {
  if (!Number.isInteger(data.revision) || !data.settings || !data.defaults || !data.credentials) throw new Error('配置接口数据不完整，请重新加载。');
  config = { ...data, settings: settingsOf(data.settings) };
  conflict = false;
  pending = null;
  dialogRetry = null;
  renderDraft(config.settings);
  $('version').textContent = `当前版本 ${data.revision} · 更新于 ${date(data.updatedAt)}`;
  $('credentials').textContent = `凭证状态：Anthropic ${data.credentials.anthropic ? '已配置' : '未配置'}；DeepSeek ${data.credentials.deepseek ? '已配置' : '未配置'}。`;
  const validation = data.configuration;
  const issues = Array.isArray(validation?.issues) ? validation.issues : [];
  $('configuration').textContent = `${validation?.configurationValid ? '当前配置校验通过' : '当前配置尚未通过校验'}；尚未验证模型连接。${issues.length ? ` ${issues.join('；')}` : ''}`;
  $('history').replaceChildren(node('p', '配置已加载，可加载历史记录查看或恢复旧版本。', 'empty'));
  $('status').textContent = '尚未读取。';
  $('gate').hidden = true;
  $('workspace').hidden = false;
  $('adminKey').value = '';
  $('loginMessage').textContent = '';
}
async function loadConfig() {
  await run(async () => {
    feedback('正在加载配置…');
    $('loginMessage').textContent = '正在加载配置…';
    try {
      applyConfig(await api('config'));
      feedback('配置已加载。');
      $('loginRetry').hidden = true;
    } catch (error) {
      feedback(error.message, true, loadConfig);
      $('loginMessage').textContent = error.message;
      $('loginRetry').hidden = !adminKey;
      $('clearSession').hidden = !adminKey;
    }
  });
}
function localIssues(settings, mark = false) {
  const issues = [];
  function invalid(key, message) {
    issues.push(message);
    if (mark) $(key).setAttribute('aria-invalid', 'true');
  }
  if (mark) fields.forEach((key) => $(key).removeAttribute('aria-invalid'));
  if (!['anthropic', 'deepseek'].includes(settings.provider)) invalid('provider', '请选择支持的模型供应商。');
  if (settings.enabled && !config.credentials?.[settings.provider]) invalid('enabled', '所选供应商凭证未配置，请关闭模型能力后保存，或由服务端配置凭证。');
  for (const [key, [min, max]] of Object.entries(ranges)) {
    if (!Number.isInteger(settings[key]) || settings[key] < min || settings[key] > max) invalid(key, `${labels[key]}须为 ${min}–${max} 之间的整数。`);
  }
  for (const key of instructions) if (Array.from(settings[key]).length > 2000) invalid(key, `${labels[key]}不能超过 2,000 字。`);
  return issues;
}
async function validateSettings(settings, mark = false) {
  const local = localIssues(settings, mark);
  if (local.length) { showIssues(local); return false; }
  const result = await api('validate', { method: 'POST', body: JSON.stringify({ settings }) });
  const configurationIssues = Array.isArray(result.configuration?.issues) ? result.configuration.issues : [];
  const issues = [...(Array.isArray(result.issues) ? result.issues : []), ...(settings.enabled ? configurationIssues : [])];
  const valid = result.valid === true && (!settings.enabled || result.configuration?.configurationValid !== false && configurationIssues.length === 0);
  showIssues(valid ? [] : [...new Set(issues.length ? issues : ['服务端配置校验未通过。'])]);
  $('validationNote').textContent = valid
    ? `配置校验通过；未调用模型，尚未验证连接。${!settings.enabled && configurationIssues.length ? ` 模型能力已关闭；环境提示：${configurationIssues.join('；')}` : ''}`
    : '配置校验未通过，请按提示调整。';
  return valid;
}
function renderDiff(settings) {
  const rows = changes(config.settings, settings).map((key) => {
    const row = node('tr');
    row.append(node('td', labels[key]), node('td', display(config.settings[key], key)), node('td', display(settings[key], key)));
    return row;
  });
  if (!rows.length) {
    const row = node('tr');
    const cell = node('td', '配置值与当前版本一致；恢复仍会创建一个新版本并记录原因。');
    cell.colSpan = 3;
    row.append(cell);
    rows.push(row);
  }
  $('diff').replaceChildren(...rows);
}
function openConfirmation(kind, settings, revision = null) {
  pending = { kind, settings: structuredClone(settings), revision, expectedRevision: config.revision };
  dialogRetry = null;
  $('confirmTitle').textContent = kind === 'rollback' ? `确认恢复版本 ${revision}` : '确认配置变更';
  $('confirmDescription').textContent = kind === 'rollback'
    ? `将版本 ${revision} 的配置恢复为一个新版本，基于当前版本 ${config.revision} 提交。当前未保存的草稿将在恢复成功后被替换。`
    : `基于当前版本 ${config.revision} 保存以下变更。固定规则保留，提示词仅追加业务要求。`;
  renderDiff(settings);
  $('reason').value = '';
  $('confirmError').textContent = '';
  $('confirmRetry').hidden = true;
  $('confirmDialog').showModal();
  sync();
}
function handleError(error, retry, inDialog = false) {
  if (error.status === 409) {
    conflict = true;
    pending = null;
    if ($('confirmDialog').open) $('confirmDialog').close();
    feedback('版本冲突：服务端配置已变更。当前草稿已保留，已阻止继续提交；请重新加载最新配置后重新编辑，不会覆盖他人的变更。', true, requestReload);
    return;
  }
  if (error.status === 401 || error.status === 403) return;
  if (inDialog) {
    $('confirmError').textContent = `${error.message} 当前内容已保留。重试前将重新校验。`;
    dialogRetry = retry;
    $('confirmRetry').hidden = false;
  } else feedback(error.message, true, retry);
}
async function preview() {
  if (!config || conflict) return;
  await run(async () => {
    const settings = draft();
    if (!changes(config.settings, settings).length) { feedback('草稿未改动，无需保存。'); return; }
    try {
      feedback('正在校验变更…');
      if (await validateSettings(settings, true)) { feedback(); openConfirmation('save', settings); }
      else feedback('请修正配置后重新预览。', true);
    } catch (error) { handleError(error, preview); }
  });
}
async function restore(entry) {
  if (!config || conflict) { feedback('请先重新加载最新配置，再恢复历史版本。', true, requestReload); return; }
  await run(async () => {
    try {
      feedback('正在校验历史配置…');
      const settings = settingsOf(entry.settings);
      if (await validateSettings(settings)) { feedback(); openConfirmation('rollback', settings, entry.revision); }
      else feedback('该历史配置未通过当前校验，不能恢复。可在运行配置中调整后另存为新版本。', true);
    } catch (error) { handleError(error, () => restore(entry)); }
  });
}
async function submit() {
  if (!pending || !$('reason').value.trim() || conflict) return;
  await run(async () => {
    const operation = pending;
    const reason = $('reason').value.trim();
    dialogRetry = null;
    $('confirmRetry').hidden = true;
    $('confirmError').textContent = '';
    try {
      // 保存和恢复均再次校验快照，避免以过期的校验结果提交。
      if (!(await validateSettings(operation.settings))) {
        $('confirmError').textContent = '配置校验未通过，请取消并检查页面中的提示。';
        return;
      }
      const payload = operation.kind === 'rollback'
        ? { expectedRevision: operation.expectedRevision, revision: operation.revision, reason }
        : { expectedRevision: operation.expectedRevision, settings: operation.settings, reason };
      const result = await api(operation.kind === 'rollback' ? 'rollback' : 'config', {
        method: operation.kind === 'rollback' ? 'POST' : 'PUT', body: JSON.stringify(payload),
      });
      applyConfig(result);
      $('confirmDialog').close();
      feedback(operation.kind === 'rollback' ? `已恢复版本 ${operation.revision}，生成新版本 ${result.revision}。` : `配置已保存，当前版本 ${result.revision}。`);
    } catch (error) { handleError(error, submit, true); }
  });
}
async function loadHistory() {
  await run(async () => {
    try {
      const data = await api('history');
      if (!Array.isArray(data.history)) throw new Error('历史接口数据不完整，请重试。');
      $('history').replaceChildren();
      for (const entry of [...data.history].sort((a, b) => b.revision - a.revision)) {
        const item = node('article', undefined, 'history-item');
        const line = node('div', undefined, 'history-line');
        const current = entry.revision === config.revision;
        const button = node('button', current ? '当前版本' : '恢复此版本');
        button.type = 'button';
        if (current) button.hidden = true;
        button.addEventListener('click', () => restore(entry));
        line.append(node('strong', `版本 ${entry.revision}${current ? ' · 当前版本' : ''}`), button);
        const detail = node('details');
        detail.append(node('summary', '查看完整配置'));
        const list = node('dl', undefined, 'snapshot');
        for (const key of fields) list.append(node('dt', labels[key]), node('dd', display(entry.settings[key], key)));
        detail.append(list);
        item.append(line, node('p', `${date(entry.createdAt)}${entry.restoredFrom != null ? ` · 恢复自版本 ${entry.restoredFrom}` : ''}`), node('p', `原因：${entry.reason || '未提供'}`), detail);
        $('history').append(item);
      }
      if (!data.history.length) $('history').append(node('p', '暂无版本记录。', 'empty'));
      feedback('版本历史已加载。');
    } catch (error) { handleError(error, loadHistory); }
  });
}
function requestReload() {
  if (busy) return;
  if (dirty() && !window.confirm('重新加载将放弃当前未保存的草稿。是否继续？')) return;
  loadConfig();
}
$('loginForm').addEventListener('submit', (event) => {
  event.preventDefault();
  if (busy) return;
  const key = $('adminKey').value.trim();
  if (!key) return;
  persistKey(key);
  loadConfig();
});
$('loginRetry').addEventListener('click', loadConfig);
$('clearSession').addEventListener('click', () => { if (!busy) { lockSession(); $('loginMessage').textContent = '会话密钥已清除。'; } });
$('configForm').addEventListener('input', () => { showIssues(); $('validationNote').textContent = '草稿已变化，请重新校验；校验不会调用模型。'; sync(); });
$('provider').addEventListener('change', () => { $('model').value = ''; sync(); feedback('供应商已切换，模型名称已清空；留空将使用该供应商的默认模型。'); });
$('configForm').addEventListener('submit', (event) => { event.preventDefault(); preview(); });
$('validate').addEventListener('click', () => run(async () => {
  try { if (await validateSettings(draft(), true)) feedback('配置校验通过；尚未验证连接。'); else feedback('请修正配置后重新校验。', true); }
  catch (error) { handleError(error, () => $('validate').click()); }
}));
$('reset').addEventListener('click', () => {
  if (dirty() && window.confirm('放弃所有未保存的更改，恢复到最近加载的配置？')) { renderDraft(config.settings); feedback(conflict ? '草稿已重置。版本冲突仍需重新加载最新配置。' : '草稿已重置，未写入服务端。'); }
});
$('reload').addEventListener('click', requestReload);
$('retry').addEventListener('click', () => retryAction?.());
$('loadHistory').addEventListener('click', loadHistory);
$('loadStatus').addEventListener('click', () => run(async () => {
  try { $('status').textContent = JSON.stringify(await api('status'), null, 2); }
  catch (error) { $('status').textContent = `状态读取失败：${error.message} 点击“刷新运行状态”重试，配置管理仍可使用。`; }
}));
$('reason').addEventListener('input', sync);
$('confirmForm').addEventListener('submit', (event) => { event.preventDefault(); submit(); });
$('confirmRetry').addEventListener('click', () => dialogRetry?.());
function cancelConfirmation() {
  if (busy) return;
  $('confirmDialog').close();
  pending = null;
  dialogRetry = null;
  sync();
}
$('cancelConfirm').addEventListener('click', cancelConfirmation);
$('confirmDialog').addEventListener('cancel', (event) => { event.preventDefault(); cancelConfirmation(); });
$('logout').addEventListener('click', () => {
  if (busy || (dirty() && !window.confirm('有未保存的更改，退出将放弃草稿并清除会话密钥。是否继续？'))) return;
  persistKey('');
  config = null;
  pending = null;
  conflict = false;
  $('workspace').hidden = true;
  $('gate').hidden = false;
  HTMLFormElement.prototype.reset.call($('configForm'));
  $('history').replaceChildren();
  $('adminKey').value = '';
  $('loginMessage').textContent = '已退出，会话密钥已清除。';
  $('loginRetry').hidden = true;
  $('clearSession').hidden = true;
  sync();
});
window.addEventListener('beforeunload', (event) => {
  if (dirty() || busy && pending) { event.preventDefault(); event.returnValue = ''; }
});
if (adminKey) loadConfig();
else sync();
