# Graph Report - /Users/mithunchavan/crayon  (2026-07-10)

## Corpus Check
- 132 files · ~86,013 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 538 nodes · 914 edges · 57 communities detected
- Extraction: 80% EXTRACTED · 20% INFERRED · 0% AMBIGUOUS · INFERRED: 183 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]

## God Nodes (most connected - your core abstractions)
1. `parse()` - 30 edges
2. `handleSubmit()` - 24 edges
3. `handleEvent()` - 22 edges
4. `CrayonAgent` - 21 edges
5. `ChatPanelProvider` - 21 edges
6. `CodeIndexer` - 16 edges
7. `WorktreeManager` - 14 edges
8. `pushMessage()` - 14 edges
9. `append()` - 14 edges
10. `EpisodicMemory` - 12 edges

## Surprising Connections (you probably didn't know these)
- `createGitTools()` --calls--> `createTools()`  [INFERRED]
  /Users/mithunchavan/crayon/packages/agent/src/tools/git-workflow.ts → /Users/mithunchavan/crayon/packages/agent/src/tools/index.ts
- `createTodoTool()` --calls--> `createTools()`  [INFERRED]
  /Users/mithunchavan/crayon/packages/agent/src/tools/todo.ts → /Users/mithunchavan/crayon/packages/agent/src/tools/index.ts
- `createAgentTool()` --calls--> `createTools()`  [INFERRED]
  /Users/mithunchavan/crayon/packages/agent/src/tools/agent.ts → /Users/mithunchavan/crayon/packages/agent/src/tools/index.ts
- `createGlobTool()` --calls--> `createTools()`  [INFERRED]
  /Users/mithunchavan/crayon/packages/agent/src/tools/glob.ts → /Users/mithunchavan/crayon/packages/agent/src/tools/index.ts
- `createAskUserTool()` --calls--> `createTools()`  [INFERRED]
  /Users/mithunchavan/crayon/packages/agent/src/tools/ask_user.ts → /Users/mithunchavan/crayon/packages/agent/src/tools/index.ts

## Communities

### Community 0 - "Community 0"
Cohesion: 0.06
Nodes (41): formatDuration(), cleanExit(), copyToClipboard(), decideHunk(), finishHunks(), getToolDisplay(), handleAbort(), handleAgentEvent() (+33 more)

### Community 1 - "Community 1"
Cohesion: 0.05
Nodes (24): autoCommitEdits(), autoCompact(), estimateTokenCount(), getCompactionLevel(), microCompact(), CrayonAgent, createTools(), getContextWindow() (+16 more)

### Community 2 - "Community 2"
Cohesion: 0.06
Nodes (16): DependencyGraph, build(), fuzzyMatch(), hybridSearch(), CodeIndexer, fetchOllamaModels(), runOnboardingFlow(), detectRepoIntelligence() (+8 more)

### Community 3 - "Community 3"
Cohesion: 0.13
Nodes (38): addEditRow(), addMsg(), addReasoningRow(), addTextMsg(), addToolRow(), addToReadGroup(), append(), appendStream() (+30 more)

### Community 4 - "Community 4"
Cohesion: 0.07
Nodes (13): createAgentTool(), createAskUserTool(), CliSession, strip(), createGitTools(), createGlobTool(), assertPublicUrl(), fuzzyReplace() (+5 more)

### Community 5 - "Community 5"
Cohesion: 0.09
Nodes (10): runTests(), defaultEmbedder(), EpisodicMemory, embed(), tokenize(), buildDynamicContext(), buildStaticSystemPrompt(), buildSystemPrompt() (+2 more)

### Community 6 - "Community 6"
Cohesion: 0.12
Nodes (4): getEditorContext(), ChatPanelProvider, getNonce(), deactivate()

### Community 7 - "Community 7"
Cohesion: 0.14
Nodes (12): exitCLI(), runFallback(), runHeadlessJson(), runMain(), flushTelemetry(), initTelemetry(), trackEvent(), fetchLatestVersionFromNpm() (+4 more)

### Community 8 - "Community 8"
Cohesion: 0.1
Nodes (1): CodeIndexer

### Community 9 - "Community 9"
Cohesion: 0.16
Nodes (2): canonical(), WorktreeManager

### Community 10 - "Community 10"
Cohesion: 0.11
Nodes (2): DiffRenderer(), parseDiff()

### Community 11 - "Community 11"
Cohesion: 0.19
Nodes (3): EmbeddingProvider, runMcpServer(), VectorStore

### Community 12 - "Community 12"
Cohesion: 0.24
Nodes (7): createMemoryTool(), detectCommitConvention(), detectScripts(), detectWorkspacePackages(), generateMemoryContent(), readReadmeExcerpt(), topFilesBySymbols()

### Community 13 - "Community 13"
Cohesion: 0.22
Nodes (1): FileStateCache

### Community 14 - "Community 14"
Cohesion: 0.42
Nodes (7): getRetryAfterMs(), getStatusCode(), isContextOverflowError(), isHardRateLimit(), isRetryableError(), sleep(), withRetry()

### Community 15 - "Community 15"
Cohesion: 0.43
Nodes (1): TaskManager

### Community 16 - "Community 16"
Cohesion: 0.6
Nodes (4): detectPackageManager(), detectTestCommand(), execEval(), runEvaluation()

### Community 17 - "Community 17"
Cohesion: 0.5
Nodes (2): createLSPClient(), createLSPServerInstance()

### Community 18 - "Community 18"
Cohesion: 0.67
Nodes (0): 

### Community 19 - "Community 19"
Cohesion: 1.0
Nodes (0): 

