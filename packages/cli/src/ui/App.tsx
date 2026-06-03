import React, { useState, useEffect, useRef, useInsertionEffect } from "react";
import { Box, Text, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { SearchableSelect, SelectOption } from "./components/SearchableSelect.js";
import path from "node:path";
import os from "node:os";
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { createTwoFilesPatch } from "diff";
import { CrayonAgent, type AgentEvent, autoCompact, getModelPricing } from "crayon-agent";
import { highlight } from "cli-highlight";
import { marked } from "marked";
import TerminalRenderer from "marked-terminal";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

marked.setOptions({
  renderer: new TerminalRenderer() as any
});
import { loadConfig } from "../config.js";
import { getGitInfo } from "./gitHelper.js";
import { PlanView } from "./PlanView.js";
import { StatusBar } from "./StatusBar.js";
import { DiffRenderer } from "./DiffRenderer.js";
import { saveSession, loadSession } from "../session.js";
import { theme } from "./theme.js";
import { syntaxThemeDark } from "./syntaxTheme.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { AgentProgress } from "./components/AgentProgress.js";
import { ThinkingMessage } from "./messages/ThinkingMessage.js";

interface AppProps {
  mode: "run" | "chat";
  task?: string;
  resume?: boolean;
  permissionMode?: any;
}

interface ChatMessage {
  id: string;
  sender: "user" | "crayon" | "system";
  text: string;
  diff?: string;
  reasoning?: string;
  toolCall?: {
    name: string;
    args: any;
    result?: any;
    status: "running" | "success" | "error";
    error?: string;
  };
}

const AVAILABLE_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation history" },
  { cmd: "/mode", desc: "Change permission mode", usage: "ask | auto-edit | plan | auto | bypass" },
  { cmd: "/cost", desc: "View token usage and cost" },
  { cmd: "/files", desc: "View modified files this session" },
  { cmd: "/compact", desc: "Compact conversation history" },
  { cmd: "/model", desc: "Change the AI model", usage: "[model-name]" },
  { cmd: "/config", desc: "Change provider, model, or theme" },
  { cmd: "/easel", desc: "View the active agent context (files read)" },
  { cmd: "/help", desc: "Show help information" }
];

function buildAsciiTree(paths: string[]): string {
  if (paths.length === 0) return "  (Empty Context)";
  
  const tree: any = {};
  paths.forEach(p => {
    const parts = p.split(/[/\\]/).filter(Boolean);
    let curr = tree;
    parts.forEach(part => {
      if (!curr[part]) curr[part] = {};
      curr = curr[part];
    });
  });

  const lines: string[] = [];
  function traverse(node: any, prefix: string) {
    const keys = Object.keys(node).sort();
    keys.forEach((key, index) => {
      const isLast = index === keys.length - 1;
      const marker = isLast ? "└─ " : "├─ ";
      lines.push(`${prefix}${marker}${key}`);
      const nextPrefix = prefix + (isLast ? "   " : "│  ");
      traverse(node[key], nextPrefix);
    });
  }
  
  traverse(tree, "");
  return lines.join("\n");
}

const POPULAR_MODELS = {
  anthropic: [
    { label: "Claude 4.6 Sonnet (Latest)", value: "claude-sonnet-4-6" },
    { label: "Claude 4.8 Opus", value: "claude-opus-4-8" },
    { label: "Claude 4.5 Haiku", value: "claude-haiku-4-5-20251001" },
    { label: "Claude 3.7 Sonnet", value: "claude-3-7-sonnet-latest" }
  ],
  openai: [
    { label: "GPT-4.5", value: "gpt-4.5" },
    { label: "GPT-4o (Latest)", value: "gpt-4o" },
    { label: "o3 Mini", value: "o3-mini" },
    { label: "o1", value: "o1" }
  ],
  google: [
    { label: "Gemini 2.5 Pro", value: "gemini-2.5-pro" },
    { label: "Gemini 2.0 Flash", value: "gemini-2.0-flash" }
  ],
  openrouter: [
    { label: "Anthropic: Claude 4.6 Sonnet", value: "anthropic/claude-sonnet-4-6" },
    { label: "OpenAI: GPT-4.5", value: "openai/gpt-4.5" },
    { label: "OpenAI: o3 Mini", value: "openai/o3-mini" },
    { label: "Google: Gemini 2.5 Pro", value: "google/gemini-2.5-pro" },
    { label: "DeepSeek: R1", value: "deepseek/deepseek-r1" },
    { label: "Meta: Llama 3.3 70B", value: "meta-llama/llama-3.3-70b-instruct" }
  ]
};

const getToolCallInitialText = (name: string, args: any) => {
  switch (name) {
    case "read_file":
      return `⏳ Reading ${args?.path || ""}`;
    case "edit_file":
    case "edit_ast":
      return `⏳ Editing ${args?.path || ""}`;
    case "write_file":
      return `⏳ Creating ${args?.path || ""}`;
    case "overwrite_file":
      return `⏳ Overwriting ${args?.path || ""}`;
    case "grep":
      return `⏳ Searching for "${args?.pattern || ""}"`;
    case "search_codebase":
      return `⏳ Searching codebase for "${args?.query || ""}"`;
    case "terminal":
      return `⏳ Running command: ${args?.command || ""}`;
    case "list_directory":
      return `⏳ Listing directory: ${args?.path || "."}`;
    case "fetch_url":
      return `⏳ Fetching URL: ${args?.url || ""}`;
    case "delete_file":
      return `⏳ Deleting ${args?.path || ""}`;
    case "rename_file":
      return `⏳ Renaming ${args?.old_path || ""} -> ${args?.new_path || ""}`;
    case "git_status":
      return `⏳ Getting Git status`;
    case "git_diff":
      return `⏳ Getting Git diff`;
    case "git_commit":
      return `⏳ Committing changes`;
    default:
      return `⏳ Running tool ${name}`;
  }
};

