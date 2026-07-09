// Whimsical "working" verbs (Claude-Code idiom), present + past tense. The
// present tense drives the live spinner ("Percolating…"); the past tense
// drives the per-turn completed footer ("✻ Percolated for 3m 39s"). Picked
// once per turn (keyed off the turn's start time) so it's stable across
// re-renders but varies run-to-run.
export const WORKING_VERBS: Array<[present: string, past: string]> = [
  ["Brewing", "Brewed"],
  ["Cooking", "Cooked"],
  ["Churning", "Churned"],
  ["Baking", "Baked"],
  ["Sautéing", "Sautéed"],
  ["Simmering", "Simmered"],
  ["Percolating", "Percolated"],
  ["Whisking", "Whisked"],
  ["Marinating", "Marinated"],
  ["Crunching", "Crunched"],
  ["Noodling", "Noodled"],
  ["Conjuring", "Conjured"],
  ["Untangling", "Untangled"],
  ["Wrangling", "Wrangled"],
  ["Pondering", "Pondered"],
  ["Tinkering", "Tinkered"],
];

export function verbForTurn(startTime: number): { present: string; past: string } {
  const [present, past] = WORKING_VERBS[Math.floor(startTime / 1000) % WORKING_VERBS.length];
  return { present, past };
}

export function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  return `${mins}m ${secs % 60}s`;
}
