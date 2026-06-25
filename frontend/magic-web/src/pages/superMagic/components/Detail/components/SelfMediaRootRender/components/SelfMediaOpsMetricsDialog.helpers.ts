import type {
	SelfMediaPostOpsCommentsPayload,
	SelfMediaPostOpsMetricValue,
	SelfMediaPostOpsMetricsPayload,
	SelfMediaPostOpsReviewPayload,
	SelfMediaPostOpsSourcePayload,
} from "../services/SelfMediaFileStorageService"

export interface MetricsFormValues {
	sourceUrl: string
	sourceOriginalUrl: string
	sourceFetchStatus: SelfMediaPostOpsSourcePayload["fetchStatus"] | "unknown"
	sourceLastFetchedAt: string
	sourceFailureReason: string
	reads: string
	likes: string
	saves: string
	comments: string
	shares: string
	follows: string
	conversions: string
	notes: string
	feedbackSummary: string
	commentsRaw: string
	reviewContent: string
}

export const METRIC_FIELDS: Array<{
	key: keyof Pick<
		MetricsFormValues,
		"reads" | "likes" | "saves" | "comments" | "shares" | "follows" | "conversions"
	>
	labelKey: string
}> = [
	{ key: "reads", labelKey: "detail.selfMedia.opsMetrics.fields.reads" },
	{ key: "likes", labelKey: "detail.selfMedia.opsMetrics.fields.likes" },
	{ key: "saves", labelKey: "detail.selfMedia.opsMetrics.fields.saves" },
	{ key: "comments", labelKey: "detail.selfMedia.opsMetrics.fields.comments" },
	{ key: "shares", labelKey: "detail.selfMedia.opsMetrics.fields.shares" },
	{ key: "follows", labelKey: "detail.selfMedia.opsMetrics.fields.follows" },
	{ key: "conversions", labelKey: "detail.selfMedia.opsMetrics.fields.conversions" },
]

export function buildInitialValues(): MetricsFormValues {
	return {
		sourceUrl: "",
		sourceOriginalUrl: "",
		sourceFetchStatus: "unknown",
		sourceLastFetchedAt: "",
		sourceFailureReason: "",
		reads: "",
		likes: "",
		saves: "",
		comments: "",
		shares: "",
		follows: "",
		conversions: "",
		notes: "",
		feedbackSummary: "",
		commentsRaw: "",
		reviewContent: "",
	}
}

export function buildValuesFromPayload({
	sourcePayload,
	metricsPayload,
	commentsPayload,
	reviewPayload,
}: {
	sourcePayload: SelfMediaPostOpsSourcePayload | null
	metricsPayload: SelfMediaPostOpsMetricsPayload | null
	commentsPayload: SelfMediaPostOpsCommentsPayload | null
	reviewPayload: SelfMediaPostOpsReviewPayload | null
}): MetricsFormValues {
	const fallback = buildInitialValues()
	return {
		sourceUrl: sourcePayload?.publishedUrl ?? fallback.sourceUrl,
		sourceOriginalUrl: sourcePayload?.publishedUrl ?? fallback.sourceOriginalUrl,
		sourceFetchStatus: sourcePayload?.fetchStatus ?? fallback.sourceFetchStatus,
		sourceLastFetchedAt: sourcePayload?.lastFetchedAt ?? "",
		sourceFailureReason: sourcePayload?.failureReason ?? "",
		reads: stringifyMetricValue(metricsPayload?.metrics.reads) || fallback.reads,
		likes: stringifyMetricValue(metricsPayload?.metrics.likes) || fallback.likes,
		saves: stringifyMetricValue(metricsPayload?.metrics.saves) || fallback.saves,
		comments: stringifyMetricValue(metricsPayload?.metrics.comments) || fallback.comments,
		shares: stringifyMetricValue(metricsPayload?.metrics.shares) || fallback.shares,
		follows: stringifyMetricValue(metricsPayload?.metrics.follows) || fallback.follows,
		conversions:
			stringifyMetricValue(metricsPayload?.metrics.conversions) || fallback.conversions,
		notes: metricsPayload?.notes ?? "",
		feedbackSummary: commentsPayload?.summary ?? "",
		commentsRaw: commentsPayload?.comments.length
			? stringifyCommentSamples(commentsPayload.comments)
			: fallback.commentsRaw,
		reviewContent: reviewPayload?.content ?? "",
	}
}