### Community 20 - "Community 20"
Cohesion: 1.0
Nodes (0): 

### Community 21 - "Community 21"
Cohesion: 1.0
Nodes (0): 

### Community 22 - "Community 22"
Cohesion: 1.0
Nodes (0): 

### Community 23 - "Community 23"
Cohesion: 1.0
Nodes (0): 

### Community 24 - "Community 24"
Cohesion: 1.0
Nodes (0): 

### Community 25 - "Community 25"
Cohesion: 1.0
Nodes (0): 

### Community 26 - "Community 26"
Cohesion: 1.0
Nodes (0): 

### Community 27 - "Community 27"
Cohesion: 1.0
Nodes (0): 

### Community 28 - "Community 28"
Cohesion: 1.0
Nodes (0): 

### Community 29 - "Community 29"
Cohesion: 1.0
Nodes (0): 

### Community 30 - "Community 30"
Cohesion: 1.0
Nodes (0): 

### Community 31 - "Community 31"
Cohesion: 1.0
Nodes (0): 

### Community 32 - "Community 32"
Cohesion: 1.0
Nodes (0): 

### Community 33 - "Community 33"
Cohesion: 1.0
Nodes (0): 

### Community 34 - "Community 34"
Cohesion: 1.0
Nodes (0): 

### Community 35 - "Community 35"
Cohesion: 1.0
Nodes (0): 

### Community 36 - "Community 36"
Cohesion: 1.0
Nodes (0): 

### Community 37 - "Community 37"
Cohesion: 1.0
Nodes (0): 

### Community 38 - "Community 38"
Cohesion: 1.0
Nodes (0): 

### Community 39 - "Community 39"
Cohesion: 1.0
Nodes (0): 

### Community 40 - "Community 40"
Cohesion: 1.0
Nodes (0): 

### Community 41 - "Community 41"
Cohesion: 1.0
Nodes (0): 

### Community 42 - "Community 42"
Cohesion: 1.0
Nodes (0): 

### Community 43 - "Community 43"
Cohesion: 1.0
Nodes (0): 

### Community 44 - "Community 44"
Cohesion: 1.0
Nodes (0): 

### Community 45 - "Community 45"
Cohesion: 1.0
Nodes (0): 

### Community 46 - "Community 46"
Cohesion: 1.0
Nodes (0): 

### Community 47 - "Community 47"
Cohesion: 1.0
Nodes (0): 

### Community 48 - "Community 48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "Community 49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "Community 50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "Community 51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "Community 52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "Community 53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "Community 54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "Community 55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "Community 56"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **Thin community `Community 19`** (2 nodes): `walk()`, `rename.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 20`** (2 nodes): `RootLayout()`, `layout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 21`** (2 nodes): `Home()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 22`** (2 nodes): `PrivacyPolicy()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 23`** (2 nodes): `ChangelogPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 24`** (2 nodes): `Security()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 25`** (2 nodes): `CookiePolicy()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 26`** (2 nodes): `FeaturesPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 27`** (2 nodes): `TermsOfService()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 28`** (2 nodes): `DocsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 29`** (2 nodes): `ApiDocsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 30`** (2 nodes): `BlogPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 31`** (2 nodes): `IntegrationsPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 32`** (2 nodes): `POST()`, `route.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 33`** (2 nodes): `CommunityPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 34`** (2 nodes): `PricingPage()`, `page.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 35`** (2 nodes): `handleCopy()`, `Hero.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 36`** (2 nodes): `Pricing()`, `Pricing.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 37`** (2 nodes): `LegalLayout()`, `LegalLayout.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 38`** (2 nodes): `SocialProof()`, `SocialProof.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 39`** (2 nodes): `CookieBanner()`, `CookieBanner.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 40`** (2 nodes): `InteractiveBackground()`, `InteractiveBackground.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 41`** (2 nodes): `Footer()`, `Footer.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 42`** (1 nodes): `smoke.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 43`** (1 nodes): `bump-version.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 44`** (1 nodes): `test-highlight.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 45`** (1 nodes): `App.test.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 46`** (1 nodes): `e2e.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 47`** (1 nodes): `postcss.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 48`** (1 nodes): `next-env.d.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 49`** (1 nodes): `eslint.config.mjs`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 50`** (1 nodes): `next.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 51`** (1 nodes): `Navbar.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 52`** (1 nodes): `FeatureShowcase.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 53`** (1 nodes): `PageHeader.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 54`** (1 nodes): `Testimonials.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 55`** (1 nodes): `CallToAction.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `Community 56`** (1 nodes): `FAQ.tsx`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `parse()` connect `Community 0` to `Community 1`, `Community 2`, `Community 3`, `Community 7`, `Community 12`, `Community 14`, `Community 15`, `Community 16`?**
  _High betweenness centrality (0.247) - this node is a cross-community bridge._
- **Why does `handleSubmit()` connect `Community 0` to `Community 1`, `Community 2`, `Community 13`?**
  _High betweenness centrality (0.076) - this node is a cross-community bridge._
- **Why does `CrayonAgent` connect `Community 1` to `Community 0`, `Community 2`, `Community 13`?**
  _High betweenness centrality (0.075) - this node is a cross-community bridge._
- **Are the 27 inferred relationships involving `parse()` (e.g. with `.suggestFollowUps()` and `detectTestCommand()`) actually correct?**
  _`parse()` has 27 INFERRED edges - model-reasoned connections that need verification._
- **Are the 13 inferred relationships involving `handleSubmit()` (e.g. with `expandTemplate()` and `.clearHistory()`) actually correct?**
  _`handleSubmit()` has 13 INFERRED edges - model-reasoned connections that need verification._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.06 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._