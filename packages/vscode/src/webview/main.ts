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
import diff from "highlight.js/lib/languages/diff";

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
hljs.registerLanguage("diff", diff);

marked.use({
  renderer: {
    code({ text, lang }: { text: string; lang?: string }) {
      const language = lang && hljs.getLanguage(lang) ? lang : "plaintext";
      const highlighted =
        language === "plaintext"
          ? escapeHtml(text)
          : hljs.highlight(text, { language }).value;
      return `<pre><code class="hljs ${language}">${highlighted}</code></pre>`;
    },
  },
});

declare function acquireVsCodeApi(): { postMessage(msg: unknown): void };
const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById("messages")!;
const input = document.getElementById("task-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const tokenCounterEl = document.getElementById("token-counter") as HTMLSpanElement;

let running = false;
let streamingBubble: HTMLDivElement | null = null;
let streamRaw = "";
let renderScheduled = false;
let tokens = 0;
let cost = 0;

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

/** Stick to the bottom only when the user is already reading the bottom. */
function isNearBottom(): boolean {
  return messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 48;
}

function maybeScroll(wasNearBottom: boolean): void {
  if (wasNearBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
}

function addMsg(htmlContent: string, cls: string): HTMLDivElement {
  const stick = isNearBottom();
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.innerHTML = htmlContent;
  messagesEl.appendChild(div);
  maybeScroll(stick);
  return div;
}

function addTextMsg(text: string, cls: string): HTMLDivElement {
  const stick = isNearBottom();
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.textContent = text;
  messagesEl.appendChild(div);
  maybeScroll(stick);
  return div;
}

function startStreamBubble(): void {
  streamingBubble = document.createElement("div");
  streamingBubble.className = "msg agent streaming";
  streamRaw = "";
  messagesEl.appendChild(streamingBubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

/**
 * Token deltas are buffered and rendered at most once per animation frame.
 * The old code re-parsed the full markdown and rebuilt the DOM on EVERY
 * delta (O(n²) over the response) which burned CPU and flickered.
 */
function appendStream(delta: string): void {
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
    } else {
      streamingBubble.remove();
    }
    streamingBubble = null;
    streamRaw = "";
  }
}

function send(): void {
  const task = input.value.trim();
  if (!task || running) return;
  setRunning(true);
  addTextMsg(task, "user");
  input.value = "";
  input.style.height = "auto";
  vscode.postMessage({ type: "run", task });
}

sendBtn.addEventListener("click", () => {
  if (running) {
    vscode.postMessage({ type: "stop" });
  } else {
    send();
  }
});

clearBtn.addEventListener("click", () => {
  vscode.postMessage({ type: "clear" });
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    send();
  }
});

input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 120) + "px";
});

function setRunning(next: boolean): void {
  running = next;
  if (next) {
    sendBtn.textContent = "■";
    sendBtn.classList.add("stop");
  } else {
    sendBtn.textContent = "Run";
    sendBtn.classList.remove("stop");
    finalizeStreamBubble(null);
  }
  sendBtn.disabled = false;
}

function handleEvent(event: any, opts: { replay?: boolean } = {}): void {
  switch (event.type) {
    case "plan": {
      const stick = isNearBottom();
      const ol = document.createElement("ol");
      (event.steps as string[]).forEach((s) => {
        const li = document.createElement("li");
        li.textContent = s;
        ol.appendChild(li);
      });
      const div = document.createElement("div");
      div.className = "msg plan";
      div.innerHTML = "<strong>Plan</strong>";
      div.appendChild(ol);
      messagesEl.appendChild(div);
      maybeScroll(stick);
      break;
    }
    case "text_delta":
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
    case "tool_call": {
      if (event.name !== "thinking") {
        const argsStr = JSON.stringify(event.args, null, 2);
        addMsg(
          `<details class="tool-call">
            <summary>→ ${escapeHtml(String(event.name))}</summary>
            <pre><code>${escapeHtml(argsStr)}</code></pre>
          </details>`,
          "tool"
        );
      }
      break;
    }
    case "edit":
      addMsg(
        `✎ <a class="file-link" data-path="${escapeHtml(String(event.path))}">${escapeHtml(String(event.path))}</a>`,
        "edit"
      );
      break;
    case "eval":
      addTextMsg(
        event.passed ? "✓ Tests passed" : "✗ Tests failed — retrying...",
        event.passed ? "eval-pass" : "eval-fail"
      );
      break;
    case "thinking":
      addMsg(`<em>${escapeHtml(String(event.content))}</em>`, "system");
      break;
    case "done":
      if (!opts.replay) {
        finalizeStreamBubble(null);
        setRunning(false);
      }
      break;
    case "error":
      if (!opts.replay) finalizeStreamBubble(null);
      addTextMsg("Error: " + String(event.message), "error");
      if (!opts.replay) setRunning(false);
      break;
    case "usage":
      tokens += event.totalTokens ?? 0;
      // Rough estimate at Sonnet-class pricing — labeled as such in the UI.
      cost += ((event.promptTokens ?? 0) * 3 + (event.completionTokens ?? 0) * 15) / 1_000_000;
      updateTokenCounter();
      break;
  }
}

window.addEventListener("message", (e) => {
  const { type, event, entries, running: runState, task } = e.data ?? {};

  switch (type) {
    case "cleared":
      messagesEl.innerHTML = "";
      addTextMsg("Conversation cleared.", "system");
      tokens = 0;
      cost = 0;
      updateTokenCounter();
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
  tokenCounterEl.textContent = ` ${kTokens} tokens (~$${cost.toFixed(3)} est.)`;
}

// Handle file link clicks
document.addEventListener("click", (e) => {
  const target = e.target as HTMLElement;
  if (target.classList.contains("file-link")) {
    e.preventDefault();
    const path = target.getAttribute("data-path");
    if (path) {
      vscode.postMessage({ type: "open_file", path });
    }
  }
});

addTextMsg("Ready. Describe a task and Crayon will plan, code, and test autonomously.", "system");
vscode.postMessage({ type: "ready" });
