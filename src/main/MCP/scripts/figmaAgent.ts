/**
 * Figma's own agent (the Agents tab of the editor), driven from the page.
 *
 * The assistant panel registers a message processor in the page's store even
 * when the panel is closed; the module that owns it exports two plain
 * functions, one starting a new thread and one continuing a thread. Figma's
 * own onboarding sends prompts through them. They are found by what their
 * code contains, not their export names, which change per deploy. The
 * promise resolves when the exchange ends with
 * `{exchangeOutcome: "completed" | "aborted" | "failed" | "precondition_failed" | …}`.
 *
 * The result is read back from the thread's stored messages (role user /
 * assistant / tool, `parts[]` of `{partType, contentJson}`), and the credits
 * the prompt spent from the credit usage of its client lifecycle id. Verified
 * live on 2026-11-06 (build e79b4ae): two prompts, 8-13 s each, 4 and 6
 * credits. Part types carry names like `tool-call-json-DO-NOT-USE-IN-PROD`, so
 * they are matched by prefix.
 */

const AGENT_PREAMBLE = `
    function bundlerRequire() {
      let req = null;
      window.rspackChunk_figma_web_bundler.push([[Math.random()], {}, function (r) { req = r; }]);
      if (!req || !req.m) throw new Error("Figma's page bundler is not reachable; Figma may have changed how it loads code.");
      return req;
    }
    function findModule(req, test) {
      for (const id of Object.keys(req.m)) {
        let src = '';
        try { src = String(req.m[id]); } catch (e) { continue; }
        if (test(src)) return req(id);
      }
      return null;
    }
    // Several modules can mention a method; the one wanted exports an object having it.
    function findApi(req, marker, method) {
      for (const id of Object.keys(req.m)) {
        let src = '';
        try { src = String(req.m[id]); } catch (e) { continue; }
        if (src.indexOf(marker) === -1) continue;
        let mod = null;
        try { mod = req(id); } catch (e) { continue; }
        for (const k of Object.keys(mod || {})) {
          const v = mod[k];
          if (v && typeof v[method] === 'function') return v;
        }
      }
      return null;
    }
    function agentApis() {
      if (window.__flnAgent) return window.__flnAgent;
      const req = bundlerRequire();
      const threads = findApi(req, 'getThreadMessages(', 'getThreadMessages');
      if (!threads) throw new Error("Figma's agent thread API was not found in the page. Figma changed it; this tool needs an update.");
      const credits = findApi(req, 'getPlanUserActionCreditUsage(e){', 'getPlanUserActionCreditUsage');
      window.__flnAgent = { req: req, threads: threads, credits: credits };
      return window.__flnAgent;
    }
    function fileKeyOf() {
      const f = window.INITIAL_OPTIONS && window.INITIAL_OPTIONS.editing_file;
      return (window.figma && window.figma.fileKey) || (f && f.key) || location.pathname.split('/')[2];
    }
    function parse(json) { try { return JSON.parse(json); } catch (e) { return null; } }
    function partsOf(m, prefix) {
      return (m.parts || []).filter(function (p) { return String(p.partType).indexOf(prefix) === 0; }).map(function (p) { return parse(p.contentJson) || {}; });
    }
    function short(s, n) { s = String(s == null ? '' : s).replace(/\\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; }
    // One exchange: the user message with this client id and what followed it
    // up to the next user message.
    function exchange(messages, clientId) {
      let start = -1;
      for (let i = 0; i < messages.length; i++) if (messages[i].role === 'user' && messages[i].clientId === clientId) start = i;
      if (start === -1) return null;
      let end = messages.length;
      for (let i = start + 1; i < messages.length; i++) if (messages[i].role === 'user') { end = i; break; }
      return summarize(messages.slice(start, end));
    }
    function summarize(msgs) {
      const out = { prompt: '', answer: '', toolCalls: [], changed: { created: [], modified: [], deleted: [] }, state: null };
      const calls = {};
      for (const m of msgs) {
        if (m.role === 'user') { out.prompt = partsOf(m, 'text').map(function (t) { return t.text; }).join('\\n'); out.clientId = m.clientId; }
        if (m.role === 'assistant') {
          // Figma links nodes in its answers with its own tag; keep the name and id.
          const t = partsOf(m, 'text').map(function (t) { return t.text; }).join('')
            .replace(/<figma-node-link node-id="([^"]+)">([^<]*)<\\/figma-node-link>/g, '$2 ($1)');
          if (t) out.answer += (out.answer ? '\\n\\n' : '') + t;
          for (const c of partsOf(m, 'tool-call-json')) {
            const args = parse(c.argsJson) || {};
            const entry = { tool: String(c.toolName || '').replace(/^mcp__plugin_figma_internal__/, ''), label: args.taskLabel || undefined, code: args.code ? short(args.code, 400) : undefined, ok: null };
            calls[c.toolCallId] = entry;
            out.toolCalls.push(entry);
          }
        }
        if (m.role === 'tool') {
          for (const r of partsOf(m, 'tool-result-json')) {
            const res = parse(r.resultJson) || {};
            if (calls[r.toolCallId]) calls[r.toolCallId].ok = res.success !== false;
            const ch = res._meta && res._meta.nodeChangeSummary;
            if (ch) for (const k of ['created', 'modified', 'deleted']) for (const n of (ch[k] || [])) out.changed[k].push(typeof n === 'string' ? n : (n.id || n.guid || JSON.stringify(n)));
          }
        }
        for (const l of partsOf(m, 'assistant-prompt-lifecycle')) out.state = l.state || out.state;
      }
      for (const c of out.toolCalls) { if (c.label === undefined) delete c.label; if (c.code === undefined) delete c.code; }
      return out;
    }
    // Usage is logged a few seconds after an exchange ends, so a fresh prompt
    // retries; reading a thread retries once, for a prompt that just ended.
    async function creditsFor(api, fileKey, clientId, tries) {
      if (!api || !clientId) return null;
      for (let i = 0; i < (tries || 5); i++) {
        if (i) await new Promise(function (r) { setTimeout(r, 2000); });
        try {
          const r = await api.getPlanUserActionCreditUsage({ fileKey: fileKey, userActionUuid: clientId });
          const m = r && r.data && r.data.meta;
          if (m) return m.total_credit_usage != null ? m.total_credit_usage : m.total_credit_cost;
        } catch (e) {}
      }
      return null;
    }
`;