export function toReviewHtmlDocument(content: string, title: string) {
	if (/<(?:!doctype|html|body|section|article|h1|h2|p|div|ul|ol)\b/i.test(content)) {
		return content
	}
	const lines = content
		.split(/\n+/)
		.map((line) => line.trim())
		.filter(Boolean)
	const [firstLine, ...actionLines] = lines
	const actions = actionLines.length > 0 ? actionLines : lines.slice(0, 3)
	return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
:root{--ink:#111827;--muted:#64748b;--teal:#0f766e;--cyan:#0284c7;--amber:#b45309;--surface:#f8fafc;--line:#e5e7eb}
*{box-sizing:border-box}
body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:linear-gradient(135deg,#f8fafc 0%,#ffffff 45%,#eef6ff 100%)}
.ops-review-report{max-width:920px;margin:0 auto;padding:34px 28px 42px;line-height:1.65}
.report-hero{display:grid;gap:18px;grid-template-columns:minmax(0,1fr) 180px;align-items:end;border:1px solid var(--line);border-radius:18px;background:#fff;padding:26px;box-shadow:0 24px 70px rgba(15,23,42,.08)}
.eyebrow{margin:0 0 8px;color:var(--teal);font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase}
h1{margin:0;font-size:28px;line-height:1.25;letter-spacing:0}
.hero-stat{border-radius:16px;background:var(--surface);padding:16px;border:1px solid var(--line)}
.hero-stat b{display:block;font-size:24px;color:var(--teal)}
.hero-stat span{font-size:12px;color:var(--muted)}
.section-grid{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
section{border:1px solid var(--line);border-radius:16px;background:rgba(255,255,255,.92);padding:18px}
h2{margin:0 0 10px;font-size:16px}
p{margin:0;color:var(--muted)}
ol{margin:0;padding-left:20px;color:var(--ink)}
li{margin:7px 0}
.chip-row{display:flex;flex-wrap:wrap;gap:8px;margin-top:14px}
.chip{border:1px solid var(--line);border-radius:999px;padding:5px 10px;background:var(--surface);font-size:12px;color:var(--muted)}
@media(max-width:760px){.report-hero,.section-grid{grid-template-columns:1fr}.ops-review-report{padding:18px}}
</style>
</head>
<body>
<main class="ops-review-report" data-generated-by="self-media-ops">
<div class="report-hero">
<div>
<p class="eyebrow">Operations Review</p>
<h1>${escapeHtml(title)}</h1>
</div>
<div class="hero-stat"><b>HTML</b><span>结构化复盘预览</span></div>
</div>
<div class="section-grid">
<section>
<h2>核心判断</h2>
<p>${escapeHtml(firstLine || "本次复盘等待补充核心判断。")}</p>
</section>
<section>
<h2>下一步动作</h2>
<ol>
${actions.map((line) => `<li>${escapeHtml(line)}</li>`).join("\n")}
</ol>
</section>
</div>
<section style="margin-top:14px">
<h2>完整记录</h2>
${lines.map((line) => `<p>${escapeHtml(line)}</p>`).join("\n")}
<div class="chip-row"><span class="chip">真实数据优先</span><span class="chip">保留历史快照</span><span class="chip">下轮选题输入</span></div>
</section>
</main>
</body>
</html>`
}

export function getSourceStatusLabelKey(status: MetricsFormValues["sourceFetchStatus"]) {
	switch (status) {
		case "pending":
			return "detail.selfMedia.opsMetrics.sourceStatus.pending"
		case "fetched":
			return "detail.selfMedia.opsMetrics.sourceStatus.fetched"
		case "failed":
			return "detail.selfMedia.opsMetrics.sourceStatus.failed"
		default:
			return "detail.selfMedia.opsMetrics.sourceStatus.unknown"
	}
}

export function parseCommentSamples(raw: string): SelfMediaPostOpsCommentsPayload["comments"] {
	return raw
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line, index) => {
			const [author, text, intent] = line.split(/[|｜]/).map((part) => part.trim())
			return {
				id: `comment-${index + 1}`,
				author: author || undefined,
				text: text || author || line,
				intent: intent || undefined,
			}
		})
}

function stringifyMetricValue(value: SelfMediaPostOpsMetricValue | undefined): string {
	if (value === null || value === undefined) return ""
	if (typeof value === "object" && "value" in value) {
		return stringifyMetricValue(value.value)
	}
	return String(value)
}

function stringifyCommentSamples(comments: SelfMediaPostOpsCommentsPayload["comments"]) {
	return comments
		.map((comment) =>
			[comment.author || "用户", comment.text, comment.intent].filter(Boolean).join("｜"),
		)
		.join("\n")
}

function escapeHtml(value: string) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;")
}
