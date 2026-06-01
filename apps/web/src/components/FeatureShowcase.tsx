import React from 'react';

export default function FeatureShowcase() {
  return (
    <section id="features" className="py-32 px-6 max-w-7xl mx-auto w-full space-y-40">
      {/* Feature 1 */}
      <div className="flex flex-col-reverse lg:flex-row items-center gap-16">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#121214] text-white/80 text-xs font-inter tracking-wide uppercase border border-white/10">
            Intelligent Scope
          </div>
          <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white leading-tight">
            Stop sending your whole repo to the LLM.
          </h2>
          <p className="text-lg text-white/50 font-inter leading-relaxed tracking-wide">
            Our Context Engine acts like a senior engineer reading your codebase. It traverses ASTs and dependency graphs to fetch exactly what's needed, reducing token usage by 95% while improving output accuracy.
          </p>
        </div>
        <div className="flex-1 w-full relative" aria-hidden="true">
          <div className="absolute -inset-10 bg-[#00E5FF]/5 blur-[80px] rounded-full z-0 mix-blend-screen"></div>
          <div className="p-6 rounded-3xl relative z-10 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#121214]">
            <div className="space-y-4 font-mono text-sm">
              <div className="text-white/40 border-b border-white/5 pb-4 mb-4 text-xs tracking-widest uppercase">Context Assembly</div>
              <div className="flex items-center gap-3"><span className="text-[#00FF66]">✓</span> Indexing 12,400 files...</div>
              <div className="flex items-center gap-3"><span className="text-[#00FF66]">✓</span> Tracing auth/session.ts</div>
              <div className="flex items-center gap-3"><span className="text-white/50">ℹ</span> Skipped 12,398 irrelevant files</div>
              <div className="mt-6 p-4 rounded-xl bg-[#09090B] border border-white/5 text-white/80">
                Context Payload Size: <span className="text-[#00E5FF] font-bold">14.2kb</span> <span className="text-white/30 line-through ml-2">2.4mb</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Feature 2 */}
      <div className="flex flex-col-reverse lg:flex-row-reverse items-center gap-16">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#121214] text-white/80 text-xs font-inter tracking-wide uppercase border border-white/10">
            Continuous Testing
          </div>
          <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white leading-tight">
            It writes the code, and fixes its own bugs.
          </h2>
          <p className="text-lg text-white/50 font-inter leading-relaxed tracking-wide">
            Crayon operates in a secure Docker sandbox. It executes test suites after applying diff patches. If a test fails, the Self-Healing Loop analyzes the stdout stack trace and patches the issue autonomously.
          </p>
        </div>
        <div className="flex-1 w-full relative" aria-hidden="true">
          <div className="absolute -inset-10 bg-[#00FF66]/5 blur-[80px] rounded-full z-0 mix-blend-screen"></div>
          <div className="p-6 rounded-3xl relative z-10 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#121214]">
            <div className="space-y-4 font-mono text-sm">
              <div className="text-white/40 border-b border-white/5 pb-4 mb-4 text-xs tracking-widest uppercase">Terminal Output</div>
              <div className="text-white/60">$ pnpm test api/checkout</div>
              <div className="text-[#FF3366]">✗ FAIL src/app/api/checkout/route.test.ts</div>
              <div className="text-white/40 pl-4 border-l-2 border-[#FF3366]/30">Error: Missing stripe webhook secret in test environment.</div>
              <div className="text-white/70 mt-6">→ Crayon is analyzing the failure...</div>
              <div className="text-white/70">→ Patching jest.setup.ts</div>
              <div className="text-[#00FF66] mt-4">✓ PASS src/app/api/checkout/route.test.ts</div>
            </div>
          </div>
        </div>
      </div>
      {/* Feature 3 */}
      <div className="flex flex-col-reverse lg:flex-row items-center gap-16 mt-40">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#121214] text-white/80 text-xs font-inter tracking-wide uppercase border border-white/10">
            Deep Code Intelligence
          </div>
          <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white leading-tight">
            AST-level understanding. Native semantic search.
          </h2>
          <p className="text-lg text-white/50 font-inter leading-relaxed tracking-wide">
            Crayon natively parses TypeScript, Python, Rust, Go, and Java using <code>web-tree-sitter</code>. Combined with local LanceDB vector embeddings, it tracks interface usages, dependency graphs, and architecture across thousands of files instantly.
          </p>
        </div>
        <div className="flex-1 w-full relative" aria-hidden="true">
          <div className="absolute -inset-10 bg-[#FF3366]/5 blur-[80px] rounded-full z-0 mix-blend-screen"></div>
          <div className="p-6 rounded-3xl relative z-10 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#121214]">
            <div className="space-y-4 font-mono text-sm">
              <div className="text-white/40 border-b border-white/5 pb-4 mb-4 text-xs tracking-widest uppercase">AST Parser Output</div>
              <div className="text-white/60">$ crayon run "Find TaskState usages"</div>
              <div className="text-[#00E5FF] mt-4">→ [AST] Loading tree-sitter-typescript.wasm</div>
              <div className="text-[#00FF66]">✓ Parsed 452 interfaces across 84 files</div>
              <div className="text-white/70">→ [Vector] Querying LanceDB for 'TaskState' semantics</div>
              <div className="text-white/50 pl-4 border-l-2 border-white/20 mt-2">Found 12 exact implementations.</div>
              <div className="text-white/50 pl-4 border-l-2 border-white/20">Found 3 semantic overlaps.</div>
            </div>
          </div>
        </div>
      </div>
      {/* Feature 4 */}
      <div className="flex flex-col-reverse lg:flex-row-reverse items-center gap-16 mt-40">
        <div className="flex-1 space-y-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#121214] text-white/80 text-xs font-inter tracking-wide uppercase border border-white/10">
            Unified Ecosystem
          </div>
          <h2 className="text-4xl md:text-5xl font-outfit font-bold text-white leading-tight">
            VS Code, CLI, and MCP.
          </h2>
          <p className="text-lg text-white/50 font-inter leading-relaxed tracking-wide">
            Interact with Crayon through our beautiful Terminal UI, the native VS Code extension, or expose it to other agents via the built-in Model Context Protocol (MCP) server. Crayon works exactly where you do.
          </p>
        </div>
        <div className="flex-1 w-full relative" aria-hidden="true">
          <div className="absolute -inset-10 bg-[#B533FF]/5 blur-[80px] rounded-full z-0 mix-blend-screen"></div>
          <div className="p-6 rounded-3xl relative z-10 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.8)] bg-[#121214]">
            <div className="space-y-4 font-mono text-sm">
              <div className="text-white/40 border-b border-white/5 pb-4 mb-4 text-xs tracking-widest uppercase">System Integration</div>
              <div className="text-white/60">$ crayon serve</div>
              <div className="text-[#00FF66] mt-2">✓ Starting MCP Stdio Server...</div>
              <div className="text-white/70">→ Exposed 24 native tools</div>
              <div className="text-white/70">→ Connected to Claude Desktop</div>
              <div className="text-white/60 mt-4">$ code --install-extension crayon-ai.vsix</div>
              <div className="text-[#00FF66]">✓ VS Code Extension activated</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
