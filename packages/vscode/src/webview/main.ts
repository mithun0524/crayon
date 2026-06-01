import { marked } from "marked";
import hljs from "highlight.js";

marked.use({
  renderer: {
    code({ text, lang }: any) {
      const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext';
      return `<pre><code class="hljs ${language}">${hljs.highlight(text, { language }).value}</code></pre>`;
    }
  }
});

declare function acquireVsCodeApi(): any;
const vscode = acquireVsCodeApi();

const messagesEl = document.getElementById("messages")!;
const input = document.getElementById("task-input") as HTMLTextAreaElement;
const sendBtn = document.getElementById("send-btn") as HTMLButtonElement;
const clearBtn = document.getElementById("clear-btn") as HTMLButtonElement;
const tokenCounterEl = document.getElementById("token-counter") as HTMLSpanElement;

let running = false;
let streamingBubble: HTMLDivElement | null = null;
let tokens = 0;
let cost = 0;

function addMsg(htmlContent: string, cls: string): HTMLDivElement {
  const div = document.createElement("div");
  div.className = "msg " + cls;
  div.innerHTML = htmlContent;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}

function startStreamBubble() {
  streamingBubble = document.createElement("div");
  streamingBubble.className = "msg agent streaming";
  streamingBubble.innerHTML = "";
  messagesEl.appendChild(streamingBubble);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return streamingBubble;
}

function appendStream(delta: string) {
  if (!streamingBubble) startStreamBubble();
  const currentRaw = streamingBubble!.getAttribute("data-raw") || "";
  const newRaw = currentRaw + delta;
  streamingBubble!.setAttribute("data-raw", newRaw);
  streamingBubble!.innerHTML = marked.parse(newRaw) as string;
  messagesEl.scrollTop = messagesEl.scrollHeight;
}

function finalizeStreamBubble(fullText: string | null) {
  if (streamingBubble) {
    streamingBubble.classList.remove("streaming");
    if (fullText) {
      streamingBubble.innerHTML = marked.parse(fullText) as string;
    }
    streamingBubble = null;
  }
}

function send() {
  const task = input.value.trim();
  if (!task || running) return;
  running = true;
  sendBtn.textContent = "■";
  sendBtn.classList.add("stop");
  sendBtn.disabled = false;
  addMsg(task, "user");
  input.value = "";
  input.style.height = "auto";
  vscode.postMessage({ type: "run", task });
}

sendBtn.addEventListener("click", () => {
  if (running) {
    vscode.postMessage({ type: "stop" });
    finalizeStreamBubble("");
    setIdle();
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

function setIdle() {
  running = false;
  sendBtn.textContent = "Run";
  sendBtn.classList.remove("stop");
  sendBtn.disabled = false;
  streamingBubble = null;
}

window.addEventListener("message", (e) => {
  const { type, event } = e.data;

  if (type === "cleared") {
    messagesEl.innerHTML = "";
    addMsg("Conversation cleared.", "system");
    tokens = 0;
    cost = 0;
    updateTokenCounter();
    return;
  }

  if (type !== "event") return;

  switch (event.type) {
    case "plan": {
      const ol = document.createElement("ol");
      event.steps.forEach((s: string) => {
        const li = document.createElement("li");
        li.textContent = s;
        ol.appendChild(li);
      });
      const div = document.createElement("div");
      div.className = "msg plan";
      div.innerHTML = "<strong>Plan</strong>";
      div.appendChild(ol);
      messagesEl.appendChild(div);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      break;
    }
    case "text_delta":
      appendStream(event.content);
      break;
    case "text":
      finalizeStreamBubble(event.content);
      break;
    case "tool_call": {
      if (event.name !== "thinking") {
        const argsStr = JSON.stringify(event.args, null, 2);
        addMsg(
          `<details class="tool-call">
            <summary>→ ${event.name}</summary>
            <pre><code>${argsStr}</code></pre>
          </details>`,
          "tool"
        );
      }
      break;
    }
    case "edit":
      addMsg(`✎ <a href="#" class="file-link" data-path="${event.path}">${event.path}</a>`, "edit");
      break;
    case "eval":
      addMsg(
        event.passed ? "✓ Tests passed" : "✗ Tests failed — retrying...",
        event.passed ? "eval-pass" : "eval-fail"
      );
      break;
    case "thinking":
      addMsg(`<em>${event.content}</em>`, "system");
      break;
    case "done":
      finalizeStreamBubble(null);
      setIdle();
      break;
    case "error":
      finalizeStreamBubble(null);
      addMsg("Error: " + event.message, "error");
      setIdle();
      break;
    case "usage":
      tokens += event.totalTokens;
      // Rough cost estimate assuming Sonnet
      cost += (event.promptTokens * 3 + event.completionTokens * 15) / 1000000;
      updateTokenCounter();
      break;
  }
});

function updateTokenCounter() {
  if (tokenCounterEl) {
    const kTokens = tokens > 1000 ? (tokens / 1000).toFixed(1) + "k" : tokens;
    tokenCounterEl.textContent = ` ${kTokens} tokens ($${cost.toFixed(3)})`;
  }
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

addMsg("Ready. Describe a task and Crayon will plan, code, and test autonomously.", "system");