const getToolCallCompletedText = (name: string, args: any, result: any, isError: boolean) => {
  const icon = isError ? "✗" : "✓";
  if (isError) {
    const errMsg = result?.error || "Error";
    return `${icon} Failed tool ${name}: ${errMsg}`;
  }
  
  switch (name) {
    case "read_file": {
      const lineCount = result?.content ? result.content.split("\n").length : 0;
      const byteCount = result?.content ? Buffer.byteLength(result.content, "utf-8") : 0;
      return `${icon} Read ${args?.path || ""} (${lineCount} lines, ${byteCount} bytes)`;
    }
    case "edit_file":
    case "edit_ast":
      return `${icon} Edited ${args?.path || ""}`;
    case "write_file":
      return `${icon} Created ${args?.path || ""}`;
    case "overwrite_file":
      return `${icon} Overwrote ${args?.path || ""}`;
    case "grep": {
      const matchesCount = result?.matches?.length || 0;
      return `${icon} Searched for "${args?.pattern || ""}" (${matchesCount} matches)`;
    }
    case "search_codebase": {
      const matchesCount = result?.matches?.length || 0;
      return `${icon} Searched codebase for "${args?.query || ""}" (${matchesCount} matches)`;
    }
    case "terminal":
      return `${icon} Ran command: ${args?.command || ""}`;
    case "list_directory": {
      const entryCount = result?.entries?.length || 0;
      return `${icon} Listed directory: ${args?.path || "."} (${entryCount} entries)`;
    }
    case "fetch_url": {
      const byteCount = result?.content ? Buffer.byteLength(result.content, "utf-8") : 0;
      return `${icon} Fetched URL: ${args?.url || ""} (${byteCount} bytes)`;
    }
    case "delete_file":
      return `${icon} Deleted ${args?.path || ""}`;
    case "rename_file":
      return `${icon} Renamed ${args?.old_path || ""} -> ${args?.new_path || ""}`;
    case "git_status":
      return `${icon} Got Git status (branch: ${result?.branch || "unknown"})`;
    case "git_diff":
      return `${icon} Got Git diff`;
    case "git_commit":
      return `${icon} Committed with message: ${args?.message || ""}`;
    default:
      return `${icon} Ran tool ${name}`;
  }
};

