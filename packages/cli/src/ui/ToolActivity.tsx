import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";

interface ToolActivityProps {
  activeToolName: string | null;
  activeToolArgs: any;
}

export const ToolActivity: React.FC<ToolActivityProps> = ({ activeToolName, activeToolArgs }) => {
  if (!activeToolName) return null;

  let activityText = "";
  const args = activeToolArgs || {};

  switch (activeToolName) {
    case "thinking":
      activityText = `Thinking: ${args.thought || ""}`;
      break;
    case "read_file":
      activityText = `Reading file: ${args.path || ""}`;
      break;
    case "edit_file":
      activityText = `Editing file: ${args.path || ""}`;
      break;
    case "edit_ast":
      activityText = `Editing AST symbol "${args.symbol_name || ""}" in ${args.path || ""}`;
      break;
    case "write_file":
      activityText = `Creating file: ${args.path || ""}`;
      break;
    case "overwrite_file":
      activityText = `Overwriting file: ${args.path || ""}`;
      break;
    case "grep":
      activityText = `Searching files for pattern: "${args.pattern || ""}"`;
      break;
    case "search_codebase":
      activityText = `Semantic search: "${args.query || ""}"`;
      break;
    case "list_directory":
      activityText = `Listing directory: ${args.path || "."}`;
      break;
    case "terminal":
      activityText = `Running command: "${args.command || ""}"`;
      break;
    case "git_status":
      activityText = "Checking git status...";
      break;
    case "git_diff":
      activityText = "Generating git diff...";
      break;
    case "git_commit":
      activityText = `Committing changes: "${args.message || ""}"`;
      break;
    default:
      if (activeToolName.startsWith("mcp_")) {
        activityText = `Running MCP tool [${activeToolName}]: ${JSON.stringify(args)}`;
      } else {
        activityText = `Running tool [${activeToolName}]`;
      }
  }

  // Crop extremely long thought texts for neatness
  if (activityText.length > 80) {
    activityText = activityText.slice(0, 77) + "...";
  }

  return (
    <Box paddingY={1} paddingX={1} borderStyle="single" borderColor="blue" flexDirection="row" alignItems="center">
      <Text color="blue">
        <Spinner type="dots" />{" "}
      </Text>
      <Text color="blue" bold>
        {activityText}
      </Text>
    </Box>
  );
};
