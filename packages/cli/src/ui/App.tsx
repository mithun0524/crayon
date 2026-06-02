import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";
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
}

const AVAILABLE_COMMANDS = [
  { cmd: "/clear", desc: "Clear conversation history" },
  { cmd: "/mode", desc: "Change permission mode", usage: "ask | auto-edit | plan | auto | bypass" },
  { cmd: "/cost", desc: "View token usage and cost" },
  { cmd: "/files", desc: "View modified files this session" },
  { cmd: "/compact", desc: "Compact conversation history" },
  { cmd: "/model", desc: "Change the AI model", usage: "[model-name]" },
  { cmd: "/config", desc: "Change provider, model, or theme" },
  { cmd: "/help", desc: "Show help information" }
];

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

export const App: React.FC<AppProps> = ({ mode, task, resume, permissionMode }) => {
  const { exit } = useApp();
  const { columns } = useTerminalSize();

  const [gitBranch, setGitBranch] = useState("main");
  const [gitDirtyCount, setGitDirtyCount] = useState(0);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [queuedTasks, setQueuedTasks] = useState<string[]>([]);

  const [activePlan, setActivePlan] = useState<string[]>([]);
  const activePlanRef = useRef<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [activeToolArgs, setActiveToolArgs] = useState<any>(null);
  const [tokens, setTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
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

  const agentRef = useRef<CrayonAgent | null>(null);
  const abortedRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const historyCountRef = useRef(0);
  const executionStartTime = useRef<number | undefined>(undefined);

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
    setError(null);
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
      setError(err?.message || String(err));
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
        setActiveToolName(event.name);
        setActiveToolArgs(event.args);
        setStreamingText("");
        if (event.name !== "thinking") {
          setCurrentStepIndex((prev) => Math.min(prev + 1, Math.max(0, activePlanRef.current.length - 1)));
        } else {
          setActiveToolArgs({ status: "Thinking..." });
        }
        break;
      case "tool_result":
        if (activeToolName && activeToolName !== "thinking") {
          let activityText = `✓ Ran tool ${activeToolName}`;
          const args = activeToolArgs || {};
          if (activeToolName === "read_file") activityText = `✓ Reading ${args.path}`;
          else if (activeToolName === "edit_file" || activeToolName === "edit_ast") activityText = `✓ Edited ${args.path}`;
          else if (activeToolName === "write_file") activityText = `✓ Created ${args.path}`;
          else if (activeToolName === "grep") activityText = `✓ Searched for "${args.pattern}"`;
          else if (activeToolName === "search_codebase") activityText = `✓ Semantic search "${args.query}"`;
          else if (activeToolName === "terminal") activityText = `✓ Ran command: ${args.command}`;
          pushMessage({ sender: "system", text: activityText });
        }
        setActiveToolName(null);
        setActiveToolArgs(null);
        break;
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
        pushMessage({ sender: "system", text: `Diff showing changes in ${event.path}:`, diff: event.diff });
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
        setError(event.message);
        break;
    }
  };

  const handleAbort = () => {
    abortedRef.current = true;
    abortControllerRef.current?.abort();
    setIsExecuting(false);
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
      if ((key.ctrl && input === "t") || (key.shift && key.tab)) {
        const modes = ["ask", "auto-edit", "plan", "auto", "bypass"];
        const currentIdx = modes.indexOf(agentMode);
        const nextMode = modes[(currentIdx + 1) % modes.length];
        setAgentMode(nextMode);
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
          pushMessage({ sender: "system", text: `✅ Compacted ${agentHistory.length} messages → ${compacted.length} messages.` });
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
          pushMessage({ sender: "system", text: "⚙️ To change your AI provider, model, or UI theme, please exit the chat (Ctrl+C) and run `crayon config` in your terminal." });
          break;
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

  const getToolDisplay = () => {
    if (!activeToolName || activeToolName === "thinking") return "Thinking...";
    let argInfo = "";
    try {
      if (activeToolArgs) {
        if (activeToolArgs.path) argInfo = ` ${activeToolArgs.path}`;
        else if (activeToolArgs.file_path) argInfo = ` ${activeToolArgs.file_path}`;
        else if (activeToolArgs.command) argInfo = ` ${activeToolArgs.command}`;
        else if (activeToolArgs.query) argInfo = ` '${activeToolArgs.query}'`;
      }
    } catch {}
    return `Running ${activeToolName}${argInfo}...`;
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
          <Box key={index} marginY={1} paddingX={1} borderStyle="round" borderColor={theme.border} flexDirection="column">
            {lang && <Text color={theme.subtle} italic>{lang}</Text>}
            <Text>{highlighted}</Text>
          </Box>
        );
      }
      if (part.trim() === "") return null;
      let mdText = part;
      try {
        mdText = (marked.parse(part) as string).trim();
      } catch {}
      return <Text key={index}>{mdText}</Text>;
    });
  };

  return (
    <Box flexDirection="column" width="100%">
      <Static items={history}>
        {(msg) => {
          if (msg.text.startsWith("⬡ Crayon v")) {
            const versionMatch = msg.text.match(/v([0-9.]+)/);
            const version = versionMatch ? versionMatch[1] : "0.1.0";
            
            const tips = [
              "Tip: Hit Ctrl+E to open your editor for multi-line prompts.",
              "Tip: Hit Ctrl+T to quickly cycle permission modes.",
              "Tip: Type / to open the Command Palette.",
              "Tip: Crayon works best with a detailed system prompt."
            ];
            // Use msg.id as a stable seed so it doesn't blink on re-renders
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
          } else if (msg.sender === "system") {
            return (
              <Box key={msg.id} flexDirection="column" marginBottom={1}>
                <Text color={theme.subtle} italic>{msg.text}</Text>
                {msg.diff && <DiffRenderer diff={msg.diff} maxLines={15} />}
              </Box>
            );
          } else {
            const crayonColors = ["#FF6B6B", "#FF9E79", "#FFD93D", "#6BCB77", "#4D96FF", "#9D4EDD"];
            return (
              <Box key={msg.id} flexDirection="column" marginBottom={1}>
                <Text bold>
                  {"Crayon".split("").map((char, i) => (
                    <Text key={i} color={crayonColors[i % crayonColors.length]}>{char}</Text>
                  ))}
                  <Text color={theme.brand}>: </Text>
                </Text>
                {msg.reasoning && (
                  <ThinkingMessage thinking={msg.reasoning} />
                )}
                <Box flexDirection="column">
                  {renderMarkdown(msg.text)}
                </Box>
              </Box>
            );
          }
        }}
      </Static>

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
                    const crayonColors = ["#FF6B6B", "#FF9E79", "#FFD93D", "#6BCB77", "#4D96FF", "#9D4EDD"];
                    return <Text key={i} color={crayonColors[i % crayonColors.length]}>{char}</Text>
                  })}
                  <Text color={theme.brand}>: </Text>
                </Text>
                {streamingReasoning && (
                  <ThinkingMessage thinking={streamingReasoning} />
                )}
                <Box flexDirection="column">
                  {renderMarkdown(streamingText)}
                </Box>
              </Box>
            )}

            <AgentProgress
              statusText={getToolDisplay()}
              tokens={tokens}
              startTime={executionStartTime.current}
            />
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

        {error && (
          <Box borderStyle="single" borderColor={theme.error} paddingX={1} marginY={1} width="100%">
            <Text color={theme.error} bold>Error: {error}</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={theme.border}>{"─".repeat(columns || 80)}</Text>
      </Box>

      {!approvalRequest && mode === "chat" && (
        <Box flexDirection="column">
          {isCommandPaletteOpen ? (
            <Box flexDirection="column" marginTop={0} paddingLeft={1}>
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
          ) : isModelSelectorOpen ? (
            <Box flexDirection="column" marginTop={0} paddingLeft={1}>
              <Text color={theme.success} bold>Select a model for {currentProvider}</Text>
              <SearchableSelect
                items={availableModels}
                placeholder="Search models..."
                onSelect={(val) => updateModel(val)}
                onCancel={() => setIsModelSelectorOpen(false)}
              />
            </Box>
          ) : (
            <Box marginTop={0} flexDirection="column" paddingLeft={1}>
              <Box flexDirection="row" borderStyle="round" borderColor={theme.border} paddingX={1}>
                <Text bold>
                  {"crayon".split("").map((char, i) => {
                    const crayonColors = ["#FF6B6B", "#FF9E79", "#FFD93D", "#6BCB77", "#4D96FF", "#9D4EDD"];
                    return <Text key={i} color={isExecuting ? theme.subtle : crayonColors[i % crayonColors.length]}>{char}</Text>
                  })}
                  <Text color={isExecuting ? theme.subtle : theme.success}> ❯ </Text>
                </Text>
                <TextInput value={currentInput} onChange={(v) => { 
                  if (v === "/") {
                    setIsCommandPaletteOpen(true);
                    setCurrentInput("");
                  } else {
                    setCurrentInput(v); 
                  }
                }} onSubmit={handleSubmit} />
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
