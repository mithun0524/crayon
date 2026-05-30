import React, { useState, useEffect, useRef } from "react";
import { Box, Text, useInput, useApp } from "ink";
import path from "node:path";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createTwoFilesPatch } from "diff";
import { CrayonAgent, type AgentEvent } from "@crayon/agent";
import { loadConfig } from "../config.js";
import { getGitInfo } from "./gitHelper.js";
import { PlanView } from "./PlanView.js";
import { StreamView } from "./StreamView.js";
import { ToolActivity } from "./ToolActivity.js";
import { StatusBar } from "./StatusBar.js";
import { DiffRenderer } from "./DiffRenderer.js";

interface AppProps {
  mode: "run" | "chat";
  task?: string;
}

interface ChatMessage {
  sender: "user" | "crayon" | "system";
  text: string;
}

export const App: React.FC<AppProps> = ({ mode, task }) => {
  const { exit } = useApp();

  // State
  const [gitBranch, setGitBranch] = useState("main");
  const [gitDirtyCount, setGitDirtyCount] = useState(0);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [activePlan, setActivePlan] = useState<string[]>([]);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [streamingText, setStreamingText] = useState("");
  const [activeToolName, setActiveToolName] = useState<string | null>(null);
  const [activeToolArgs, setActiveToolArgs] = useState<any>(null);
  const [tokens, setTokens] = useState(0);
  const [cost, setCost] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [isExecuting, setIsExecuting] = useState(false);
  const [currentInput, setCurrentInput] = useState("");
  const [approvalRequest, setApprovalRequest] = useState<any>(null);
  const [sessionDiffs, setSessionDiffs] = useState<string[]>([]);
  const [sessionFiles, setSessionFiles] = useState<string[]>([]);

  // Refs
  const agentRef = useRef<CrayonAgent | null>(null);
  const abortedRef = useRef(false);

  const workspaceRoot = process.cwd();
  const workspaceName = path.basename(workspaceRoot);

  // Initialize Git & Agent
  useEffect(() => {
    let active = true;

    async function initAgent() {
      // 1. Git details
      const git = getGitInfo(workspaceRoot);
      if (active) {
        setGitBranch(git.branch);
        setGitDirtyCount(git.dirtyCount);
      }

      // 2. Load API keys & agent config
      const config = await loadConfig();
      if (!active) return;

      const agent = new CrayonAgent({
        workspaceRoot,
        model: config.defaultModel,
        provider: config.provider,
        anthropicApiKey: config.anthropicApiKey,
        openaiApiKey: config.openaiApiKey,
        openrouterApiKey: config.openrouterApiKey,
        googleApiKey: config.googleApiKey,
        onEvent: (event: AgentEvent) => {
          if (!active || abortedRef.current) return;
          handleAgentEvent(event);
        },
        approveCommand: async (command) => {
          if (!active || abortedRef.current) return false;
          return new Promise<boolean>((resolve) => {
            setApprovalRequest({
              type: "command",
              command,
              resolve,
            });
          });
        },
        approveEdit: async (filePath, newContent) => {
          if (!active || abortedRef.current) return false;
          let diff = "";
          try {
            const absPath = path.resolve(workspaceRoot, filePath);
            const originalContent = existsSync(absPath) ? await readFile(absPath, "utf-8") : "";
            diff = createTwoFilesPatch(filePath, filePath, originalContent, newContent);
          } catch {
            diff = `Proposed edit in ${filePath}`;
          }

          return new Promise<boolean>((resolve) => {
            setApprovalRequest({
              type: "edit",
              path: filePath,
              diff,
              resolve,
            });
          });
        },
      });

      agentRef.current = agent;

      // 3. If run mode, execute task immediately
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

  // Run a task on the agent
  const runTask = async (agent: CrayonAgent, taskText: string) => {
    setIsExecuting(true);
    setStreamingText("");
    setActivePlan([]);
    setCurrentStepIndex(0);
    setError(null);
    abortedRef.current = false;

    try {
      const result = await agent.run(taskText, { skipHistory: mode === "run" });
      if (abortedRef.current) return;

      setIsExecuting(false);
      setActiveToolName(null);

      const summaryMsg = result.summary || "Task completed successfully.";
      setHistory((prev) => [...prev, { sender: "crayon", text: summaryMsg }]);
      setStreamingText("");

      if (mode === "run") {
        // Exit process gracefully in one-shot mode after printing final results
        setTimeout(() => {
          exit();
        }, 1000);
      }
    } catch (err: any) {
      if (abortedRef.current) return;
      setIsExecuting(false);
      setActiveToolName(null);
      setError(err?.message || String(err));
      setHistory((prev) => [...prev, { sender: "system", text: `Error: ${err?.message || String(err)}` }]);

      if (mode === "run") {
        setTimeout(() => {
          exit();
        }, 1500);
      }
    }
  };

  // Agent Event Coordinator
  const handleAgentEvent = (event: AgentEvent) => {
    switch (event.type) {
      case "plan":
        setActivePlan(event.steps);
        setCurrentStepIndex(0);
        break;
      case "thinking":
        setActiveToolName("thinking");
        setActiveToolArgs({ thought: event.content });
        break;
      case "tool_call":
        setActiveToolName(event.name);
        setActiveToolArgs(event.args);
        // Track running steps in plan
        if (event.name !== "thinking") {
          setCurrentStepIndex((prev) => Math.min(prev + 1, activePlan.length - 1));
        }
        break;
      case "tool_result":
        setActiveToolName(null);
        setActiveToolArgs(null);
        break;
      case "text_delta":
        setStreamingText((prev) => prev + event.content);
        break;
      case "text":
        // Final response segment
        break;
      case "edit":
        setSessionDiffs((prev) => [...prev, event.diff]);
        setSessionFiles((prev) => [...new Set([...prev, event.path])]);
        // Update Git changes
        const git = getGitInfo(workspaceRoot);
        setGitBranch(git.branch);
        setGitDirtyCount(git.dirtyCount);
        break;
      case "eval":
        // Show test status
        break;
      case "usage":
        setTokens((prev) => prev + event.totalTokens);
        // Approximation: Gemini Flash pricing $0.075/1M in + $0.3/1M out. Average $0.15/1M
        setCost((prev) => prev + (event.totalTokens * 0.00000015));
        break;
      case "error":
        setError(event.message);
        break;
      case "done":
        break;
    }
  };

  // Gracefully stop / abort agent
  const handleAbort = () => {
    abortedRef.current = true;
    setIsExecuting(false);
    setActiveToolName(null);
    setActiveToolArgs(null);
    setStreamingText("");
    setHistory((prev) => [...prev, { sender: "system", text: "🚫 Agent execution interrupted by user." }]);
    if (approvalRequest) {
      approvalRequest.resolve(false);
      setApprovalRequest(null);
    }
  };

  // Keyboard Input Controller
  useInput((input, key) => {
    // 1. Force Quit
    if (key.ctrl && input === "c") {
      if (agentRef.current) {
        agentRef.current.close();
      }
      exit();
      return;
    }

    // 2. Escape to Stop Active Execution
    if (isExecuting) {
      if (key.escape) {
        handleAbort();
      }
      return;
    }

    // 3. Handle Active Approval Requests
    if (approvalRequest) {
      if (input.toLowerCase() === "y") {
        approvalRequest.resolve(true);
        setApprovalRequest(null);
      } else if (input.toLowerCase() === "n" || key.escape) {
        approvalRequest.resolve(false);
        setApprovalRequest(null);
      }
      return;
    }

    // 4. Interactive Chat Inputs
    if (key.return) {
      const trimmed = currentInput.trim();
      setCurrentInput("");
      if (trimmed) {
        handleUserInput(trimmed);
      }
    } else if (key.backspace || key.delete) {
      setCurrentInput((prev) => prev.slice(0, -1));
    } else if (input && input.length === 1 && input.charCodeAt(0) >= 32) {
      setCurrentInput((prev) => prev + input);
    }
  });

  // User input loop coordinator
  const handleUserInput = async (inputStr: string) => {
    setHistory((prev) => [...prev, { sender: "user", text: inputStr }]);

    // Slash command intercept
    if (inputStr.startsWith("/")) {
      const cmd = inputStr.toLowerCase().split(" ")[0];
      switch (cmd) {
        case "/clear":
          if (agentRef.current) {
            agentRef.current.clearHistory();
          }
          setHistory([]);
          setSessionDiffs([]);
          setSessionFiles([]);
          setTokens(0);
          setCost(0);
          setHistory([{ sender: "system", text: "🧼 Conversation history and session caches cleared." }]);
          break;
        case "/diff":
          if (sessionDiffs.length > 0) {
            setHistory((prev) => [
              ...prev,
              { sender: "system", text: `Diff showing changes in ${sessionFiles.join(", ")}:` },
            ]);
          } else {
            setHistory((prev) => [
              ...prev,
              { sender: "system", text: "📭 No file modifications recorded in this session yet." },
            ]);
          }
          break;
        case "/cost":
          setHistory((prev) => [
            ...prev,
            { sender: "system", text: `Estimated token usage: ${tokens.toLocaleString()} (~$${cost.toFixed(5)})` },
          ]);
          break;
        case "/files":
          if (sessionFiles.length > 0) {
            setHistory((prev) => [
              ...prev,
              { sender: "system", text: `Touched files this session:\n${sessionFiles.map((f) => `  - ${f}`).join("\n")}` },
            ]);
          } else {
            setHistory((prev) => [
              ...prev,
              { sender: "system", text: "📭 No files modified in this session." },
            ]);
          }
          break;
        case "/compact":
          if (agentRef.current) {
            agentRef.current.clearHistory();
          }
          setHistory((prev) => [...prev, { sender: "system", text: "🧠 Episodic working memories compacted." }]);
          break;
        default:
          setHistory((prev) => [
            ...prev,
            { sender: "system", text: `Unknown slash command "${cmd}". Supported: /clear, /diff, /cost, /files, /compact` },
          ]);
      }
      return;
    }

    if (agentRef.current) {
      runTask(agentRef.current, inputStr);
    }
  };

  // Render chat bubble rows
  const renderHistory = () => {
    // Keep last 6 turns to prevent terminal screen overflow
    const visibleHistory = history.slice(-6);

    return (
      <Box flexDirection="column" marginY={1}>
        {visibleHistory.map((msg, index) => {
          if (msg.sender === "user") {
            return (
              <Box key={index} marginY={0}>
                <Text color="green" bold>You: </Text>
                <Text color="white">{msg.text}</Text>
              </Box>
            );
          } else if (msg.sender === "system") {
            return (
              <Box key={index} marginY={0}>
                <Text color="gray" italic>System: {msg.text}</Text>
              </Box>
            );
          } else {
            return (
              <Box key={index} marginY={0} flexDirection="column">
                <Text color="cyan" bold>Crayon: </Text>
                <Text color="white">{msg.text}</Text>
              </Box>
            );
          }
        })}
      </Box>
    );
  };

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="cyan"
      padding={1}
      width={80}
    >
      {/* Header Title */}
      <Box justifyContent="center">
        <Text color="cyan" bold> ⬡ Crayon Agent ⬡ </Text>
      </Box>

      {/* Interactive plan checklist */}
      {activePlan.length > 0 && (
        <PlanView
          steps={activePlan}
          currentStepIndex={currentStepIndex}
          isExecuting={isExecuting}
        />
      )}

      {/* Tool Call Overlay */}
      {isExecuting && activeToolName && (
        <ToolActivity
          activeToolName={activeToolName}
          activeToolArgs={activeToolArgs}
        />
      )}

      {/* Render Chat History */}
      {renderHistory()}

      {/* Streaming Live Bubble */}
      {isExecuting && streamingText && (
        <StreamView text={streamingText} isStreaming={isExecuting} />
      )}

      {/* Approval Requests Dialogue */}
      {approvalRequest && (
        <Box flexDirection="column" borderStyle="single" borderColor="yellow" paddingX={1} marginY={1}>
          {approvalRequest.type === "command" ? (
            <Box flexDirection="column">
              <Text color="yellow" bold>⚠️ Approve terminal command execution?</Text>
              <Text color="white" italic>  {approvalRequest.command}</Text>
            </Box>
          ) : (
            <Box flexDirection="column">
              <Text color="yellow" bold>⚠️ Approve file edits in {approvalRequest.path}?</Text>
              <DiffRenderer diff={approvalRequest.diff} maxLines={10} />
            </Box>
          )}
          <Box marginTop={1}>
            <Text color="yellow" bold>Approve? (y/n): </Text>
          </Box>
        </Box>
      )}

      {/* Slash command `/diff` special inline output */}
      {!isExecuting && history.length > 0 && history[history.length - 1]?.text.startsWith("Diff showing changes") && sessionDiffs.length > 0 && (
        <DiffRenderer diff={sessionDiffs[sessionDiffs.length - 1]} maxLines={12} />
      )}

      {/* Error Displays */}
      {error && (
        <Box borderStyle="single" borderColor="red" paddingX={1} marginY={1}>
          <Text color="red" bold>Error: {error}</Text>
        </Box>
      )}

      {/* Standard Chat Input Box */}
      {!isExecuting && !approvalRequest && mode === "chat" && (
        <Box marginTop={1}>
          <Text color="green" bold>You: </Text>
          <Text color="white">{currentInput}</Text>
          <Text color="green" dimColor>▋</Text>
        </Box>
      )}

      {/* Footer Info line */}
      <StatusBar
        workspaceName={workspaceName}
        gitBranch={gitBranch}
        gitDirtyCount={gitDirtyCount}
        tokens={tokens}
        cost={cost}
        isExecuting={isExecuting}
        isChatMode={mode === "chat"}
      />
    </Box>
  );
};
