import { describe, it, expect, afterAll } from "vitest";
import { createLSPServerInstance } from "./LSPServerInstance.js";
import { writeFileSync, unlinkSync } from "node:fs";
import path from "node:path";

const mockServerFile = path.resolve("mock-lsp-server.cjs");

const mockServerCode = `
let buffer = '';
process.stdin.on('data', (chunk) => {
  buffer += chunk.toString();
  while (true) {
    const match = buffer.match(/Content-Length: (\\d+)\\r\\n\\r\\n/);
    if (!match) break;
    const contentLength = parseInt(match[1], 10);
    const headerLength = match[0].length;
    if (buffer.length < headerLength + contentLength) break;
    
    const content = buffer.slice(headerLength, headerLength + contentLength);
    buffer = buffer.slice(headerLength + contentLength);
    
    const request = JSON.parse(content);
    const id = request.id;
    const method = request.method;
    
    if (method === 'initialize') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          capabilities: {
            definitionProvider: true
          }
        }
      });
    } else if (method === 'textDocument/definition') {
      send({
        jsonrpc: '2.0',
        id,
        result: {
          uri: 'file:///workspace/test.ts',
          range: {
            start: { line: 5, character: 10 },
            end: { line: 5, character: 20 }
          }
        }
      });
    } else if (method === 'shutdown') {
      send({ jsonrpc: '2.0', id, result: {} });
    }
  }
});

function send(msg) {
  const content = JSON.stringify(msg);
  process.stdout.write(\`Content-Length: \${content.length}\\r\\n\\r\\n\${content}\`);
}
`;

writeFileSync(mockServerFile, mockServerCode, "utf8");

describe("LSP Services Integration", () => {
  afterAll(() => {
    try {
      unlinkSync(mockServerFile);
    } catch {}
  });

  it("should start, initialize, request definition, and shutdown mock language server", async () => {
    const serverInstance = createLSPServerInstance("mock-server", {
      command: "node",
      args: [mockServerFile],
      workspaceFolder: process.cwd(),
      extensionToLanguage: { ".ts": "typescript" },
    });

    expect(serverInstance.state).toBe("stopped");

    await serverInstance.start();
    expect(serverInstance.state).toBe("running");

    const definitionResult: any = await serverInstance.sendRequest("textDocument/definition", {
      textDocument: { uri: "file:///workspace/app.ts" },
      position: { line: 0, character: 0 },
    });

    expect(definitionResult.uri).toBe("file:///workspace/test.ts");
    expect(definitionResult.range.start.line).toBe(5);

    await serverInstance.stop();
    expect(serverInstance.state).toBe("stopped");
  });
});
