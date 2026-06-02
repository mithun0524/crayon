import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp, Static } from "ink";
import TextInput from "ink-text-input";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
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
  { cmd: "/mode", desc: "Change permission mode (ask, auto-edit, plan, auto, bypass)" },
  { cmd: "/cost", desc: "View token usage and cost" },
  { cmd: "/files", desc: "View modified files this session" },
  { cmd: "/compact", desc: "Compact conversation history" },
  { cmd: "/help", desc: "Show help information" }
];

export const App: React.FC<AppProps> = ({ mode, task, resume, permissionMode }) => {
  const { exit } = useApp();
  const { columns } = useTerminalSize();

  const [gitBranch, setGitBranch] = useState("main");
  const [gitDirtyCount, setGitDirtyCount] = useState(0);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [queuedTasks, setQueuedTasks] = useState<string[]>([]);
  const [commandIndex, setCommandIndex] = useState(-1);
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

    if (!approvalRequest && mode === "chat") {
      if (currentInput.startsWith("/") && !currentInput.includes(" ")) {
        const matches = AVAILABLE_COMMANDS.filter(c => c.cmd.startsWith(currentInput));
        if (key.upArrow) {
          setCommandIndex(prev => Math.max(0, prev - 1));
        } else if (key.downArrow) {
          setCommandIndex(prev => Math.min(matches.length - 1, prev + 1));
        } else if (key.tab) {
          const idx = Math.max(0, commandIndex);
          if (matches.length > 0 && idx < matches.length) {
            setCurrentInput(matches[idx].cmd + " ");
            setCommandIndex(-1);
          }
        }
      } else {
        if (commandIndex !== -1) setCommandIndex(-1);
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

  const handleSubmit = async (inputStr: string) => {
    if (currentInput.startsWith("/") && !currentInput.includes(" ")) {
      const matches = AVAILABLE_COMMANDS.filter(c => c.cmd.startsWith(currentInput));
      
      if (commandIndex !== -1 && matches.length > 0 && commandIndex < matches.length) {
        setCurrentInput(matches[commandIndex].cmd + " ");
        setCommandIndex(-1);
        return;
      }

      const exactMatch = matches.find(c => c.cmd === inputStr.trim());
      if (!exactMatch && matches.length > 0) {
        setCurrentInput(matches[0].cmd + " ");
        setCommandIndex(-1);
        return;
      }
    }

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
        case "/help":
          pushMessage({
            sender: "system",
            text: `Available Commands:\n${AVAILABLE_COMMANDS.map(c => `  ${c.cmd.padEnd(10)} - ${c.desc}`).join("\n")}`
          });
          break;
        default:
          pushMessage({ sender: "system", text: `Unknown command "${cmd}". Supported: /clear, /mode, /cost, /files, /compact, /help` });
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
    if (!activeToolName || activeToolName === "thinking") return streamingText || "Thinking...";
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

  return (
    <Box flexDirection="column" width="100%">
      <Static items={history}>
        {(msg) => {
          if (msg.text.startsWith("⬡ Crayon v")) {
            return (
              <Box key={msg.id} flexDirection="column" marginBottom={1}>
                <Text color={theme.brand} bold>{msg.text}</Text>
                <Text color={theme.border}>{"─".repeat(columns || 80)}</Text>
              </Box>
            );
          }

          if (msg.sender === "user") {
            return (
              <Box key={msg.id}>
                <Text color={theme.subtle} bold>❯ You: </Text>
                <Text color={theme.text}>{msg.text}</Text>
              </Box>
            );
          } else if (msg.sender === "system") {
            return (
              <Box key={msg.id} flexDirection="column">
                <Text color={theme.subtle} italic>{msg.text}</Text>
                {msg.diff && <DiffRenderer diff={msg.diff} maxLines={15} />}
              </Box>
            );
          } else {
            const parts = msg.text.split(/(```[\s\S]*?```)/g);
            return (
              <Box key={msg.id} flexDirection="column">
                <Text color={theme.brand} bold>Crayon: </Text>
                {msg.reasoning && (
                  <ThinkingMessage thinking={msg.reasoning} />
                )}
                <Box flexDirection="column">
                  {parts.map((part, index) => {
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
                      mdText = marked.parse(part) as string;
                    } catch {}
                    return <Text key={index}>{mdText}</Text>;
                  })}
                </Box>
              </Box>
            );
          }
        }}
      </Static>

      <Box flexShrink={0} flexDirection="column" paddingLeft={1}>
        {activePlan.length > 0 && (
          <PlanView steps={activePlan} currentStepIndex={currentStepIndex} isExecuting={isExecuting} />
        )}

        {isExecuting && activePlan.length === 0 && !approvalRequest && (
          <Box flexDirection="column" width="100%">
            {streamingReasoning && (
              <ThinkingMessage thinking={streamingReasoning} />
            )}
            <AgentProgress
              statusText={getToolDisplay()}
              tokens={tokens}
              startTime={executionStartTime.current}
              modelName={defaultModel}
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
                  <Text color={theme.warning} bold>Accept? [y] / [n]</Text>
                </Box>
              </Box>
            ) : (
              <Box flexDirection="column">
                <Text color={theme.warning} bold>⚠️ Approve file edits in {approvalRequest.path}?</Text>
                <DiffRenderer diff={approvalRequest.diff} maxLines={10} />
                <Box marginTop={1}>
                  <Text color={theme.warning} bold>Accept? [y] / [n] / [e] edit / [s] skip</Text>
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
          {currentInput.startsWith("/") && !currentInput.includes(" ") && (
            <Box flexDirection="column" paddingLeft={1} marginBottom={1} borderStyle="round" borderColor={theme.border} paddingX={1}>
              {AVAILABLE_COMMANDS.filter(c => c.cmd.startsWith(currentInput)).slice(0, 5).map((c, idx) => {
                const isSelected = commandIndex === idx;
                const cmdName = c.cmd.replace("/", "");
                return (
                  <Box key={c.cmd} flexDirection="row">
                    <Box width={3}>
                      <Text color={isSelected ? "white" : theme.subtle} bold={isSelected}>
                        {isSelected ? " ❯ " : "   "}
                      </Text>
                    </Box>
                    <Box width={12}>
                      <Text color={isSelected ? "white" : theme.success} bold={isSelected}>{cmdName}</Text>
                    </Box>
                    <Box>
                      <Text color={isSelected ? "white" : theme.subtle}>{c.desc}</Text>
                    </Box>
                  </Box>
                );
              })}
              {AVAILABLE_COMMANDS.filter(c => c.cmd.startsWith(currentInput)).length > 5 && (
                <Box flexDirection="row" marginTop={1}>
                  <Box width={15}></Box>
                  <Text color={theme.subtle} italic>... ({AVAILABLE_COMMANDS.filter(c => c.cmd.startsWith(currentInput)).length - 5} more commands)</Text>
                </Box>
              )}
            </Box>
          )}
          <Box marginTop={0} flexDirection="row" paddingLeft={1}>
            <Text color={isExecuting ? theme.subtle : theme.success} bold>crayon ❯ </Text>
            <TextInput value={currentInput} onChange={(v) => { setCurrentInput(v); setCommandIndex(-1); }} onSubmit={handleSubmit} />
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
        agentMode={agentMode}
        modelName={defaultModel}
      />
    </Box>
  );
};