export interface AgentPromptArgs {
  prompt: string;
  threadId: string | null;
  selectedNodeIds: string[];
  title: string | null;
  timeoutMs: number;
}

export const FIGMA_AGENT_PROMPT_SCRIPT = (args: AgentPromptArgs) => `
(async function() {
  try {
    const args = ${JSON.stringify(args)};
    ${AGENT_PREAMBLE}
    const apis = agentApis();
    const proc = findModule(apis.req, function (s) { return s.indexOf('AssistantMessageProcessor not active') !== -1; });
    if (!proc) return { error: "Figma's agent message processor was not found in the page. Figma changed it; this tool needs an update." };
    const fns = Object.keys(proc).map(function (k) { return proc[k]; }).filter(function (f) { return typeof f === 'function'; });
    const sendNew = fns.find(function (f) { return /forceCreateNewThread:!0/.test(String(f)); });
    const sendTo = fns.find(function (f) { const src = String(f); return /targetThreadId:/.test(src) && !/forceCreateNewThread/.test(src); });
    if (!sendNew || !sendTo) return { error: "Figma's agent send functions were not found in the page. Figma changed them; this tool needs an update." };

    const fileKey = fileKeyOf();
    const clientId = crypto.randomUUID();
    let threadId = args.threadId;
    const userInput = { plainText: args.prompt, errors: [], hidden: false };
    if (args.selectedNodeIds.length) { userInput.selectedNodeIds = args.selectedNodeIds; userInput.associatedNodeIds = args.selectedNodeIds; }
    // Name a new thread as soon as it exists: a prompt that outlives the wait
    // would otherwise keep the title Figma gives it.
    const setTitle = function () {
      if (!args.title || !threadId) return Promise.resolve();
      return Promise.resolve(apis.threads.updateThreadTitle({ ownerId: fileKey, ownerType: 'file', threadId: threadId, title: args.title })).catch(function () {});
    };
    const data = { userInput: userInput, clientLifecycleId: clientId, supportRequestId: clientId, onThreadResolved: function (t) { threadId = t; setTitle(); } };
    const sent = args.threadId ? sendTo(data, args.threadId) : sendNew(data);
    if (!sent || typeof sent.then !== 'function') return { error: "Figma's agent did not accept the prompt: its panel is not ready in this tab. Open the file's editor, wait for it to load and retry." };

    const started = Date.now();
    let timedOut = false;
    const result = await Promise.race([
      sent,
      new Promise(function (r) { setTimeout(function () { timedOut = true; r(null); }, args.timeoutMs); }),
    ]);
    const ms = Date.now() - started;
    if (timedOut) {
      return { threadId: threadId, outcome: 'still running', ms: ms, note: 'The agent is still working in Figma; nothing is lost. Call figma_agent_read with this threadId in a minute or two: it shows the answer, the changes and the credits once the prompt ends.' };
    }
    const outcome = (result && result.exchangeOutcome) || 'unknown';
    // Figma may retitle the thread when the exchange ends; put ours back.
    await setTitle();
    // The thread is stored a moment after the exchange ends: the answer and the
    // closing lifecycle part can lag the promise by a second or two (seen live).
    let ex = null;
    for (let i = 0; threadId && i < 8; i++) {
      try {
        const res = await apis.threads.getThreadMessages({ ownerId: fileKey, ownerType: 'file', threadId: threadId, pageSize: 64 });
        ex = exchange((res.data.meta.messages || []), clientId);
      } catch (e) {}
      if (ex && ex.state && ex.state !== 'started' && (ex.answer || outcome !== 'completed')) break;
      await new Promise(function (r) { setTimeout(r, 1500); });
    }
    const credits = await creditsFor(apis.credits, fileKey, clientId);
    const out = { threadId: threadId, outcome: outcome, ms: ms, credits: credits };
    if (ex) { out.answer = ex.answer; out.toolCalls = ex.toolCalls; out.changed = ex.changed; }
    if (outcome === 'precondition_failed') out.note = "Figma refused to start the exchange (precondition_failed): the agent may be off for this file or plan, or Figma changed how prompts are sent.";
    return out;
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;

export const FIGMA_AGENT_THREADS_SCRIPT = `
(async function() {
  try {
    ${AGENT_PREAMBLE}
    const apis = agentApis();
    const res = await apis.threads.getThreads({ ownerId: fileKeyOf(), ownerType: 'file' });
    const list = ((res && res.data && res.data.meta && res.data.meta.threads) || []).filter(function (t) { return !t.thread_type || t.thread_type === 'assistant'; });
    if (!list.length) return { text: 'No agent threads in this file.' };
    return { text: list.length + ' agent thread(s), newest first:\\n' + list
      .sort(function (a, b) { return String(b.updated_at).localeCompare(String(a.updated_at)); })
      .map(function (t) {
        const meta = parse(t.metadata_json) || {};
        return '- ' + t.id + ' · ' + String(t.updated_at).replace('T', ' ').slice(0, 16) + ' · ' + (t.title || '(untitled)') + (meta.lastCompletedPromptOutcome ? ' · ' + meta.lastCompletedPromptOutcome.toLowerCase() : '');
      }).join('\\n') };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;

export const FIGMA_AGENT_READ_SCRIPT = (threadId: string, last: number) => `
(async function() {
  try {
    ${AGENT_PREAMBLE}
    const apis = agentApis();
    const res = await apis.threads.getThreadMessages({ ownerId: fileKeyOf(), ownerType: 'file', threadId: ${JSON.stringify(threadId)}, pageSize: 200 });
    const messages = (res && res.data && res.data.meta && res.data.meta.messages) || [];
    const starts = [];
    messages.forEach(function (m, i) { if (m.role === 'user') starts.push(i); });
    const exchanges = starts.map(function (s, k) { return summarize(messages.slice(s, k + 1 < starts.length ? starts[k + 1] : messages.length)); });
    const shown = exchanges.slice(-${Math.max(1, Math.floor(last))});
    const fileKey = fileKeyOf();
    for (const ex of shown) {
      if (ex.state && ex.state !== 'started') ex.credits = await creditsFor(apis.credits, fileKey, ex.clientId, 2);
      delete ex.clientId;
    }
    return { threadId: ${JSON.stringify(threadId)}, exchanges: shown, total: exchanges.length };
  } catch (e) {
    return { error: (e && e.message) || String(e) };
  }
})()
`;
