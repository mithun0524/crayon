import React, { useState, useEffect, useRef, useInsertionEffect } from "react";
import { Box, Text, Static, useInput, useApp } from "ink";
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
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

import { loadConfig } from "../config.js";
import { getGitInfo } from "./gitHelper.js";
import { PlanView } from "./PlanView.js";
import { StatusBar } from "./StatusBar.js";
import { DiffRenderer } from "./DiffRenderer.js";
import { saveSession, loadSession } from "../session.js";
import { loadCustomCommands, expandTemplate, type CustomCommand } from "../customCommands.js";
import { theme, ACCENTS, applyAccent } from "./theme.js";
import { syntaxThemeDark } from "./syntaxTheme.js";
import { AgentProgress } from "./components/AgentProgress.js";
import { CrayonLogo } from "./components/CrayonLogo.js";
import { Markdown } from "./Markdown.js";
import { useTerminalSize } from "./hooks/useTerminalSize.js";
import { ThinkingMessage } from "./messages/ThinkingMessage.js";
import {
  AVAILABLE_COMMANDS,
  buildAsciiTree,
  POPULAR_MODELS,
  getToolCallCompletedText,
} from "./appConstants.js";

interface AppProps {
  mode: "run" | "chat";
  task?: string;
  // true = resume most recent session; string = resume that session id.
  resume?: boolean | string;
  permissionMode?: any;
}

interface ChatMessage {
  id: string;
  sender: "user" | "crayon" | "system";
  text: string;
  diff?: string;
  reasoning?: string;
  isCommandOutput?: boolean;
  toolCall?: {
    name: string;
    args: any;
    result?: any;
    status: "running" | "success" | "error";
    error?: string;
  };
}

/** Commands whose name prefix-matches the current "/…" input (built-in + custom). */
function commandMatches(input: string, custom: Array<{ cmd: string; desc: string }> = []) {
  if (!input.startsWith("/")) return [];
  const q = input.toLowerCase().split(" ")[0]; // ignore args after the command
  return [...AVAILABLE_COMMANDS, ...custom].filter((c) => c.cmd.toLowerCase().startsWith(q));
}

