/**
 * DEC 2026 Synchronized Output (BSU / ESU) implementation to prevent terminal tearing.
 * This wraps process.stdout.write to ensure atomic redraws in supported terminals
 * (Windows Terminal, VS Code, iTerm, Kitty, Ghostty, Alacritty, WezTerm, etc.).
 */

const BSU = '\x1B[?2026h';
const ESU = '\x1B[?2026l';

export function enableTerminalSync() {
  // Check if terminal supports synchronized updates
  let supported = false;
  
  if (
    process.env.WT_SESSION || // Windows Terminal
    process.env.TERM_PROGRAM === 'vscode' ||
    process.env.TERM_PROGRAM === 'iTerm.app' ||
    process.env.TERM_PROGRAM === 'WezTerm' ||
    process.env.TERM_PROGRAM === 'WarpTerminal' ||
    process.env.TERM_PROGRAM === 'ghostty' ||
    process.env.TERM_PROGRAM === 'contour' ||
    process.env.TERM_PROGRAM === 'alacritty' ||
    process.env.ZED_TERM ||
    (process.env.TERM && (
      process.env.TERM.includes('kitty') ||
      process.env.TERM.includes('alacritty') ||
      process.env.TERM === 'xterm-ghostty' ||
      process.env.TERM.startsWith('foot')
    ))
  ) {
    supported = true;
  }

  // tmux breaks DEC 2026 atomicity by chunking
  if (process.env.TMUX) {
    supported = false;
  }

  if (!supported) return;

  const originalWrite = process.stdout.write.bind(process.stdout);

  // Monkeypatch stdout.write to wrap all writes in BSU / ESU
  process.stdout.write = (chunk: any, encoding?: any, cb?: any): boolean => {
    // Prevent recursive wrapping if ink triggers it internally
    if (typeof chunk === 'string') {
      if (chunk.includes(BSU)) return originalWrite(chunk, encoding, cb);
      return originalWrite(`${BSU}${chunk}${ESU}`, encoding, cb);
    } else if (Buffer.isBuffer(chunk)) {
      originalWrite(Buffer.from(BSU));
      originalWrite(chunk, encoding);
      return originalWrite(Buffer.from(ESU), cb);
    }
    return originalWrite(chunk, encoding, cb);
  };
}
