// LSP is best-effort: a missing/crashing language server must never print into
// the TUI (console.* writes straight through Ink's frame). Opt in with CRAYON_DEBUG=1.
export function lspLog(message: string): void {
  if (process.env.CRAYON_DEBUG) process.stderr.write(`[lsp] ${message}\n`);
}