export const App: React.FC<AppProps> = ({ mode, task, resume, permissionMode }) => {
  const { exit } = useApp();
  const { rows } = useTerminalSize();

  // Enter alternate screen buffer so Ink constrains rendering to the viewport.
  // useInsertionEffect fires BEFORE Ink's first onRender, so the alt-screen
  // escape reaches the terminal before any content does (same pattern as
  // claude-code's AlternateScreen.tsx).
  useInsertionEffect(() => {
    const ENTER = '\x1b[?1049h';
    const EXIT  = '\x1b[?1049l';
    process.stdout.write(ENTER + '\x1b[2J\x1b[H'); // enter + clear + home cursor
    return () => {
      process.stdout.write(EXIT);
    };
  }, []);

  const [gitBranch, setGitBranch] = useState("main");
  const [gitDirtyCount, setGitDirtyCount] = useState(0);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [queuedTasks, setQueuedTasks] = useState<string[]>([]);

  const [activePlan, setActivePlan] = useState<string[]>([]);
  const activePlanRef = useRef<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  // We keep the state for triggering re-renders (used by getToolDisplay)
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [activeToolArgs, setActiveToolArgs] = useState<any>(null);
  const activeToolNameRef = useRef<string | null>(null);
  const activeToolArgsRef = useRef<any>(null);
  const activeToolMessageIdRef = useRef<string | null>(null);

  const updateMessage = (id: string, updates: Partial<Omit<ChatMessage, "id">>) => {
    setHistory((prev) => {
      const next = prev.map((msg) => (msg.id === id ? { ...msg, ...updates } : msg));
      if (agentRef.current) {
        saveSession(workspaceRoot, agentRef.current.getHistory(), next).catch(() => {});
      }
      return next;
    });
  };
  const [tokens, setTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentInput, setCurrentInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [inputHistoryIndex, setInputHistoryIndex] = useState(-1);
  const [approvalRequest, setApprovalRequest] = useState<any>(null);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const [agentMode, setAgentMode] = useState<string>(permissionMode || "ask");
  const [defaultModel, setDefaultModel] = useState<string>("");
  const [currentProvider, setCurrentProvider] = useState<"anthropic" | "openai" | "google" | "openrouter">("anthropic");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<SelectOption[]>([]);
  // How many messages scrolled up from the bottom (0 = at bottom / live view)
  const [scrollOffset, setScrollOffset] = useState(0);
  const scrollOffsetRef = useRef(0);

  const agentRef = useRef<CrayonAgent | null>(null);
  const abortedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const historyCountRef = useRef(0);
  const executionStartTime = useRef<number | undefined>(undefined);

  const modeSwitchTimeRef = useRef(0);
  const workspaceRoot = process.cwd();
  const workspaceName = path.basename(workspaceRoot);

  const pushMessage = (msg: Omit<ChatMessage, "id">) => {
    historyCountRef.current += 1;
    const newMsg = { ...msg, id: String(historyCountRef.current) };
    setHistory((prev) => {
      const next = [...prev, newMsg];
      if (agentRef.current) {
        saveSession(workspaceRoot, agentRef.current.getHistory(), next).catch(() => {});
      }
      return next;
    });
    // Auto-snap to bottom whenever a new message arrives
    scrollOffsetRef.current = 0;
    setScrollOffset(0);
  };

  useEffect(() => {
    let active = true;

    async function initAgent() {
      let version = "0.1.0";
      try {
        const pkgPath = path.resolve(__dirname, "../../package.json");
        if (existsSync(pkgPath)) {
          const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
          version = pkg.version || "0.1.0";
        }
      } catch {}

      pushMessage({
        sender: "system",
        text: `⬡ Crayon v${version} · Workspace: ${workspaceName}`
      });

      const git = getGitInfo(workspaceRoot);
      if (active) {
        setGitBranch(git.branch);
        setGitDirtyCount(git.dirtyCount);
      }

      const config = await loadConfig();
      if (!active) return;

      const loadedMode = permissionMode || config.permissionMode || "ask";
      setAgentMode(loadedMode);
      setDefaultModel(config.defaultModel || "");
      setCurrentProvider(config.provider as any);
      
      let baseModels = POPULAR_MODELS[config.provider as keyof typeof POPULAR_MODELS] || POPULAR_MODELS.anthropic;
      setAvailableModels(baseModels);

      if (config.provider === "openrouter") {
        fetch("https://openrouter.ai/api/v1/models")
          .then(res => res.json())
          .then((data: any) => {
            if (data && data.data && Array.isArray(data.data)) {
              const fetchedModels = data.data.map((m: any) => ({
                label: m.name,
                value: m.id,
                description: m.context_length ? `${Math.round(m.context_length/1000)}k ctx` : undefined
              }));
              setAvailableModels(fetchedModels);
            }
          })
          .catch(() => {});
      }

      const agent = new CrayonAgent({
        workspaceRoot,
        model: config.defaultModel,
        provider: config.provider,
        anthropicApiKey: config.anthropicApiKey,
        openaiApiKey: config.openaiApiKey,
        openrouterApiKey: config.openrouterApiKey,
        googleApiKey: config.googleApiKey,
        permissionMode: loadedMode as any,
        mcpServers: config.mcpServers,
        onEvent: (event: AgentEvent) => {
          if (!active || abortedRef.current) return;
          handleAgentEvent(event);
        },
        approveCommand: async (command) => {
          if (!active || abortedRef.current) return false;
          return new Promise<boolean>((resolve) => {
            setApprovalRequest({ type: "command", command, resolve });
          });
        },
        approveEdit: async (filePath, newContent) => {
          if (!active || abortedRef.current) return false;
          let diff = "";
          let originalContent = "";
          try {
            const absPath = path.resolve(workspaceRoot, filePath);
            originalContent = existsSync(absPath) ? await readFile(absPath, "utf-8") : "";
            diff = createTwoFilesPatch(filePath, filePath, originalContent, newContent);
          } catch {
            diff = `Proposed edit in ${filePath}`;
          }

          return new Promise<boolean>((resolve) => {
            setApprovalRequest({
              type: "edit",
              path: filePath,
              diff,
              originalContent,
              newContent,
              resolve,
            });
          });
        },
      });

      agentRef.current = agent;

      if (resume) {
        const session = await loadSession(workspaceRoot);
        if (session) {
          agent.setHistory(session.history || []);
          // Note: we don't restore UI chatLog to avoid screen clutter on boot,
          // just the agent's internal memory
          pushMessage({ sender: "system", text: "↺ Session resumed from disk." });
        } else {
          pushMessage({ sender: "system", text: "⚠ No previous session found to resume." });
        }
      }

      if (mode === "run" && task) {
        runTask(agent, task);
      }
    }

    initAgent();

    return () => {
      active = false;
      if (agentRef.current) {
        agentRef.current.close();
      }
    };
  }, []);

  const runTask = async (agent: CrayonAgent, taskText: string) => {
    setIsExecuting(true);
    setStreamingText("");
    setStreamingReasoning("");
    setActivePlan([]);
    activePlanRef.current = [];
    setCurrentStepIndex(0);
    abortedRef.current = false;
    abortControllerRef.current = new AbortController();
    executionStartTime.current = Date.now();

    try {
      const result = await agent.run(taskText, { skipHistory: mode === "run", signal: abortControllerRef.current.signal });
      if (abortedRef.current) return;

      setIsExecuting(false);
      setActiveToolName(null);
      setActivePlan([]);
      activePlanRef.current = [];

      const summaryMsg = result.summary || "Task completed successfully.";
      pushMessage({ sender: "crayon", text: summaryMsg, reasoning: streamingReasoning });
      setStreamingText("");
      setStreamingReasoning("");

      if (mode === "run") {
        setTimeout(() => exit(), 1000);
      }
    } catch (err: any) {
      if (abortedRef.current) return;
      setIsExecuting(false);
      setActiveToolName(null);
      setActivePlan([]);
      activePlanRef.current = [];
      pushMessage({ sender: "system", text: `Error: ${err?.message || String(err)}` });

      if (mode === "run") {
        setTimeout(() => exit(), 1500);
      }
    }
  };

  const handleAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "plan":
        setActivePlan(event.steps);
        activePlanRef.current = event.steps;
        setCurrentStepIndex(0);
        break;
      case "thinking":
        setActiveToolName("thinking");
        setActiveToolArgs({ status: event.content || "Thinking..." });
        break;
      case "reasoning_delta":
        setStreamingReasoning((prev) => prev + event.content);
        break;
      case "tool_call":
        activeToolNameRef.current = event.name;
        activeToolArgsRef.current = event.args;
        setActiveToolName(event.name);
        setActiveToolArgs(event.args);
        setStreamingText("");
        if (event.name !== "thinking") {
          setCurrentStepIndex((prev) => Math.min(prev + 1, Math.max(0, activePlanRef.current.length - 1)));
          // Push initial running message into history
          historyCountRef.current += 1;
          const msgId = String(historyCountRef.current);
          activeToolMessageIdRef.current = msgId;
          const initialText = getToolCallInitialText(event.name, event.args);
          setHistory((prev) => {
            const next = [...prev, {
              id: msgId,
              sender: "system" as const,
              text: initialText,
              toolCall: {
                name: event.name,
                args: event.args,
                status: "running" as const
              }
            }];
            if (agentRef.current) {
              saveSession(workspaceRoot, agentRef.current.getHistory(), next).catch(() => {});
            }
            return next;
          });
          scrollOffsetRef.current = 0;
          setScrollOffset(0);
        } else {
          activeToolArgsRef.current = { status: "Thinking..." };
          setActiveToolArgs({ status: "Thinking..." });
        }
        break;
      case "tool_result": {
        // Read from refs to avoid stale closure — state may not have updated yet
        const toolName = activeToolNameRef.current;
        const toolArgs = activeToolArgsRef.current || {};
        const toolResult = event.result as any;
        const isError = toolResult && (toolResult.success === false || toolResult.error);
        const errorText = toolResult?.error || "";

        if (toolName && toolName !== "thinking") {
          const completedText = getToolCallCompletedText(toolName, toolArgs, toolResult, !!isError);
          
          if (activeToolMessageIdRef.current) {
            updateMessage(activeToolMessageIdRef.current, {
              text: completedText,
              toolCall: {
                name: toolName,
                args: toolArgs,
                result: toolResult,
                status: isError ? "error" : "success",
                error: errorText
              }
            });
          } else {
            pushMessage({
              sender: "system",
              text: completedText,
              toolCall: {
                name: toolName,
                args: toolArgs,
                result: toolResult,
                status: isError ? "error" : "success",
                error: errorText
              }
            });
          }
        }
        activeToolNameRef.current = null;
        activeToolArgsRef.current = null;
        activeToolMessageIdRef.current = null;
        setActiveToolName(null);
        setActiveToolArgs(null);
        break;
      }
      case "text_delta":
        setStreamingText((prev) => prev + event.content);
        break;
      case "text":
        break;
      case "edit":
        setSessionFiles((prev) => [...new Set([...prev, event.path])]);
        setTimeout(() => {
          const git = getGitInfo(workspaceRoot);
          setGitBranch(git.branch);
          setGitDirtyCount(git.dirtyCount);
        }, 0);
        if (activeToolMessageIdRef.current) {
          updateMessage(activeToolMessageIdRef.current, { diff: event.diff });
        } else {
          pushMessage({ sender: "system", text: `Diff showing changes in ${event.path}:`, diff: event.diff });
        }
        break;
      case "usage":
        setTokens((prev) => prev + event.totalTokens);
        setCost((prev) => {
          const pricing = getModelPricing(defaultModel);
          const inputCostPerToken = pricing.input / 1_000_000;
          const outputCostPerToken = pricing.output / 1_000_000;
          return prev + (event.promptTokens * inputCostPerToken) + (event.completionTokens * outputCostPerToken);
        });
        break;
      case "error":
        pushMessage({ sender: "system", text: `Error: ${event.message}` });
        break;
    }
  };

  const handleAbort = () => {
    abortedRef.current = true;
    abortControllerRef.current?.abort();
    setIsExecuting(false);
    activeToolNameRef.current = null;
    activeToolArgsRef.current = null;
    setActiveToolName(null);
    setActiveToolArgs(null);
    setActivePlan([]);
    activePlanRef.current = [];
    setStreamingText("");
    setStreamingReasoning("");
    pushMessage({ sender: "system", text: "🚫 Agent execution interrupted by user." });
    if (approvalRequest) {
      approvalRequest.resolve(false);
      setApprovalRequest(null);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      if (agentRef.current) agentRef.current.close();
      exit();
      return;
    }

    if ((isModelSelectorOpen || isCommandPaletteOpen) && key.escape) {
      setIsModelSelectorOpen(false);
      setIsCommandPaletteOpen(false);
      return;
    }

    if (isExecuting && !approvalRequest) {
      if (key.escape) handleAbort();
      return;
    }

    if (approvalRequest) {
      const k = input.toLowerCase();
      if (approvalRequest.type === "command") {
        if (k === "y" || key.return) {
          approvalRequest.resolve(true);
          setApprovalRequest(null);
        } else if (k === "n" || key.escape) {
          approvalRequest.resolve(false);
          setApprovalRequest(null);
        }
      } else if (approvalRequest.type === "edit") {
        if (k === "y" || key.return) {
          approvalRequest.resolve(true);
          setApprovalRequest(null);
        } else if (k === "n" || key.escape) {
          approvalRequest.resolve(false);
          setApprovalRequest(null);
        } else if (k === "s") {
          approvalRequest.resolve(false);
          setApprovalRequest(null);
        } else if (k === "e") {
          // Edit manually in vim/nano
          const editor = process.env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
          const absPath = path.resolve(workspaceRoot, approvalRequest.path);
          try {
            spawnSync(editor, [absPath], { stdio: "inherit" });
            pushMessage({ sender: "system", text: `Opened ${approvalRequest.path} in ${editor}. Rejecting automated edit.` });
          } catch {
            pushMessage({ sender: "system", text: `Failed to open editor ${editor}.` });
          }
          approvalRequest.resolve(false);
          setApprovalRequest(null);
        }
      }
      return;
    }

    if (!approvalRequest && mode === "chat" && !isModelSelectorOpen && !isCommandPaletteOpen) {
      if ((key.ctrl && input === "t") || input === "\u001b[Z" || (key.shift && (key.tab || input === "\t"))) {
        const modes = ["ask", "auto-edit", "plan", "auto", "bypass"];
        const currentIdx = modes.indexOf(agentMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        setAgentMode(nextMode);
        modeSwitchTimeRef.current = Date.now();
        if (agentRef.current) agentRef.current.setPermissionMode(nextMode as any);
        return;
      }

      if (key.ctrl && input === "e") {
        const editor = process.env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
        const tmpPath = path.join(os.tmpdir(), `crayon-prompt-${Date.now()}.txt`);
        try {
          if (currentInput) {
             require("fs").writeFileSync(tmpPath, currentInput, "utf8");
          } else {
             require("fs").writeFileSync(tmpPath, "", "utf8");
          }
          spawnSync(editor, [tmpPath], { stdio: "inherit" });
          const newContent = require("fs").readFileSync(tmpPath, "utf8");
          if (newContent.trim()) {
            handleSubmit(newContent);
          }
        } catch (e) {
           pushMessage({ sender: "system", text: `Failed to open editor: ${e}` });
        }
        return;
      }

      if (currentInput === "/") {
        setIsCommandPaletteOpen(true);
        setCurrentInput("");
      } else {
        // PageUp / PageDown scroll through history
        if (key.pageUp || (key.shift && key.upArrow)) {
          const next = Math.min(scrollOffsetRef.current + 5, history.length - 1);
          scrollOffsetRef.current = next;
          setScrollOffset(next);
          return;
        }
        if (key.pageDown || (key.shift && key.downArrow)) {
          const next = Math.max(scrollOffsetRef.current - 5, 0);
          scrollOffsetRef.current = next;
          setScrollOffset(next);
          return;
        }

        if (key.upArrow) {
          if (inputHistory.length > 0) {
            const newIndex = inputHistoryIndex < inputHistory.length - 1 ? inputHistoryIndex + 1 : inputHistoryIndex;
            setInputHistoryIndex(newIndex);
            setCurrentInput(inputHistory[inputHistory.length - 1 - newIndex]);
          }
        } else if (key.downArrow) {
          if (inputHistoryIndex > 0) {
            const newIndex = inputHistoryIndex - 1;
            setInputHistoryIndex(newIndex);
            setCurrentInput(inputHistory[inputHistory.length - 1 - newIndex]);
          } else if (inputHistoryIndex === 0) {
            setInputHistoryIndex(-1);
            setCurrentInput("");
          }
        }
      }
    }
  });

  const parseMentions = async (text: string) => {
    const regex = /@([\w/.-]+)/g;
    let match;
    let resolvedText = text;
    while ((match = regex.exec(text)) !== null) {
      const file = match[1];
      const absPath = path.resolve(workspaceRoot, file);
      if (existsSync(absPath)) {
        try {
          const content = await readFile(absPath, "utf-8");
          resolvedText += `\n\n<file path="${file}">\n${content}\n</file>\n`;
        } catch {}
      }
    }
    return resolvedText;
  };

  const updateModel = async (newModel: string) => {
    setDefaultModel(newModel);
    if (agentRef.current) agentRef.current.setModel(newModel);
    pushMessage({ sender: "system", text: `🧠 Model changed to: ${newModel}` });
    setIsModelSelectorOpen(false);
    
    try {
      const configPath = path.join(os.homedir(), ".crayon", "config.json");
      if (existsSync(configPath)) {
        const configObj = JSON.parse(await readFile(configPath, "utf-8"));
        configObj.defaultModel = newModel;
        await writeFile(configPath, JSON.stringify(configObj, null, 2));
      }
    } catch (e) {
      pushMessage({ sender: "system", text: `Warning: Failed to save config: ${e}` });
    }
  };

  const handleSubmit = async (inputStr: string) => {

    const trimmed = inputStr.trim();
    if (!trimmed) return;
    
    setInputHistory((prev) => [...prev, trimmed]);
    setInputHistoryIndex(-1);
    setCurrentInput("");

    pushMessage({ sender: "user", text: trimmed });

    if (trimmed.startsWith("/")) {
      const parts = trimmed.split(" ");
      const cmd = parts[0].toLowerCase();
      switch (cmd) {
        case "/clear":
          if (agentRef.current) agentRef.current.clearHistory();
          setHistory([]);
          setSessionFiles([]);
          setTokens(0);
          setCost(0);
          pushMessage({ sender: "system", text: "🧼 Conversation history cleared." });
          break;
        case "/mode":
          const m = parts[1];
          if (["ask", "auto-edit", "plan", "auto", "bypass"].includes(m)) {
            if (agentRef.current) agentRef.current.setPermissionMode(m as any);
            setAgentMode(m);
            pushMessage({ sender: "system", text: `🔒 Permission mode set to: ${m}` });
          } else {
            pushMessage({ sender: "system", text: `Invalid mode. Use: ask, auto-edit, plan, auto, bypass` });
          }
          break;
        case "/cost":
          pushMessage({ sender: "system", text: `Usage: ${tokens.toLocaleString()} tokens (~$${cost.toFixed(5)})` });
          break;
        case "/files":
          if (sessionFiles.length > 0) {
            pushMessage({ sender: "system", text: `Touched files this session:\n${sessionFiles.map((f) => `  - ${f}`).join("\n")}` });
          } else {
            pushMessage({ sender: "system", text: "📭 No files modified in this session." });
          }
          break;
        case "/compact": {
          if (!agentRef.current) {
            pushMessage({ sender: "system", text: "Agent not initialized." });
            break;
          }
          pushMessage({ sender: "system", text: "🗜️ Compacting conversation history..." });
          const agentHistory = agentRef.current.getHistory();
          const config = await loadConfig();
          const compacted = await autoCompact(agentHistory, {
            model: config.defaultModel,
            provider: config.provider,
            anthropicApiKey: config.anthropicApiKey,
            openaiApiKey: config.openaiApiKey,
            openrouterApiKey: config.openrouterApiKey,
            googleApiKey: config.googleApiKey,
          });
          agentRef.current.setHistory(compacted);
          pushMessage({ sender: "system", text: `[✓] Compacted ${agentHistory.length} messages → ${compacted.length} messages.` });
          break;
        }
        case "/model":
          if (parts.length > 1) {
            updateModel(parts[1]);
          } else {
            setIsModelSelectorOpen(true);
          }
          break;
        case "/config":
          pushMessage({ sender: "system", text: "[!] To change your AI provider, model, or UI theme, please exit the chat (Ctrl+C) and run `crayon config` in your terminal." });
          break;
        case "/easel": {
          if (!agentRef.current) {
            pushMessage({ sender: "system", text: "Agent not initialized." });
            break;
          }
          const files = agentRef.current.getContextFiles();
          if (files.length === 0) {
            pushMessage({ sender: "system", text: "▶ Easel (Active Context)\n  (Empty Context)" });
          } else {
            const relativeFiles = files.map((f: string) => path.relative(workspaceRoot, f));
            pushMessage({ sender: "system", text: `▶ Easel (Active Context)\n${buildAsciiTree(relativeFiles)}` });
          }
          break;
        }
        case "/help":
          pushMessage({
            sender: "system",
            text: `Available Commands:\n${AVAILABLE_COMMANDS.map(c => `  ${c.cmd.padEnd(10)} - ${c.desc}`).join("\n")}`
          });
          break;
        default:
          pushMessage({ sender: "system", text: `Unknown command "${cmd}". Supported: /clear, /mode, /cost, /files, /compact, /config, /help` });
      }
      return;
    }

    if (isExecuting) {
      setQueuedTasks((prev) => [...prev, trimmed]);
      return;
    }

    if (agentRef.current) {
      const enrichedText = await parseMentions(trimmed);
      runTask(agentRef.current, enrichedText);
    }
  };

  useEffect(() => {
    if (!isExecuting && queuedTasks.length > 0 && agentRef.current) {
      const nextTask = queuedTasks[0];
      setQueuedTasks((prev) => prev.slice(1));
      parseMentions(nextTask).then((enrichedText) => {
        runTask(agentRef.current!, enrichedText);
      });
    }
  }, [isExecuting, queuedTasks]);

  const truncate = (str: string, maxLen: number = 50) => {
    if (!str) return "";
    return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
  };

  const getToolDisplay = () => {
    if (!activeToolName || activeToolName === "thinking") return "Thinking...";
    
    const args = activeToolArgs || {};
    const pathBase = args.path ? path.basename(args.path) : "";
    const argStr = args.command || args.pattern || args.query || args.Query || args.CommandLine || pathBase || "";
    const suffix = argStr ? ` · ${truncate(argStr)}` : "";

    if (activeToolName === "read_file" || activeToolName === "view_file" || activeToolName === "list_directory" || activeToolName === "list_dir") {
      return `▤ Inspecting canvas${suffix}`;
    } else if (activeToolName === "terminal" || activeToolName === "run_command") {
      return `◧ Mixing colors${suffix}`;
    } else if (activeToolName === "search_web" || activeToolName === "grep" || activeToolName === "grep_search" || activeToolName === "search_codebase") {
      return `⌕ Looking for inspiration${suffix}`;
    } else if (
      activeToolName === "write_file" ||
      activeToolName === "write_to_file" ||
      activeToolName === "edit_file" ||
      activeToolName === "replace_file_content" ||
      activeToolName === "multi_replace_file_content" ||
      activeToolName === "edit_ast" ||
      activeToolName === "overwrite_file"
    ) {
      return `✎ Sketching details${suffix}`;
    }
    return `▶ Running ${activeToolName}${suffix}`;
  };

  const renderMarkdown = (text: string, isStreaming: boolean = false) => {
    const parts = text.split(/(```[\s\S]*?```)/g);
    return parts.map((part, index) => {
      if (part.startsWith("```") && part.endsWith("```")) {
        const lines = part.split("\n");
        const lang = lines[0].slice(3).trim();
        const code = lines.slice(1, -1).join("\n");
        let highlighted = code;
        try {
          highlighted = highlight(code, { language: lang || "typescript", ignoreIllegals: true, theme: syntaxThemeDark });
        } catch {}
        return (
          <Box key={index} marginY={1} paddingX={1} borderStyle="round" borderColor={theme.border} flexDirection="column">
            {lang && <Text color={theme.subtle} italic>{lang}</Text>}
            <Text>{highlighted}</Text>
          </Box>
        );
      }
      if (part.trim() === "") return null;
      let rawText = part;
      if (isStreaming && index === parts.length - 1) {
        // Wet ink effect: color the last word
        const match = rawText.match(/([^\s`*_*~]+)(\s*)$/);
        if (match) {
           const brandColor = "\x1b[38;2;77;150;255m"; // theme.brand
           const resetCode = "\x1b[0m";
           rawText = rawText.slice(0, match.index) + `${brandColor}${match[1]}${resetCode}` + match[2];
        }
      }
      let mdText = rawText;
      try {
        mdText = (marked.parse(rawText) as string).trim();
      } catch {}
      return <Text key={index}>{mdText}</Text>;
    });
  };


  const renderTerminalOutput = (stdout?: string, stderr?: string) => {
    if (!stdout && !stderr) return null;
    const lines: string[] = [];
    if (stdout) {
      const clean = stdout.trim();
      if (clean) lines.push(clean);
    }
    if (stderr) {
      const clean = stderr.trim();
      if (clean) lines.push(`Error Output:\n${clean}`);
    }
    if (lines.length === 0) return null;

    const fullText = lines.join("\n");
    const allLines = fullText.split("\n");
    const limit = 15;
    const truncated = allLines.slice(0, limit).join("\n");
    const hasMore = allLines.length > limit;

    return (
      <Box key="term-out" flexDirection="column" marginY={1} paddingX={1} borderStyle="round" borderColor={theme.border} width="100%">
        <Text color={theme.subtle} dimColor>stdout/stderr:</Text>
        <Text>{truncated}</Text>
        {hasMore && (
          <Text color={theme.subtle} italic dimColor>
            ... (truncated {allLines.length - limit} lines)
          </Text>
        )}
      </Box>
    );
  };

  const renderMatches = (matches?: any[]) => {
    if (!matches || !Array.isArray(matches) || matches.length === 0) return null;
    const limit = 5;
    const displayed = matches.slice(0, limit);
    const hasMore = matches.length > limit;

    return (
      <Box key="matches-out" flexDirection="column" marginY={1} paddingLeft={1} width="100%">
        {displayed.map((m: any, i: number) => (
          <Text key={i} color={theme.text}>
            <Text color={theme.brand}>{m.path}:{m.line}</Text> <Text color={theme.subtle}>{m.snippet?.trim()}</Text>
          </Text>
        ))}
        {hasMore && (
          <Text color={theme.subtle} italic>
            ... and {matches.length - limit} more matches
          </Text>
        )}
      </Box>
    );
  };

  const renderMsg = (msg: ChatMessage) => {
    const crayonColors = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];

    if (msg.text.startsWith("⬡ Crayon v")) {
      const versionMatch = msg.text.match(/v([0-9.]+)/);
      const version = versionMatch ? versionMatch[1] : "0.1.0";
      const tips = [
        "Tip: Hit Ctrl+E to open your editor for multi-line prompts.",
        "Tip: Hit Ctrl+T to quickly cycle permission modes.",
        "Tip: Type / to open the Command Palette.",
        "Tip: Crayon works best with a detailed system prompt."
      ];
      const randomTip = tips[parseInt(msg.id) % tips.length] || tips[0];
      return (
        <Box key={msg.id} flexDirection="column" marginBottom={1} borderStyle="round" borderColor={theme.brand} paddingX={1}>
          <Text color={theme.brand} bold>✶ Welcome to Crayon Code v{version}!</Text>
          <Box marginTop={1} flexDirection="column">
            <Text color={theme.subtle} italic>/help for help, /config for settings</Text>
            <Text color={theme.text}>cwd: {workspaceRoot}</Text>
          </Box>
          <Box marginTop={1}>
            <Text color={theme.subtle}>※ {randomTip}</Text>
          </Box>
        </Box>
      );
    }

    if (msg.sender === "user") {
      return (
        <Box key={msg.id} marginBottom={1}>
          <Text color={theme.subtle} bold>❯ You: </Text>
          <Text color={theme.text}>{msg.text}</Text>
        </Box>
      );
    }

    if (msg.sender === "system") {
      if (msg.text.startsWith("⬡ Crayon v")) {
        const [crayonPart, restPart] = msg.text.split(" · Workspace: ");
        const version = crayonPart.split(" v")[1];
        return (
          <Box key={msg.id} flexDirection="row" marginBottom={1}>
            <Text color={theme.subtle}>⬡ </Text>
            {"Crayon".split("").map((char, i) => (
              <Text key={i} color={crayonColors[i % crayonColors.length]} bold>{char}</Text>
            ))}
            <Text color={theme.subtle}> v{version} · Workspace: {restPart}</Text>
          </Box>
        );
      }

      if (msg.toolCall) {
        const tc = msg.toolCall;
        const isRunning = tc.status === "running";
        const isError = tc.status === "error";
        
        const icon = isRunning ? "⏳" : isError ? "✗" : "✓";
        const iconColor = isRunning ? theme.brand : isError ? theme.warning : theme.success;
        const textColor = isRunning ? theme.subtle : isError ? theme.warning : theme.text;
        
        // Compute details to render below
        let detailsComponent: React.ReactNode = null;
        if (!isRunning && tc.result) {
          const res = tc.result;
          if (tc.name === "terminal") {
            detailsComponent = renderTerminalOutput(res.stdout, res.stderr);
          } else if (tc.name === "grep" || tc.name === "search_codebase") {
            detailsComponent = renderMatches(res.matches);
          }
        }
        
        return (
          <Box key={msg.id} flexDirection="column" marginBottom={1}>
            <Box flexDirection="row">
              <Text color={iconColor} bold>{icon} </Text>
              <Text color={textColor}>{msg.text}</Text>
            </Box>
            {msg.diff && <DiffRenderer diff={msg.diff} maxLines={15} />}
            {detailsComponent}
          </Box>
        );
      }

      return (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          <Text color={theme.subtle} italic>{msg.text}</Text>
          {msg.diff && <DiffRenderer diff={msg.diff} maxLines={15} />}
        </Box>
      );
    }

    // crayon sender
    return (
      <Box key={msg.id} flexDirection="column" marginBottom={1}>
        <Text bold>
          {"Crayon".split("").map((char, i) => (
            <Text key={i} color={crayonColors[i % crayonColors.length]}>{char}</Text>
          ))}
          <Text color={theme.brand}>: </Text>
        </Text>
        {msg.reasoning && <ThinkingMessage thinking={msg.reasoning} isCollapsed={true} />}
        <Box flexDirection="column">
          {renderMarkdown(msg.text)}
        </Box>
      </Box>
    );
  };

  // Sliding window: when scrolled up, show older messages.
  // scrollOffset=0 means live bottom view; scrollOffset=N means scrolled N messages up.
  const WINDOW = 80; // max messages rendered at once
  const totalMessages = history.length;
  const endIdx   = scrollOffset > 0 ? totalMessages - scrollOffset : totalMessages;
  const startIdx = Math.max(0, endIdx - WINDOW);
  const visibleHistory = history.slice(startIdx, endIdx);
  const olderCount = startIdx; // messages above the window
  const atBottom = scrollOffset === 0;

  return (
    // height={rows} + overflow="hidden" tells Ink's yoga layout that this Box
    // is exactly the viewport. Ink will never produce outputHeight >= rows,
    // so the clearTerminal fallback in ink.js never fires.
    // flexDirection="column" makes the footer (StatusBar) stick to the bottom.
    <Box flexDirection="column" height={rows || 24} width="100%" overflow="hidden">

      {/* Scrollable history region — flexGrow takes all available space */}
      <Box flexDirection="column" flexGrow={1} overflow="hidden" paddingLeft={1} justifyContent="flex-end">
        {/* "More above" indicator when scrolled into history */}
        {olderCount > 0 && (
          <Box paddingLeft={1}>
            <Text color={theme.subtle} italic>↑ {olderCount} older message{olderCount !== 1 ? 's' : ''} — PgUp to scroll</Text>
          </Box>
        )}
        {visibleHistory.map(renderMsg)}
        {/* "At bottom" indicator when scrolled up */}
        {!atBottom && (
          <Box paddingLeft={1}>
            <Text color={theme.subtle} italic>↓ {scrollOffset} newer message{scrollOffset !== 1 ? 's' : ''} — PgDn to scroll down</Text>
          </Box>
        )}
      </Box>

      <Box flexShrink={0} flexDirection="column" paddingLeft={1}>
        {activePlan.length > 0 && currentStepIndex < activePlan.length && (
          <PlanView steps={activePlan} currentStepIndex={currentStepIndex} isExecuting={isExecuting} />
        )}

        {isExecuting && activePlan.length === 0 && !approvalRequest && (
          <Box flexDirection="column" width="100%">
            {streamingReasoning && !streamingText && (
              <ThinkingMessage thinking={streamingReasoning} />
            )}
            
            {streamingText && (
              <Box flexDirection="column" marginBottom={1}>
                <Text bold>
                  {"Crayon".split("").map((char, i) => {
                    const crayonColors = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];
                    return <Text key={i} color={crayonColors[i % crayonColors.length]}>{char}</Text>
                  })}
                  <Text color={theme.brand}>: </Text>
                </Text>
                {streamingReasoning && (
                  <ThinkingMessage thinking={streamingReasoning} isCollapsed={true} />
                )}
                <Box flexDirection="column">
                  {renderMarkdown(streamingText, true)}
                </Box>
              </Box>
            )}

            {/* Only show the animated progress when there's no streaming text yet —
                prevents the "two sketching" bug where both the response text and
                the progress animation render simultaneously */}
            {!streamingText && (
              <AgentProgress
                statusText={getToolDisplay()}
                tokens={tokens}
                startTime={executionStartTime.current}
              />
            )}
          </Box>
        )}

        {approvalRequest && (
          <Box flexDirection="column" borderStyle="single" borderColor={theme.warning} paddingX={1} marginY={1} width="100%">
            {approvalRequest.type === "command" ? (
              <Box flexDirection="column">
                <Text color={theme.warning} bold>⚠️ Approve terminal command?</Text>
                <Text color={theme.text} italic>  {approvalRequest.command}</Text>
                <Box marginTop={1}>
                  <SearchableSelect
                    items={[
                      { label: "Accept", value: "accept", description: "Execute the command" },
                      { label: "Reject", value: "reject", description: "Skip the command" }
                    ]}
                    onSelect={(val) => {
                      approvalRequest.resolve(val === "accept");
                      setApprovalRequest(null);
                    }}
                    onCancel={() => {
                      approvalRequest.resolve(false);
                      setApprovalRequest(null);
                    }}
                  />
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Text color={theme.warning} bold>⚠️ Approve file edits in {approvalRequest.path}?</Text>
                <DiffRenderer diff={approvalRequest.diff} maxLines={10} />
                <Box marginTop={1}>
                  <SearchableSelect
                    items={[
                      { label: "Accept", value: "accept", description: "Apply these changes" },
                      { label: "Reject", value: "reject", description: "Discard these changes" },
                      { label: "Edit Manually", value: "edit", description: "Open file in your terminal editor" }
                    ]}
                    onSelect={(val) => {
                      if (val === "accept") {
                        approvalRequest.resolve(true);
                        setApprovalRequest(null);
                      } else if (val === "reject") {
                        approvalRequest.resolve(false);
                        setApprovalRequest(null);
                      } else if (val === "edit") {
                        const editor = process.env.EDITOR || (process.platform === "win32" ? "notepad" : "nano");
                        const absPath = path.resolve(workspaceRoot, approvalRequest.path);
                        try {
                          spawnSync(editor, [absPath], { stdio: "inherit" });
                          pushMessage({ sender: "system", text: `Opened ${approvalRequest.path} in ${editor}. Rejecting automated edit.` });
                        } catch {
                          pushMessage({ sender: "system", text: `Failed to open editor ${editor}.` });
                        }
                        approvalRequest.resolve(false);
                        setApprovalRequest(null);
                      }
                    }}
                    onCancel={() => {
                      approvalRequest.resolve(false);
                      setApprovalRequest(null);
                    }}
                  />
                </Box>
              </Box>
            )}
          </Box>
        )}
      </Box>

      <Box marginTop={1} paddingLeft={1}>
        <Text color={theme.border}>{"─".repeat(40)}</Text>
      </Box>

      {!approvalRequest && mode === "chat" && (
        <Box flexDirection="column">
          {isCommandPaletteOpen && (
            <Box flexDirection="column" marginTop={0} paddingLeft={1} marginBottom={1}>
              <Text color={theme.success} bold>Command Palette</Text>
              <SearchableSelect
                items={AVAILABLE_COMMANDS.map(c => ({
                  label: c.cmd,
                  value: c.cmd,
                  description: c.desc + (c.usage ? `  ${c.usage}` : "")
                }))}
                placeholder="Search commands..."
                onSelect={(val) => {
                  setIsCommandPaletteOpen(false);
                  handleSubmit(val);
                }}
                onCancel={() => setIsCommandPaletteOpen(false)}
              />
            </Box>
          )}
          
          {isModelSelectorOpen && (
            <Box flexDirection="column" marginTop={0} paddingLeft={1} marginBottom={1}>
              <Text color={theme.success} bold>Select a model for {currentProvider}</Text>
              <SearchableSelect
                items={availableModels}
                placeholder="Search models..."
                onSelect={(val) => updateModel(val)}
                onCancel={() => setIsModelSelectorOpen(false)}
              />
            </Box>
          )}

          <Box marginTop={0} flexDirection="column" paddingLeft={1}>
            <Box flexDirection="row" borderStyle="round" borderColor={theme.border} paddingX={1}>
              <Text bold>
                {"crayon".split("").map((char, i) => {
                  const crayonColors = ["#E0F7FA", "#B2EBF2", "#80DEEA", "#4DD0E1", "#26C6DA", "#00BCD4"];
                  return <Text key={i} color={isExecuting ? theme.subtle : crayonColors[i % crayonColors.length]}>{char}</Text>
                })}
                <Text color={isExecuting ? theme.subtle : theme.success}> ❯ </Text>
              </Text>
              <TextInput 
                focus={!isCommandPaletteOpen && !isModelSelectorOpen}
                value={currentInput} 
                onChange={(v) => { 
                  if (Date.now() - modeSwitchTimeRef.current < 50 && v.endsWith("t")) {
                    setCurrentInput(v.slice(0, -1));
                    return;
                  }
                  if (v === "/") {
                    setIsCommandPaletteOpen(true);
                    setCurrentInput("");
                  } else {
                    setCurrentInput(v); 
                  }
                }} 
                onSubmit={handleSubmit} 
              />
            </Box>
            <Box paddingLeft={1}>
              <Text color={theme.success}>⏸ {agentMode} mode on </Text>
              <Text color={theme.subtle}>(Ctrl+T or Shift+Tab to cycle)</Text>
            </Box>
          </Box>
        </Box>
      )}

      <StatusBar
        workspaceName={workspaceName}
        gitBranch={gitBranch}
        gitDirtyCount={gitDirtyCount}
        tokens={tokens}
        cost={cost}
        isExecuting={isExecuting}
        modelName={defaultModel}
      />
    </Box>
  );
};
