# Ops Health Insight

## Purpose

The ops overview card shows two different concepts:

- AI ops health: the large score in the health badge. This is an AI judgment that considers workflow completion and real post-performance data.
- Workflow completion: the small `链路 xx%` label beside the score. This is the deterministic source/metrics/comments/review completion ratio.

Keeping them separate avoids showing `健康度 100` when every workflow artifact exists but real reads and engagement are still `0`.

## File Boundary

The persisted AI health payload lives at:

```text
self-media/ops/ops-health-insight.json
```

`SelfMediaFileStorageService` is the only persistence boundary:

- `saveOpsHealthInsight(payload)`
- `loadOpsHealthInsight()`

The homepage wires these methods into `useSelfMediaOpsHealthInsight`.

## Payload

```ts
interface SelfMediaOpsHealthInsightPayload {
	version: 1
	generatedAt: string
	stateSignature: string
	score: number
	level: "good" | "warning" | "risk"
	summary: string
	reasons: string[]
	nextAction?: string
	confidence: "low" | "medium" | "high"
}
```

The score is clamped to `0-100`. `reasons` is capped at 3 items.

## Cache Invalidation

The cache key is `stateSignature`, built from the current ops overview:

- operation stage
- post count
- total reads and total engagement
- engagement rate
- source/metrics/comments/review completion
- best and weakest post keys

If the cached `stateSignature` differs from the current signature, the hook regenerates the AI health insight and saves it back to `ops-health-insight.json`.

## Fallback Rules

When the AI call fails or returns invalid JSON, `buildFallbackSelfMediaOpsHealthInsight` creates a local result.

Important rule:

- If workflow completion is 100% but `totalReads` and `totalEngagement` are both `0`, fallback score is not 100. It is a warning state, with copy telling the user to confirm the data source or resync metrics.

Otherwise the fallback starts from deterministic workflow completion and adds short evidence about reads, engagement, and average interaction rate.

## UI Rules

`SelfMediaOpsOverviewCard` renders:

- large number: `healthInsight.score` when available, otherwise workflow completion score
- small label: `链路 {workflowCompletionScore}%`
- `title`: AI summary plus workflow completion detail
- `data-health-source`: `ai` or `workflow`
- `data-health-level`: AI level when available

Do not replace the small workflow label with the AI score. The split is intentional.

## Verification

Targeted checks:

```bash
pnpm exec vitest run --config ./vitest.config.ts src/pages/superMagic/components/Detail/components/SelfMediaRootRender/__tests__/selfMediaOpsHealthInsight.test.ts
pnpm exec vitest run --config ./vitest.config.ts src/pages/superMagic/components/Detail/components/SelfMediaRootRender/__tests__/SelfMediaFileStorageService.test.ts -t "ops health"
pnpm exec vitest run --config ./vitest.config.ts src/pages/superMagic/components/Detail/components/SelfMediaRootRender/__tests__/SelfMediaHomePage.style.test.tsx -t "ops health"
```