export const App: React.FC<AppProps> = ({ mode, task, resume, permissionMode }) => {
  const { exit } = useApp();
  const { columns } = useTerminalSize();

  // Clear the terminal (screen + scrollback) once on start, then render inline
  // in the NORMAL buffer via <Static> — so native trackpad scroll, copy/paste,
  // and unlimited history all work, but the prior shell output is wiped away.
  useInsertionEffect(() => {
    process.stdout.write('\x1b[2J\x1b[3J\x1b[H'); // clear screen + scrollback + home
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
  // Tools in flight, keyed by tool-call id — supports parallel (read-only) tools
  // without one clobbering another's pending UI state.
  const activeToolsRef = useRef<Record<string, { name: string; args: any }>>({});
  // Streaming-delta batching: accumulate raw text and flush to state on a timer
  // so we re-render at most ~every 40ms instead of once per token.
  const streamBufRef = useRef("");
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [tokens, setTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentInput, setCurrentInput] = useState("");
  const [inputHistory, setInputHistory] = useState<string[]>([]);
  const [inputHistoryIndex, setInputHistoryIndex] = useState(-1);
  const [approvalRequest, setApprovalRequest] = useState<any>(null);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);
  const [agentMode, setAgentMode] = useState<string>(permissionMode || "ask");
  const agentModeRef = useRef(agentMode);
  useEffect(() => { agentModeRef.current = agentMode; }, [agentMode]);
  const [defaultModel, setDefaultModel] = useState<string>("");
  const defaultModelRef = useRef<string>("");
  useEffect(() => {
    defaultModelRef.current = defaultModel;
  }, [defaultModel]);
  // Reset command-menu highlight whenever the input changes.
  useEffect(() => { setCmdIndex(0); }, [currentInput]);
  const [currentProvider, setCurrentProvider] = useState<"anthropic" | "openai" | "google" | "openrouter" | "ollama">("anthropic");
  const [isModelSelectorOpen, setIsModelSelectorOpen] = useState(false);
  const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
  // Highlighted row in the inline "/…" command menu.
  const [cmdIndex, setCmdIndex] = useState(0);
  // Bumped after applyAccent() mutates the shared theme, to force a re-render.
  const [, setThemeTick] = useState(0);
  const [availableModels, setAvailableModels] = useState<SelectOption[]>([]);
  const [customCommands, setCustomCommands] = useState<CustomCommand[]>([]);
  const customCommandsRef = useRef<CustomCommand[]>([]);
  useEffect(() => { customCommandsRef.current = customCommands; }, [customCommands]);
  const [sessionId, setSessionId] = useState(() => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  });
  // Ref mirror so save callbacks always use the current id (incl. after resume).
  const sessionIdRef = useRef(sessionId);
  useEffect(() => { sessionIdRef.current = sessionId; }, [sessionId]);
  const sessionStartTimeRef = useRef(Date.now());
  const apiDurationRef = useRef(0);

  const agentRef = useRef<CrayonAgent | null>(null);
  const abortedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const historyCountRef = useRef(0);
  const executionStartTime = useRef<number | undefined>(undefined);

  const modeSwitchTimeRef = useRef(0);
  const lastCtrlCRef = useRef(0); // timestamp of the last Ctrl+C, for double-tap-to-quit
  const workspaceRoot = process.cwd();
  const workspaceName = path.basename(workspaceRoot);

  const pushMessage = (msg: Omit<ChatMessage, "id">) => {
    historyCountRef.current += 1;
    const newMsg = { ...msg, id: String(historyCountRef.current) };
    setHistory((prev) => {
      const next = [...prev, newMsg];
      if (agentRef.current) {
        saveSession(workspaceRoot, sessionIdRef.current, agentRef.current.getHistory(), next).catch(() => {});
      }
      return next;
    });
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
      loadCustomCommands(workspaceRoot, os.homedir()).then((cmds) => {
        if (active && cmds.length > 0) setCustomCommands(cmds);
      }).catch(() => {});
      if (config.accent && applyAccent(config.accent)) setThemeTick((t) => t + 1);
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

      if (config.provider === "ollama") {
        fetch("http://localhost:11434/api/tags")
          .then(res => res.json())
          .then((data: any) => {
            if (data && data.models && Array.isArray(data.models)) {
              const fetchedModels = data.models.map((m: any) => ({
                label: m.name,
                value: m.name,
                description: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : "Local model"
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
        verifyCommand: config.verifyCommand,
    autoCommit: config.autoCommit,
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
        const wantId = typeof resume === "string" ? resume : undefined;
        const session = await loadSession(workspaceRoot, wantId);
        if (session) {
          // Continue the resumed session — further saves append to the same id.
          setSessionId(session.id);
          sessionIdRef.current = session.id;
          agent.setHistory(session.history || []);
          // Restore the visible transcript too, so a resumed chat shows the
          // prior conversation (not just the agent's hidden memory).
          const restored = (session.chatLog || []).map((m: any, i: number) => ({
            ...m,
            id: `restored-${i}`,
          }));
          if (restored.length > 0) setHistory(restored as any);
          pushMessage({ sender: "system", text: `↺ Resumed session ${session.id}${session.title ? ` — ${session.title}` : ""}` });
        } else {
          pushMessage({
            sender: "system",
            text: wantId
              ? `⚠ No session found with id "${wantId}". Run 'crayon sessions' to list.`
              : "⚠ No previous session found to resume.",
          });
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

  // Coalesce streamed text: buffer deltas and flush at most ~every 40ms.
  const flushStream = () => {
    flushTimerRef.current = null;
    const buf = streamBufRef.current;
    if (buf) setStreamingText(buf);
  };
  const scheduleFlush = () => {
    if (flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(flushStream, 40);
  };
  const resetStream = () => {
    if (flushTimerRef.current) { clearTimeout(flushTimerRef.current); flushTimerRef.current = null; }
    streamBufRef.current = "";
    setStreamingText("");
  };

  const runTask = async (agent: CrayonAgent, taskText: string) => {
    setIsExecuting(true);
    resetStream();
    setStreamingReasoning("");
    setActivePlan([]);
    activePlanRef.current = [];
    activeToolsRef.current = {};
    setCurrentStepIndex(0);
    abortedRef.current = false;
    abortControllerRef.current = new AbortController();
    executionStartTime.current = Date.now();

    const start = Date.now();
    try {
      const result = await agent.run(taskText, { skipHistory: mode === "run", signal: abortControllerRef.current.signal });
      if (abortedRef.current) return;

      setIsExecuting(false);
      setActiveToolName(null);
      setActivePlan([]);
      activePlanRef.current = [];

      const summaryMsg = result.summary || "Task completed successfully.";
      pushMessage({ sender: "crayon", text: summaryMsg, reasoning: streamingReasoning });
      resetStream();
      setStreamingReasoning("");

      // Plan-approve gate: only when the agent actually ran in plan mode and
      // produced a plan (result.planned) — never for advisory/chat answers.
      if (mode === "chat" && result.planned && result.summary.trim()) {
        setApprovalRequest({ type: "plan", plan: result.summary });
      }

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
    } finally {
      apiDurationRef.current += Math.round((Date.now() - start) / 1000);
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
      case "tool_call": {
        if (event.name === "thinking") {
          setActiveToolName("thinking");
          setActiveToolArgs({ status: "Thinking..." });
          break;
        }
        const id = event.id || `${event.name}:${Date.now()}`;
        activeToolsRef.current[id] = { name: event.name, args: event.args };
        // Show the just-started tool in the live progress line.
        setActiveToolName(event.name);
        setActiveToolArgs(event.args);
        setCurrentStepIndex((prev) => Math.min(prev + 1, Math.max(0, activePlanRef.current.length - 1)));
        break;
      }
      case "tool_result": {
        const toolResult = event.result as any;
        const id = event.id || "";
        // Match this result to its originating call (parallel-safe).
        const call = (id && activeToolsRef.current[id]) || undefined;
        const toolName = call?.name || event.name;
        const toolArgs = call?.args || {};
        if (id) delete activeToolsRef.current[id];

        if (toolName && toolName !== "thinking") {
          const isError = toolResult && (toolResult.success === false || toolResult.error);
          const completedText = getToolCallCompletedText(toolName, toolArgs, toolResult, !!isError);
          // Commit the FINAL tool line to scrollback (Static). Edit tools carry
          // their diff in the result, so attach it here.
          pushMessage({
            sender: "system",
            text: completedText,
            diff: toolResult?.diff,
            toolCall: {
              name: toolName,
              args: toolArgs,
              result: toolResult,
              status: isError ? "error" : "success",
              error: toolResult?.error || "",
            },
          });
        }

        // Reflect any still-running tool in the progress line, else clear.
        const remaining = Object.values(activeToolsRef.current);
        if (remaining.length > 0) {
          setActiveToolName(remaining[remaining.length - 1].name);
          setActiveToolArgs(remaining[remaining.length - 1].args);
        } else {
          setActiveToolName(null);
          setActiveToolArgs(null);
        }
        break;
      }
      case "text_delta":
        streamBufRef.current += event.content;
        scheduleFlush();
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
        break;
      case "usage":
        setTokens((prev) => prev + event.totalTokens);
        setCost((prev) => {
          const pricing = getModelPricing(defaultModelRef.current);
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

  // Leave the transcript in scrollback on quit (don't wipe) so it can be
  // scrolled/copied afterward; index.ts prints a resume hint after exit.
  const cleanExit = () => {
    if (agentRef.current) agentRef.current.close();
    exit();
  };

  const handleAbort = () => {
    abortedRef.current = true;
    abortControllerRef.current?.abort();
    setIsExecuting(false);
    activeToolsRef.current = {};
    setActiveToolName(null);
    setActiveToolArgs(null);
    setActivePlan([]);
    activePlanRef.current = [];
    resetStream();
    setStreamingReasoning("");
    // Drop any queued messages too — one esc cancels the whole batch, not just
    // the running task (otherwise the queue keeps draining, one esc per task).
    const dropped = queuedTasks.length;
    setQueuedTasks([]);
    pushMessage({
      sender: "system",
      text: dropped > 0 ? `Interrupted by user. (${dropped} queued message${dropped === 1 ? "" : "s"} cancelled)` : "Interrupted by user.",
    });
    if (approvalRequest) {
      approvalRequest.resolve?.(false); // plan approvals have no resolver
      setApprovalRequest(null);
    }
  };

  useInput((input, key) => {
    if (key.ctrl && input === "c") {
      const now = Date.now();
      // Second Ctrl+C within 2s → actually quit.
      if (now - lastCtrlCRef.current < 2000) {
        cleanExit();
        return;
      }
      lastCtrlCRef.current = now;
      // First Ctrl+C: if the agent is running, interrupt it cleanly (aborts the
      // task, rolls back its transaction, clears the queue); then prompt again.
      if (isExecuting) {
        handleAbort();
      }
      pushMessage({ sender: "system", text: "Press Ctrl+C again to exit." });
      return;
    }

    if ((isModelSelectorOpen || isColorPickerOpen) && key.escape) {
      setIsModelSelectorOpen(false);
      setIsColorPickerOpen(false);
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
        if (key.ctrl && input === "o") {
          const tmpPath = path.join(os.tmpdir(), `crayon-diff-${Date.now()}.diff`);
          try {
            require("node:fs").writeFileSync(tmpPath, approvalRequest.diff, "utf8");
            const editor = process.env.EDITOR || (process.platform === "win32" ? "notepad" : "less -R");
            if (editor === "less -R") {
                spawnSync("less", ["-R", tmpPath], { stdio: "inherit" });
            } else {
                spawnSync(editor, [tmpPath], { stdio: "inherit", shell: true });
            }
          } catch {}
          return;
        }
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

    if (!approvalRequest && mode === "chat" && !isModelSelectorOpen && !isColorPickerOpen) {
      if ((key.ctrl && input === "t") || input === "\u001b[Z" || (key.shift && (key.tab || input === "\t"))) {
        const modes = ["ask", "auto-edit", "plan", "auto", "bypass"];
        const currentIdx = modes.indexOf(agentMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        setAgentMode(nextMode);
        agentModeRef.current = nextMode; // sync now; the effect only runs post-render
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

      {
        // Command menu (typed "/…") owns the arrows/Tab/Esc so the main input
        // stays the single input field.
        const matches = commandMatches(currentInput, customCommandsRef.current);
        const inCmdMenu = currentInput.startsWith("/") && !currentInput.includes(" ") && matches.length > 0;
        if (inCmdMenu) {
          if (key.upArrow) { setCmdIndex((i) => Math.max(0, i - 1)); return; }
          if (key.downArrow) { setCmdIndex((i) => Math.min(matches.length - 1, i + 1)); return; }
          if (key.tab) { setCurrentInput(matches[Math.min(cmdIndex, matches.length - 1)].cmd + " "); return; }
          if (key.escape) { setCurrentInput(""); return; }
        }
        // History lives in the terminal's native scrollback — scroll with the
        // mouse/trackpad. Plain arrows recall previous prompts.
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

  const updateAccent = async (name: string) => {
    setIsColorPickerOpen(false);
    const accent = ACCENTS.find((a) => a.name === name);
    if (!applyAccent(name) || !accent) {
      pushMessage({ sender: "system", text: `Unknown color "${name}". Try: ${ACCENTS.map((a) => a.name).join(", ")}` });
      return;
    }
    setThemeTick((t) => t + 1); // force re-render so the mutated theme takes effect
    pushMessage({ sender: "system", text: `Accent changed to ${accent.label}.` });
    try {
      const configPath = path.join(os.homedir(), ".crayon", "config.json");
      const configObj = existsSync(configPath)
        ? JSON.parse(await readFile(configPath, "utf-8"))
        : {};
      configObj.accent = name;
      await writeFile(configPath, JSON.stringify(configObj, null, 2));
    } catch { /* non-fatal */ }
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

      // Custom commands (.crayon/commands/*.md): expand the template with the
      // args and run it as a task. Built-ins take precedence via the switch.
      const custom = customCommandsRef.current.find((c) => c.cmd === cmd);
      const isBuiltin = AVAILABLE_COMMANDS.some((c) => c.cmd === cmd);
      if (custom && !isBuiltin) {
        const expanded = expandTemplate(custom.template, parts.slice(1).join(" "));
        if (isExecuting) {
          setQueuedTasks((prev) => [...prev, expanded]);
        } else if (agentRef.current) {
          runTask(agentRef.current, expanded);
        }
        return;
      }

      switch (cmd) {
        case "/clear": {
          if (agentRef.current) agentRef.current.clearHistory();
          setHistory([]);
          setSessionFiles([]);
          setTokens(0);
          setCost(0);
          let version = "0.1.0";
          try {
            const pkgPath = path.resolve(__dirname, "../../package.json");
            if (existsSync(pkgPath)) {
              const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
              version = pkg.version || "0.1.0";
            }
          } catch {}
          pushMessage({ sender: "system", text: `⬡ Crayon v${version} · Workspace: ${workspaceName}` });
          break;
        }
        case "/undo": {
          if (!agentRef.current) {
            pushMessage({ sender: "system", text: "Agent not initialized." });
            break;
          }
          const agentHistory = agentRef.current.getHistory();
          const lastUserIdxAgent = [...agentHistory].reverse().findIndex(m => m.role === "user");
          
          if (lastUserIdxAgent !== -1) {
            const actualIdx = agentHistory.length - 1 - lastUserIdxAgent;
            const newAgentHistory = agentHistory.slice(0, actualIdx);
            agentRef.current.setHistory(newAgentHistory);
          }

          // Update UI history
          const lastUserIdxUI = [...history].reverse().findIndex(m => m.sender === "user");
          if (lastUserIdxUI !== -1) {
            const actualIdx = history.length - 1 - lastUserIdxUI;
            const newUIHistory = history.slice(0, actualIdx);
            setHistory(newUIHistory);
            saveSession(workspaceRoot, sessionIdRef.current, agentRef.current.getHistory(), newUIHistory).catch(() => {});
            pushMessage({ sender: "system", text: "↩️ Last turn undone. Ready for your input." });
          } else {
            pushMessage({ sender: "system", text: "📭 No messages to undo." });
          }
          break;
        }
        case "/diff": {
          try {
            const res = spawnSync("git", ["diff"], { cwd: workspaceRoot, encoding: "utf-8" });
            const output = res.stdout || "";
            if (output.trim()) {
              pushMessage({ sender: "system", text: "Git Diff (git diff HEAD):", diff: output, isCommandOutput: true });
            } else {
              pushMessage({ sender: "system", text: "📭 No changes detected (clean working tree).", isCommandOutput: true });
            }
          } catch (e: any) {
            pushMessage({ sender: "system", text: `Error running git diff: ${e.message || String(e)}`, isCommandOutput: true });
          }
          break;
        }
        case "/status": {
          let version = "0.1.0";
          try {
            const pkgPath = path.resolve(__dirname, "../../package.json");
            if (existsSync(pkgPath)) {
              const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
              version = pkg.version || "0.1.0";
            }
          } catch {}

          const text =
            `\x1b[1mVersion:\x1b[22m         ${version}\n` +
            `\x1b[1mSession name:\x1b[22m    Crayon Chat Session\n` +
            `\x1b[1mSession ID:\x1b[22m      ${sessionId}\n` +
            `\x1b[1mcwd:\x1b[22m             ${workspaceRoot}\n` +
            `\x1b[1mModel:\x1b[22m           ${defaultModel || "default"}\n` +
            `\x1b[1mProvider:\x1b[22m        ${currentProvider}\n` +
            `\x1b[1mPermission:\x1b[22m      ${agentMode}\n` +
            `\x1b[1mGit branch:\x1b[22m      ${gitBranch} (${gitDirtyCount} dirty files)`;
            
          pushMessage({
            sender: "system",
            text,
            isCommandOutput: true
          });
          break;
        }
        case "/exit":
        case "/quit":
          cleanExit();
          break;
        case "/mode":
          const m = parts[1];
          if (["ask", "auto-edit", "plan", "auto", "bypass"].includes(m)) {
            if (agentRef.current) agentRef.current.setPermissionMode(m as any);
            setAgentMode(m);
            agentModeRef.current = m; // sync now; the effect only runs post-render
            pushMessage({ sender: "system", text: `🔒 Permission mode set to: ${m}` });
          } else {
            pushMessage({ sender: "system", text: `Invalid mode. Use: ask, auto-edit, plan, auto, bypass` });
          }
          break;
        case "/cost": {
          const costUSD = cost.toFixed(4);
          const wallDuration = Math.round((Date.now() - sessionStartTimeRef.current) / 1000);
          const apiDuration = apiDurationRef.current;
          const filesCount = sessionFiles.length;
          
          const text = 
            `\x1b[1mTotal cost:\x1b[22m            $${costUSD}\n` +
            `\x1b[1mTotal duration (API):\x1b[22m  ${apiDuration}s\n` +
            `\x1b[1mTotal duration (wall):\x1b[22m ${wallDuration}s\n` +
            `\x1b[1mTotal code changes:\x1b[22m    ${filesCount} ${filesCount === 1 ? "file" : "files"} modified\n` +
            `\x1b[1mUsage by model:\x1b[22m\n` +
            `  \x1b[1m${(defaultModel || "default").padStart(21)}:\x1b[22m  ${tokens.toLocaleString()} tokens ($${costUSD})`;
          
          pushMessage({
            sender: "system",
            text,
            isCommandOutput: true
          });
          break;
        }
        case "/files":
          if (sessionFiles.length > 0) {
            const list = sessionFiles.map((f) => `  - ${f}`).join("\n");
            pushMessage({
              sender: "system",
              text: `\x1b[1mTouched files this session:\x1b[22m\n${list}`,
              isCommandOutput: true
            });
          } else {
            pushMessage({
              sender: "system",
              text: "📭 No files modified in this session.",
              isCommandOutput: true
            });
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
            const config = await loadConfig();
            if (config.provider === "ollama") {
              fetch("http://localhost:11434/api/tags")
                .then(res => res.json())
                .then((data: any) => {
                  if (data && data.models && Array.isArray(data.models) && data.models.length > 0) {
                    const fetchedModels = data.models.map((m: any) => ({
                      label: m.name,
                      value: m.name,
                      description: m.size ? `${(m.size / (1024 * 1024 * 1024)).toFixed(2)} GB` : "Local model"
                    }));
                    setAvailableModels(fetchedModels);
                  } else {
                    pushMessage({
                      sender: "system",
                      text: "⚠️ Ollama is active on http://localhost:11434 but no local models were found. Run `ollama run qwen2.5-coder:7b` to pull a model."
                    });
                  }
                })
                .catch(() => {
                  pushMessage({
                    sender: "system",
                    text: "⚠️ Could not connect to Ollama. Make sure Ollama is running, or download it from https://ollama.com."
                  });
                });
            }
            setIsModelSelectorOpen(true);
          }
          break;
        case "/config":
          pushMessage({ sender: "system", text: "[!] To change your AI provider, model, or UI theme, please exit the chat (Ctrl+C) and run `crayon config` in your terminal." });
          break;
        case "/color":
          if (parts.length > 1) {
            updateAccent(parts[1].toLowerCase());
          } else {
            setIsColorPickerOpen(true);
          }
          break;
        case "/easel": {
          if (!agentRef.current) {
            pushMessage({ sender: "system", text: "Agent not initialized." });
            break;
          }
          const files = agentRef.current.getContextFiles();
          if (files.length === 0) {
            pushMessage({
              sender: "system",
              text: `\x1b[1m▶ Easel (Active Context)\x1b[22m\n  (Empty Context)`,
              isCommandOutput: true
            });
          } else {
            const relativeFiles = files.map((f: string) => path.relative(workspaceRoot, f));
            pushMessage({
              sender: "system",
              text: `\x1b[1m▶ Easel (Active Context)\x1b[22m\n${buildAsciiTree(relativeFiles)}`,
              isCommandOutput: true
            });
          }
          break;
        }
        case "/help": {
          const header = "\x1b[1mAvailable Commands:\x1b[22m";
          const lines = AVAILABLE_COMMANDS.map(c => {
            const cmdStr = `\x1b[1m${c.cmd.padEnd(10)}\x1b[22m`;
            const descStr = `\x1b[2m${c.desc}\x1b[22m`;
            return `  ${cmdStr} ${descStr}`;
          }).join("\n");
          pushMessage({
            sender: "system",
            text: `${header}\n${lines}`,
            isCommandOutput: true
          });
          break;
        }
        default:
          pushMessage({ sender: "system", text: `Unknown command "${cmd}". Supported: ${AVAILABLE_COMMANDS.map(c => c.cmd).join(", ")}` });
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
    if (!isExecuting && !approvalRequest && queuedTasks.length > 0 && agentRef.current) {
      const nextTask = queuedTasks[0];
      setQueuedTasks((prev) => prev.slice(1));
      parseMentions(nextTask).then((enrichedText) => {
        runTask(agentRef.current!, enrichedText);
      });
    }
  }, [isExecuting, queuedTasks, approvalRequest]);

  const truncate = (str: string, maxLen: number = 50) => {
    if (!str) return "";
    return str.length > maxLen ? str.slice(0, maxLen - 3) + "..." : str;
  };

  // Literal, Claude Code-style tool label: ToolName(arg)
  const getToolDisplay = () => {
    if (activeToolName === "thinking") {
      // Surface a meaningful status (e.g. "API error, retrying in 8s…") instead
      // of a mute "Working" so retries/rate-limits are visible.
      const s = activeToolArgs?.status;
      return s && s !== "Thinking..." ? truncate(s, 80) : "Thinking...";
    }
    if (!activeToolName) return "Thinking...";

    const args = activeToolArgs || {};
    const pathBase = args.path ? path.basename(args.path) : "";
    const argStr = args.command || args.pattern || args.query || pathBase || args.url || "";
    const inner = argStr ? `(${truncate(argStr)})` : "";

    const NAMES: Record<string, string> = {
      read_file: "Read",
      list_directory: "List",
      terminal: "Bash",
      grep: "Search",
      search_codebase: "Search",
      find_usages: "Search",
      write_file: "Write",
      overwrite_file: "Write",
      edit_file: "Edit",
      edit_ast: "Edit",
      delete_file: "Delete",
      rename_file: "Move",
      web_fetch: "Fetch",
      git_status: "Git",
      git_diff: "Git",
      git_commit: "Commit",
    };
    const label = NAMES[activeToolName] || activeToolName;
    return `${label}${inner}`;
  };

  const renderMarkdown = (text: string) => {
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
          <Box key={index} marginY={0} paddingLeft={2} flexDirection="column">
            {lang && <Text color={theme.subtle} italic>{lang}</Text>}
            <Text>{highlighted}</Text>
          </Box>
        );
      }
      if (part.trim() === "") return null;
      return <Markdown key={index} text={part} />;
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
      <Box key="term-out" flexDirection="column" marginY={0} paddingLeft={2} width="100%">
        <Text color={theme.subtle} dimColor>stdout/stderr:</Text>
        <Text color={theme.subtle}>{truncated}</Text>
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
    // Boot / cleared banner
    if (msg.text.startsWith("⬡ Crayon v")) {
      const hasUserMessages = history.some((m) => m.sender === "user");
      if (hasUserMessages) return null;
      const versionMatch = msg.text.match(/v([0-9.]+)/);
      const version = versionMatch ? versionMatch[1] : "0.1.0";
      return (
        <Box key={msg.id} flexDirection="column" marginBottom={1}>
          <CrayonLogo version={version} />
          <Box marginTop={1} paddingLeft={1}>
            <Text color={theme.subtle} dimColor>/help for commands · cwd: {workspaceRoot}</Text>
          </Box>
        </Box>
      );
    }

    if (msg.sender === "user") {
      // A new user turn — a subtle full-width band with a teal ❯ (Claude-style).
      // Ink only supports backgroundColor on <Text>, so pad the line to the
      // terminal width to make the band span full width.
      const prefixLen = 3; // " ❯ "
      const pad = Math.max(0, (columns || 80) - prefixLen - [...msg.text].length);
      return (
        <Box key={msg.id} marginTop={1} marginBottom={1}>
          <Text backgroundColor={theme.panelBg} color={theme.text}>
            {" "}<Text color={theme.brand}>❯</Text>{" "}{msg.text}{" ".repeat(pad)}
          </Text>
        </Box>
      );
    }

    if (msg.sender === "system") {
      if (msg.toolCall) {
        const tc = msg.toolCall;
        const isError = tc.status === "error";
        const bulletColor = isError ? theme.error : theme.success;
        // getToolCallCompletedText prefixes ✓/✗ — strip it; the bullet carries state.
        const label = msg.text.replace(/^[✓✗]\s*/, "");

        let details: React.ReactNode = null;
        if (tc.result) {
          if (tc.name === "terminal") details = renderTerminalOutput(tc.result.stdout, tc.result.stderr);
          else if (tc.name === "grep" || tc.name === "search_codebase") details = renderMatches(tc.result.matches);
        }

        return (
          <Box key={msg.id} flexDirection="column">
            <Box flexDirection="row">
              <Text color={bulletColor}>⏺ </Text>
              <Box flexGrow={1}><Text color={isError ? theme.error : theme.text}>{label}</Text></Box>
            </Box>
            {(msg.diff || details) && (
              <Box flexDirection="row">
                <Text color={theme.border}>  ⎿ </Text>
                <Box flexDirection="column" flexGrow={1}>
                  {msg.diff && <DiffRenderer diff={msg.diff} maxLines={15} />}
                  {details}
                </Box>
              </Box>
            )}
          </Box>
        );
      }

      if (msg.isCommandOutput) {
        return (
          <Box key={msg.id} flexDirection="column" marginBottom={1}>
            <Text color={theme.text}>{msg.text}</Text>
            {msg.diff && <DiffRenderer diff={msg.diff} maxLines={15} />}
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

    // assistant (crayon) — ⏺ bullet + finalized markdown, no box
    return (
      <Box key={msg.id} flexDirection="column" marginBottom={1}>
        {msg.reasoning && <ThinkingMessage thinking={msg.reasoning} isCollapsed={true} />}
        <Box flexDirection="row">
          <Text color={theme.brand}>⏺ </Text>
          <Box flexDirection="column" flexGrow={1}>
            {msg.text ? renderMarkdown(msg.text) : null}
          </Box>
        </Box>
      </Box>
    );
  };

  // Inline command menu state (driven by the single main input).
  const cmdItems = commandMatches(currentInput, customCommands);
  const showCmdMenu =
    currentInput.startsWith("/") && !currentInput.includes(" ") &&
    cmdItems.length > 0 && !isExecuting &&
    !isModelSelectorOpen && !isColorPickerOpen && !approvalRequest;
  // Sliding window so the highlight stays visible when arrowing past the fold.
  const CMD_MAX = 3;
  const cmdSel = Math.min(cmdIndex, Math.max(0, cmdItems.length - 1));
  const cmdStart = cmdSel >= CMD_MAX ? cmdSel - CMD_MAX + 1 : 0;
  const cmdVisible = cmdItems.slice(cmdStart, cmdStart + CMD_MAX);

  return (
    // No fixed viewport: finalized messages commit to native scrollback via
    // <Static>; only the live region + input below re-render.
    <Box flexDirection="column" width="100%">

      {/* Committed history — rendered once each, lives in terminal scrollback */}
      <Static items={history}>
        {(msg) => renderMsg(msg)}
      </Static>

      <Box flexShrink={0} flexDirection="column" paddingLeft={1}>
        {activePlan.length > 0 && currentStepIndex < activePlan.length && (
          <PlanView steps={activePlan} currentStepIndex={currentStepIndex} isExecuting={isExecuting} />
        )}

        {isExecuting && !approvalRequest && (
          <Box flexDirection="column" width="100%">
            {streamingReasoning && !streamingText && (
              <ThinkingMessage thinking={streamingReasoning} />
            )}

            {/* Live assistant text: render RAW while streaming (cheap, no
                per-token markdown re-parse). It is re-rendered as finalized
                markdown once committed to <Static> on completion. */}
            {streamingText && (
              <Box flexDirection="row" marginBottom={1}>
                <Text color={theme.brand}>⏺ </Text>
                <Box flexGrow={1}>
                  <Text color={theme.text}>{streamingText}</Text>
                </Box>
              </Box>
            )}

            {/* Progress spinner only when no text is streaming yet */}
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
            {approvalRequest.type === "plan" ? (
              <Box flexDirection="column">
                <Text color={theme.brand} bold>Plan ready — execute it?</Text>
                <Box marginTop={1}>
                  <SearchableSelect
                    items={[
                      { label: "Execute plan", value: "execute", description: "Switch to auto-edit and implement the plan above" },
                      { label: "Keep planning", value: "keep", description: "Stay in plan mode; refine with another message" },
                      { label: "Discard", value: "discard", description: "Do nothing" }
                    ]}
                    onSelect={(val) => {
                      const plan = approvalRequest.plan as string;
                      setApprovalRequest(null);
                      if (val === "execute" && agentRef.current) {
                        setAgentMode("auto-edit");
                        agentModeRef.current = "auto-edit";
                        agentRef.current.setPermissionMode("auto-edit" as any);
                        pushMessage({ sender: "system", text: "Plan approved — executing in auto-edit mode." });
                        runTask(agentRef.current, `Execute this approved implementation plan, step by step. Verify when done.\n\n${plan}`);
                      } else if (val === "keep") {
                        pushMessage({ sender: "system", text: "Staying in plan mode — send a message to refine the plan." });
                      }
                    }}
                    onCancel={() => setApprovalRequest(null)}
                  />
                </Box>
              </Box>
            ) : approvalRequest.type === "command" ? (
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
                <Text color={theme.subtle} italic>(Press Ctrl+O to view diff full screen)</Text>
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

      {!approvalRequest && mode === "chat" && (
        <Box flexDirection="column" flexShrink={0}>
          {/* Inline command menu — filters as you type "/…", sits above the
              single main input (Claude Code-style). */}
          {showCmdMenu && (
            <Box flexDirection="column" paddingLeft={2} marginBottom={1}>
              {cmdVisible.map((c, i) => {
                const actualIdx = cmdStart + i;
                const sel = actualIdx === cmdSel;
                return (
                  <Box key={c.cmd} flexDirection="row">
                    <Box width={2}><Text color={theme.brand}>{sel ? "❯" : " "}</Text></Box>
                    <Box minWidth={11} marginRight={2}>
                      <Text color={sel ? theme.brand : theme.text} bold={sel}>{c.cmd}</Text>
                    </Box>
                    <Box>
                      <Text color={theme.subtle} dimColor={!sel}>
                        {c.desc}{("usage" in c && c.usage) ? `  ${c.usage}` : ""}
                      </Text>
                    </Box>
                  </Box>
                );
              })}
              <Text color={theme.subtle} dimColor>
                {"  "}
                {cmdStart > 0 ? `↑${cmdStart} ` : ""}
                {cmdStart + CMD_MAX < cmdItems.length ? `↓${cmdItems.length - (cmdStart + CMD_MAX)} · ` : ""}
                ↑↓ select · ⏎ run · tab complete · esc clear
              </Text>
            </Box>
          )}

          {isModelSelectorOpen && (
            <Box flexDirection="column" marginTop={0} paddingLeft={1} marginBottom={1}>
              <Text color={theme.subtle} dimColor>select model · {currentProvider}</Text>
              <SearchableSelect
                items={availableModels}
                placeholder="model…"
                onSelect={(val) => updateModel(val)}
                onCancel={() => setIsModelSelectorOpen(false)}
              />
            </Box>
          )}

          {isColorPickerOpen && (
            <Box flexDirection="column" marginTop={0} paddingLeft={1} marginBottom={1}>
              <Text color={theme.subtle} dimColor>accent color</Text>
              <SearchableSelect
                items={ACCENTS.map((a) => ({ label: a.label, value: a.name, description: a.brand }))}
                placeholder="color…"
                onSelect={(val) => updateAccent(val)}
                onCancel={() => setIsColorPickerOpen(false)}
              />
            </Box>
          )}

          {/* Hide the main prompt only while an overlay picker owns input, so
              there is only ever one input field on screen. */}
          {!isModelSelectorOpen && !isColorPickerOpen && (
            <Box marginTop={0} flexDirection="column" paddingLeft={1}>
              <Box flexDirection="row" borderStyle="round" borderColor={theme.border} paddingX={1}>
                <Text bold color={isExecuting ? theme.subtle : theme.brand}>
                  crayon<Text color={isExecuting ? theme.subtle : theme.success}> ❯ </Text>
                </Text>
                <TextInput
                  focus={!isModelSelectorOpen && !isColorPickerOpen}
                  value={currentInput}
                  onChange={(v) => {
                    if (Date.now() - modeSwitchTimeRef.current < 50 && v.endsWith("t")) {
                      setCurrentInput(v.slice(0, -1));
                      return;
                    }
                    setCurrentInput(v);
                  }}
                  onSubmit={(v) => {
                    const m = commandMatches(v, customCommandsRef.current);
                    // Substitute the highlighted command only when no args typed yet.
                    if (v.startsWith("/") && !v.includes(" ") && m.length > 0) {
                      handleSubmit(m[Math.min(cmdIndex, m.length - 1)].cmd);
                    } else {
                      handleSubmit(v);
                    }
                  }}
                />
              </Box>
              <Box paddingLeft={1}>
                <Text color={theme.success}>⏸ {agentMode} mode on </Text>
                <Text color={theme.subtle}>(Ctrl+T or Shift+Tab to cycle)</Text>
              </Box>
            </Box>
          )}
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
