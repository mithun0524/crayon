import { marked } from "marked";
import DOMPurify from "dompurify";
import hljs from "highlight.js/lib/core";
import javascript from "highlight.js/lib/languages/javascript";
import typescript from "highlight.js/lib/languages/typescript";
import python from "highlight.js/lib/languages/python";
import json from "highlight.js/lib/languages/json";
import bash from "highlight.js/lib/languages/bash";
import xml from "highlight.js/lib/languages/xml";
import css from "highlight.js/lib/languages/css";
import markdown from "highlight.js/lib/languages/markdown";
import yaml from "highlight.js/lib/languages/yaml";
import go from "highlight.js/lib/languages/go";
import rust from "highlight.js/lib/languages/rust";
import java from "highlight.js/lib/languages/java";
import sql from "highlight.js/lib/languages/sql";
import diffLang from "highlight.js/lib/languages/diff";

// Slim highlight.js: core + common languages only (full build was ~1 MB).
hljs.registerLanguage("javascript", javascript);
hljs.registerLanguage("typescript", typescript);
hljs.registerLanguage("python", python);
hljs.registerLanguage("json", json);
hljs.registerLanguage("bash", bash);
hljs.registerLanguage("shell", bash);
hljs.registerLanguage("xml", xml);
hljs.registerLanguage("html", xml);
hljs.registerLanguage("css", css);
hljs.registerLanguage("markdown", markdown);
hljs.registerLanguage("yaml", yaml);
hljs.registerLanguage("go", go);
hljs.registerLanguage("rust", rust);
hljs.registerLanguage("java", java);
hljs.registerLanguage("sql", sql);
hljs.registerLanguage("diff", diffLang);

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      const highlighted =
        language === "plaintext"
          ? escapeHtml(text)
          : hljs.highlight(text, { language }).value;
      // Copilot-style block: language label + Copy / Insert-at-cursor actions
      return (
        `<div class="codeblock"><div class="cb-head"><span class="cb-lang">${language}</span>` +
        `<span class="cb-actions">` +
        `<button class="cb-btn" data-act="copy">Copy</button>` +
        `<button class="cb-btn" data-act="insert">Insert</button>` +
        `</span></div>` +
        `<pre><code class="hljs ${language}">${highlighted}</code></pre></div>`
      );
    },
  },
});

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById("messages")!;
const welcomeEl = document.getElementById("welcome");
const statusEl = document.getElementById("status")!;
const statusTextEl = statusEl.querySelector(".status-text") as HTMLSpanElement;
const input = document.getElementById("task-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const tokenCounterEl = document.getElementById("token-counter") as HTMLSpanElement;
const modelBadgeEl = document.getElementById("model-badge") as HTMLSpanElement;

const SEND_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor"><path d="M1.72 1.05a.5.5 0 0 0-.71.55l1.4 5.4L9 8 2.41 9l-1.4 5.4a.5.5 0 0 0 .71.55l13-6.5a.5.5 0 0 0 0-.9l-13-6.5z"/></svg>';
const STOP_ICON =
  '<svg viewBox="0 0 16 16" fill="currentColor"><rect x="3.5" y="3.5" width="9" height="9" rx="1.5"/></svg>';

let running = false;
let streamingBubble: HTMLDivElement | null = null;
let streamRaw = "";
let renderScheduled = false;
let tokens = 0;
let cost = 0;
let modelId = "";
// Open tool rows waiting for their result, keyed by id (fallback: name)
const pendingTools = new Map<string, { row: HTMLDetailsElement; started: number }>();

/** Icon per tool family — visual scanning like Claude Code's tool cards. */
function toolIcon(name: string): string {
  const n = name.toLowerCase();
  if (/read|cat|open|view/.test(n)) return "▤";
  if (/edit|write|apply|patch|create/.test(n)) return "✎";
  if (/bash|shell|exec|run|command|terminal/.test(n)) return "❯";
  if (/search|grep|glob|find|ripgrep/.test(n)) return "⌕";
  if (/git/.test(n)) return "⎇";
  if (/test|eval|check/.test(n)) return "⚑";
  if (/web|fetch|http|url|browse/.test(n)) return "◍";
  if (/todo|plan|task/.test(n)) return "☰";
  return "→";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** All markdown-derived HTML passes through DOMPurify before hitting the DOM. */
function renderMarkdown(raw: string): string {
  return DOMPurify.sanitize(marked.parse(raw, { async: false }) as string);
}

function hideWelcome(): void {
  welcomeEl?.remove();
}

/** Stick to the bottom only when the user is already reading the bottom. */
function isNearBottom(): boolean {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 48;
}

function maybeScroll(wasNearBottom: boolean): void {
  if (wasNearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function append(el: HTMLElement): void {
  hideWelcome();
  const stick = isNearBottom();
  // Status line always stays the LAST element of the transcript
  if (statusEl.parentElement === messagesEl) {
    messagesEl.insertBefore(el, statusEl);
  } else {
    messagesEl.appendChild(el);
  }
  maybeScroll(stick);
}

function addMsg(htmlContent: string, cls: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.innerHTML = htmlContent;
  append(div);
  return div;
}

function addTextMsg(text: string, cls: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  append(div);
  return div;
}

/** One live status line under the transcript, updated in place. */
let statusBase: string | null = null;
let runStart = 0;
let elapsedTimer: ReturnType<typeof setInterval> | undefined;

function renderStatus(): void {
  if (statusBase === null) {
    statusEl.classList.remove("active");
    return;
  }
  const secs = runStart ? Math.floor((Date.now() - runStart) / 1000) : 0;
  statusTextEl.textContent = secs >= 3 ? `${statusBase} · ${secs}s` : statusBase;
  statusEl.classList.add("active");
}

function setStatus(text: string | null): void {
  statusBase = text;
  renderStatus();
}

/** Rolling tail of live reasoning so the user sees WHAT the model thinks. */
let reasoningTail = "";
function streamReasoning(delta: string): void {
  reasoningTail = (reasoningTail + delta).replace(/\s+/g, " ").slice(-90);
  setStatus(`✻ …${reasoningTail}`);
}

/** The most informative single argument of a tool call, for the status line. */
function primaryArg(args: unknown): string {
  if (args == null || typeof args !== "object") return "";
  const obj = args as Record<string, unknown>;
  for (const key of ["path", "file", "filePath", "command", "query", "pattern", "url"]) {
    if (typeof obj[key] === "string") {
      const v = obj[key] as string;
      // Paths: keep the tail — that's the informative part
      return v.length > 48 ? "…" + v.slice(-48) : v;
    }
  }
  const firstString = Object.values(obj).find((v) => typeof v === "string") as string | undefined;
  return firstString ? (firstString.length > 48 ? firstString.slice(0, 48) + "…" : firstString) : "";
}

function startStreamBubble(): void {
  streamingBubble = document.createElement("div");
  streamingBubble.className = "msg agent streaming";
  streamRaw = "";
  append(streamingBubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Token deltas are buffered and rendered at most once per animation frame.
 */
function appendStream(delta: string): void {
  setStatus(null); // model is talking — status line down
  if (!streamingBubble) startStreamBubble();
  streamRaw += delta;
  if (renderScheduled) return;
  renderScheduled = true;
  requestAnimationFrame(() => {
    renderScheduled = false;
    if (!streamingBubble) return;
    const stick = isNearBottom();
    streamingBubble.innerHTML = renderMarkdown(streamRaw);
    maybeScroll(stick);
  });
}

function finalizeStreamBubble(fullText: string | null): void {
  if (streamingBubble) {
    streamingBubble.classList.remove("streaming");
    const finalRaw = fullText ?? streamRaw;
    if (finalRaw) {
      streamingBubble.innerHTML = renderMarkdown(finalRaw);
      linkifyCitations(streamingBubble);
    } else {
      streamingBubble.remove();
    }
    streamingBubble = null;
    streamRaw = "";
  }
}

// ── Inline citations ─────────────────────────────────────────────
// Turn `src/auth/passport.ts:12`-style references in the final answer into
// clickable jump-to-source badges. Runs once on the finalized bubble only.
const CITE_RE = /(?:^|[\s(\[`])((?:[\w.-]+\/)+[\w.-]+\.[a-z]{1,6})(?::(\d+))?/g;

function linkifyCitations(root: HTMLElement): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) =>
      (node.parentElement?.closest("pre, a, .cite") ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  const targets: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (CITE_RE.test(n.textContent ?? "")) targets.push(n as Text);
    CITE_RE.lastIndex = 0;
  }
  for (const textNode of targets) {
    const frag = document.createDocumentFragment();
    let last = 0;
    const text = textNode.textContent ?? "";
    for (const m of text.matchAll(CITE_RE)) {
      const matchStart = m.index! + m[0].indexOf(m[1]);
      frag.appendChild(document.createTextNode(text.slice(last, matchStart)));
      const a = document.createElement("a");
      a.className = "cite file-link";
      a.dataset.path = m[1];
      if (m[2]) a.dataset.line = m[2];
      a.textContent = m[2] ? `${m[1]}:${m[2]}` : m[1];
      frag.appendChild(a);
      last = matchStart + m[1].length + (m[2] ? m[2].length + 1 : 0);
    }
    frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.replaceWith(frag);
  }
}

/** Compact one-line preview of tool args, e.g. `path: "src/index.ts"`. */
function argPreview(args: unknown): string {
  if (args == null) return "";
  if (typeof args !== "object") return String(args).slice(0, 80);
  const entries = Object.entries(args as Record<string, unknown>);
  if (entries.length === 0) return "";
  return entries
    .slice(0, 2)
    .map(([k, v]) => `${k}: ${typeof v === "string" ? JSON.stringify(v.length > 40 ? v.slice(0, 40) + "…" : v) : JSON.stringify(v)}`)
    .join(", ")
    .slice(0, 90);
}

// ── Progress accordion: consecutive file reads fold into one group ──
// "▤ Read 4 files" with a live, clickable file list (Copilot-style).
let readGroup: { el: HTMLDetailsElement; list: HTMLDivElement; label: HTMLSpanElement; count: number } | null = null;

function isReadTool(name: string, args: unknown): string | null {
  if (!/read|cat|view|open/i.test(name)) return null;
  if (args == null || typeof args !== "object") return null;
  const obj = args as Record<string, unknown>;
  for (const key of ["path", "file", "filePath"]) {
    if (typeof obj[key] === "string") return obj[key] as string;
  }
  return null;
}

function closeReadGroup(): void {
  readGroup = null;
}

function addToReadGroup(path: string): void {
  if (!readGroup) {
    const el = document.createElement("details");
    el.className = "row read-group";
    el.innerHTML =
      `<summary><span class="chev">▶</span><span class="tool-icon">▤</span>` +
      `<span class="rg-label">Reading files…</span></summary>`;
    const list = document.createElement("div");
    list.className = "rg-list";
    el.appendChild(list);
    append(el);
    readGroup = { el, list, label: el.querySelector(".rg-label") as HTMLSpanElement, count: 0 };
  }
  readGroup.count++;
  readGroup.label.textContent = `Read ${readGroup.count} file${readGroup.count === 1 ? "" : "s"}`;
  const item = document.createElement("div");
  item.className = "rg-item";
  item.innerHTML = `<a class="file-link" data-path="${escapeHtml(path)}">${escapeHtml(path)}</a>`;
  readGroup.list.appendChild(item);
}

function addToolRow(name: string, args: unknown, id?: string, opts: { replay?: boolean } = {}): void {
  const details = document.createElement("details");
  details.className = "row tool-row" + (opts.replay ? "" : " running");
  const argsStr = JSON.stringify(args, null, 2) ?? "";
  details.innerHTML =
    `<summary><span class="chev">▶</span><span class="tool-icon">${toolIcon(name)}</span>` +
    `<span class="tool-name">${escapeHtml(name)}</span>` +
    `<span class="arg-preview">${escapeHtml(argPreview(args))}</span>` +
    `<span class="state">${opts.replay ? "" : '<span class="spinner mini"></span>'}</span></summary>` +
    `<div class="row-details"><pre><code>${escapeHtml(argsStr)}</code></pre></div>`;
  append(details);
  pendingTools.set(id ?? name, { row: details, started: Date.now() });
}

function resolveToolRow(name: string, result: unknown, id?: string): void {
  const key = id ?? name;
  const pending = pendingTools.get(key);
  pendingTools.delete(key);
  if (!pending) return;
  const { row, started } = pending;
  row.classList.remove("running");
  const ok = !(result && typeof result === "object" && (result as any).success === false);
  row.classList.add(ok ? "ok" : "fail");
  const secs = (Date.now() - started) / 1000;
  const dur = secs >= 1 ? ` ${secs.toFixed(secs < 10 ? 1 : 0)}s` : "";
  const state = row.querySelector(".state");
  if (state) state.innerHTML = `<span class="${ok ? "check" : "cross"}">${ok ? "✓" : "✗"}</span><span class="dur">${dur}</span>`;
  let resultStr = typeof result === "string" ? result : JSON.stringify(result, null, 2) ?? "";
  if (resultStr.length > 4000) resultStr = resultStr.slice(0, 4000) + "\n… (truncated)";
  const body = row.querySelector(".row-details");
  if (body) {
    const pre = document.createElement("pre");
    pre.innerHTML = `<code>${escapeHtml(resultStr)}</code>`;
    body.appendChild(pre);
  }
}

function addEditRow(path: string, diff?: string): void {
  const hasDiff = typeof diff === "string" && diff.trim().length > 0;
  const el = document.createElement(hasDiff ? "details" : "div");
  el.className = "row edit-row";
  const link = `<a class="file-link" data-path="${escapeHtml(path)}">${escapeHtml(path)}</a>`;
  if (hasDiff) {
    // Claude-style +N −M stats from the diff body
    let plus = 0, minus = 0;
    for (const line of diff!.split("\n")) {
      if (line.startsWith("+") && !line.startsWith("+++")) plus++;
      else if (line.startsWith("-") && !line.startsWith("---")) minus++;
    }
    const stats = `<span class="diffstat"><span class="plus">+${plus}</span> <span class="minus">−${minus}</span></span>`;
    const highlighted = hljs.highlight(diff!.slice(0, 20000), { language: "diff" }).value;
    el.innerHTML =
      `<summary><span class="chev">▶</span>✎ ${link}${stats}</summary>` +
      `<div class="diff-body"><pre><code class="hljs diff">${highlighted}</code></pre></div>`;
  } else {
    el.innerHTML = `✎ ${link}`;
  }
  append(el as HTMLElement);
}

// ── Live thinking block (Claude Code-style) ──────────────────────
// While the model reasons, an expanded "✻ Thinking" row streams the tokens;
// it auto-collapses the moment real output (text/tool call) begins.
let thinkingRow: HTMLDetailsElement | null = null;
let thinkingBody: HTMLDivElement | null = null;
let thinkingRaw = "";

function ensureThinkingRow(): void {
  if (thinkingRow) return;
  thinkingRow = document.createElement("details");
  thinkingRow.className = "row reasoning live";
  thinkingRow.open = true;
  thinkingRow.innerHTML =
    `<summary><span class="chev">▶</span><span class="thinking-label">✻ Thinking</span></summary>`;
  thinkingBody = document.createElement("div");
  thinkingBody.className = "body";
  thinkingRow.appendChild(thinkingBody);
  thinkingRaw = "";
  append(thinkingRow);
}

function streamThinking(delta: string): void {
  ensureThinkingRow();
  thinkingRaw += delta;
  if (thinkingBody) {
    const stick = isNearBottom();
    // Show the live tail, keep the full text for the collapsed state
    thinkingBody.textContent = thinkingRaw;
    maybeScroll(stick);
  }
}

function collapseThinking(finalContent?: string): void {
  if (!thinkingRow) return;
  if (finalContent && thinkingBody) thinkingBody.textContent = finalContent;
  thinkingRow.open = false;
  thinkingRow.classList.remove("live");
  thinkingRow = null;
  thinkingBody = null;
  thinkingRaw = "";
}

function addReasoningRow(content: string): void {
  const details = document.createElement("details");
  details.className = "row reasoning";
  details.innerHTML =
    `<summary><span class="chev">▶</span><span class="thinking-label">✻ Thinking</span></summary>` +
    `<div class="body">${escapeHtml(content)}</div>`;
  append(details);
}

// ── Slash-command intent menu (Copilot-style) ────────────────────
const slashMenuEl = document.getElementById("slash-menu")!;
const SLASH_COMMANDS: Array<{ cmd: string; desc: string; template?: string; action?: () => void }> = [
  { cmd: "/explain", desc: "Explain the selected code", template: "Explain what the selected code does, including edge cases." },
  { cmd: "/fix", desc: "Find and fix a bug", template: "Find and fix the bug in the selected code." },
  { cmd: "/test", desc: "Write tests", template: "Write tests for the selected code." },
  { cmd: "/doc", desc: "Add documentation", template: "Add documentation comments to the selected code." },
  { cmd: "/refactor", desc: "Refactor for clarity", template: "Refactor the selected code for clarity and maintainability." },
  { cmd: "/clear", desc: "Clear the conversation", action: () => vscode.postMessage({ type: "clear" }) },
];
let slashSel = 0;
let slashMatches: typeof SLASH_COMMANDS = [];

function updateSlashMenu(): void {
  const value = input.value;
  const match = /^\/(\w*)$/.exec(value);
  if (!match) {
    slashMenuEl.classList.remove("open");
    slashMatches = [];
    return;
  }
  slashMatches = SLASH_COMMANDS.filter((c) => c.cmd.startsWith("/" + match[1]));
  if (slashMatches.length === 0) {
    slashMenuEl.classList.remove("open");
    return;
  }
  slashSel = Math.min(slashSel, slashMatches.length - 1);
  slashMenuEl.innerHTML = slashMatches
    .map(
      (c, i) =>
        `<div class="sm-item${i === slashSel ? " sel" : ""}" data-i="${i}">` +
        `<span class="sm-cmd">${c.cmd}</span><span class="sm-desc">${escapeHtml(c.desc)}</span></div>`
    )
    .join("");
  slashMenuEl.classList.add("open");
}

function chooseSlash(i: number): void {
  const choice = slashMatches[i];
  if (!choice) return;
  slashMenuEl.classList.remove("open");
  slashMatches = [];
  if (choice.action) {
    choice.action();
    input.value = "";
  } else {
    input.value = choice.template ?? "";
  }
  input.focus();
  input.dispatchEvent(new Event("input"));
}

slashMenuEl.addEventListener("mousedown", (e) => {
  const item = (e.target as HTMLElement).closest(".sm-item") as HTMLElement | null;
  if (item) {
    e.preventDefault();
    chooseSlash(Number(item.dataset.i));
  }
});

// ── Implicit-context pills ───────────────────────────────────────
const pillsEl = document.getElementById("context-pills")!;
let ctxFile: string | null = null;
let ctxSelLines = 0;
let dismissedFile = false;
let dismissedSel = false;

function renderPills(): void {
  const pills: string[] = [];
  if (ctxFile && !dismissedFile) {
    const short = ctxFile.length > 36 ? "…" + ctxFile.slice(-36) : ctxFile;
    pills.push(
      `<span class="pill" data-pill="file">▤ <span class="pill-label">${escapeHtml(short)}</span><span class="x" title="Don't send this file">×</span></span>`
    );
  }
  if (ctxSelLines > 0 && !dismissedSel) {
    pills.push(
      `<span class="pill" data-pill="sel">☰ <span class="pill-label">selection · ${ctxSelLines} line${ctxSelLines === 1 ? "" : "s"}</span><span class="x" title="Don't send the selection">×</span></span>`
    );
  }
  pillsEl.innerHTML = pills.join("");
}

pillsEl.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (!target.classList.contains("x")) return;
  const pill = target.closest(".pill") as HTMLElement | null;
  if (pill?.dataset.pill === "file") dismissedFile = true;
  if (pill?.dataset.pill === "sel") dismissedSel = true;
  renderPills();
});

// ── Follow-up suggestion chips ───────────────────────────────────
function clearSuggestions(): void {
  document.getElementById("suggestions")?.remove();
}

function showSuggestions(items: string[]): void {
  clearSuggestions();
  if (!items.length) return;
  const row = document.createElement("div");
  row.id = "suggestions";
  for (const item of items) {
    const chip = document.createElement("button");
    chip.className = "chip";
    chip.textContent = item;
    chip.addEventListener("click", () => {
      input.value = item;
      send();
    });
    row.appendChild(chip);
  }
  append(row);
}

function send(): void {
  const task = input.value.trim();
  if (!task || running) return;
  clearSuggestions();
  slashMenuEl.classList.remove("open");
  setRunning(true);
  addTextMsg(task, "user");
  setStatus("Starting…");
  input.value = "";
  input.style.height = "auto";
  vscode.postMessage({
    type: "run",
    task,
    includeFile: !dismissedFile,
    includeSelection: !dismissedSel,
  });
}

sendBtn.addEventListener("click", () => {
  if (running) {
    vscode.postMessage({ type: "stop" });
  } else {
    send();
  }
});

input.addEventListener("keydown", (e) => {
  if (slashMenuEl.classList.contains("open")) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      slashSel = (slashSel + 1) % slashMatches.length;
      updateSlashMenu();
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      slashSel = (slashSel - 1 + slashMatches.length) % slashMatches.length;
      updateSlashMenu();
      return;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      chooseSlash(slashSel);
      return;
    }
    if (e.key === "Escape") {
      slashMenuEl.classList.remove("open");
      return;
    }
  }
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 140) + "px";
  updateSlashMenu();
});
input.addEventListener("blur", () => {
  // Delay so menu clicks land before the menu hides
  setTimeout(() => slashMenuEl.classList.remove("open"), 150);
});

function setRunning(next: boolean): void {
  running = next;
  sendBtn.innerHTML = next ? STOP_ICON : SEND_ICON;
  sendBtn.title = next ? "Stop" : "Send (⏎)";
  sendBtn.classList.toggle("stop", next);
  if (next) {
    runStart = Date.now();
    reasoningTail = "";
    if (!elapsedTimer) elapsedTimer = setInterval(renderStatus, 1000);
  } else {
    runStart = 0;
    if (elapsedTimer) {
      clearInterval(elapsedTimer);
      elapsedTimer = undefined;
    }
    setStatus(null);
    finalizeStreamBubble(null);
  }
}

function handleEvent(event: any, opts: { replay?: boolean } = {}): void {
  switch (event.type) {
    case "plan": {
      const div = document.createElement("div");
      div.className = "msg plan";
      const ol = document.createElement("ol");
      (event.steps as string[]).forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        ol.appendChild(li);
      });
      div.innerHTML = '<div class="plan-title">Plan</div>';
      div.appendChild(ol);
      append(div);
      break;
    }
    case "text_delta":
      if (!opts.replay) collapseThinking();
      closeReadGroup();
      appendStream(event.content);
      break;
    case "text":
      if (opts.replay) {
        addMsg(renderMarkdown(event.content), "agent");
      } else {
        if (!streamingBubble) startStreamBubble();
        finalizeStreamBubble(event.content);
      }
      break;
    case "reasoning_delta":
      if (!opts.replay) {
        streamThinking(String(event.content ?? ""));
        streamReasoning(String(event.content ?? ""));
      }
      break;
    case "reasoning":
      reasoningTail = "";
      if (!opts.replay && thinkingRow) {
        // Live block already streamed it — just finalize and collapse
        collapseThinking(typeof event.content === "string" ? event.content : undefined);
      } else if (typeof event.content === "string" && event.content.trim()) {
        addReasoningRow(event.content);
      }
      break;
    case "thinking":
      // Ephemeral status ("Preparing context and tools…") — one line, updated
      // in place, never stacked into the transcript.
      if (!opts.replay) setStatus(String(event.content));
      break;
    case "tool_call":
      if (event.name !== "thinking") {
        if (!opts.replay) collapseThinking();
        const readPath = isReadTool(String(event.name), event.args);
        if (readPath) {
          // Fold consecutive reads into the progress accordion
          addToReadGroup(readPath);
        } else {
          closeReadGroup();
          addToolRow(String(event.name), event.args, event.id, opts);
        }
        if (!opts.replay) {
          const arg = primaryArg(event.args);
          setStatus(arg ? `${event.name} · ${arg}` : `${event.name}…`);
        }
      }
      break;
    case "tool_result":
      resolveToolRow(String(event.name), event.result, event.id);
      break;
    case "edit":
      closeReadGroup();
      addEditRow(String(event.path), typeof event.diff === "string" ? event.diff : undefined);
      break;
    case "eval": {
      const div = document.createElement("div");
      div.className = "row " + (event.passed ? "ok" : "fail");
      div.textContent = event.passed ? "✓ Tests passed" : "✗ Tests failed — retrying…";
      append(div);
      break;
    }
    case "ask_user":
      addTextMsg(String(event.question), "notice");
      break;
    case "done":
      closeReadGroup();
      if (!opts.replay) {
        collapseThinking();
        finalizeStreamBubble(null);
        setRunning(false);
      }
      break;
    case "error":
      if (!opts.replay) {
        collapseThinking();
        finalizeStreamBubble(null);
      }
      addTextMsg(String(event.message), "error");
      if (!opts.replay) setRunning(false);
      break;
    case "usage":
      tokens += event.totalTokens ?? 0;
      cost += ((event.promptTokens ?? 0) * 3 + (event.completionTokens ?? 0) * 15) / 1_000_000;
      updateTokenCounter();
      break;
  }
}

window.addEventListener("message", (e) => {
  const { type, event, entries, running: runState, task, model, provider, file, selectionLines } = e.data ?? {};

  switch (type) {
    case "context": {
      const newFile = (file as string | null) ?? null;
      if (newFile !== ctxFile) dismissedFile = false; // new file → pill returns
      const newSel = Number(selectionLines ?? 0);
      if (newSel !== ctxSelLines && newSel > 0) dismissedSel = false;
      ctxFile = newFile;
      ctxSelLines = newSel;
      renderPills();
      return;
    }
    case "suggestions":
      if (!running && Array.isArray(e.data.items)) {
        showSuggestions((e.data.items as unknown[]).filter((s): s is string => typeof s === "string"));
      }
      return;
    case "config":
      modelId = String(model ?? "");
      modelBadgeEl.textContent = provider ? `${provider} · ${modelId.replace(/^[^/]*\//, "")}` : modelId;
      return;
    case "cleared":
      messagesEl.innerHTML = "";
      messagesEl.appendChild(statusEl); // survives transcript wipes
      pendingTools.clear();
      tokens = 0;
      cost = 0;
      updateTokenCounter();
      setStatus(null);
      addTextMsg("Conversation cleared.", "notice");
      return;
    case "user_task":
      // Task submitted from the command palette — mirror it into the chat.
      addTextMsg(String(task), "user");
      return;
    case "run_state":
      setRunning(Boolean(runState));
      return;
    case "replay": {
      messagesEl.innerHTML = "";
      messagesEl.appendChild(statusEl);
      pendingTools.clear();
      tokens = 0;
      cost = 0;
      for (const entry of entries as Array<{ kind: string; task?: string; event?: any }>) {
        if (entry.kind === "user") addTextMsg(String(entry.task), "user");
        else if (entry.kind === "event") handleEvent(entry.event, { replay: true });
      }
      updateTokenCounter();
      setRunning(Boolean(runState));
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return;
    }
    case "event":
      handleEvent(event);
      return;
  }
});

function updateTokenCounter(): void {
  if (!tokenCounterEl) return;
  if (tokens === 0) {
    tokenCounterEl.textContent = "";
    return;
  }
  const kTokens = tokens > 1000 ? (tokens / 1000).toFixed(1) + "k" : String(tokens);
  // Cost estimate only makes sense for metered cloud models.
  const isLocal = modelId.startsWith("ollama/");
  tokenCounterEl.textContent = isLocal ? `${kTokens} tokens` : `${kTokens} tokens · ~$${cost.toFixed(3)}`;
}

// Handle file links + code-block action buttons
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;

  if (target.classList.contains("file-link")) {
    e.preventDefault();
    e.stopPropagation();
    const path = target.getAttribute("data-path");
    const line = target.getAttribute("data-line");
    if (path) vscode.postMessage({ type: "open_file", path, line: line ? Number(line) : undefined });
    return;
  }

  const cbBtn = target.closest(".cb-btn") as HTMLElement | null;
  if (cbBtn) {
    e.preventDefault();
    const block = cbBtn.closest(".codeblock");
    const code = block?.querySelector("pre code")?.textContent ?? "";
    if (!code) return;
    if (cbBtn.dataset.act === "copy") {
      navigator.clipboard?.writeText(code).catch(() => vscode.postMessage({ type: "copy", code }));
      const prev = cbBtn.textContent;
      cbBtn.textContent = "Copied ✓";
      setTimeout(() => (cbBtn.textContent = prev), 1200);
    } else if (cbBtn.dataset.act === "insert") {
      vscode.postMessage({ type: "insert_code", code });
    }
  }
});

vscode.postMessage({ type: "ready" });
