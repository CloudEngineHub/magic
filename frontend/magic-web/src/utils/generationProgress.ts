/**
 * 生成进度估算。
 *
 * provider 不返回 step 级真实进度。前端只有一个权威锚点：magic-service 建单时给出的
 * 预期完成时间，画布元素和聊天工具卡拿到的是同一个值。起点一律取「本端首次观察到
 * 生成中」的当前时刻 —— 有些卡片根本没有开始时间，而预期完成时间本身是绝对时刻，
 * 配当前时间就能算出剩余时长。
 *
 * 两条硬约束：
 * 1. 同一个任务在同一次页面会话里得到同一个值 —— 预计耗时只由后端的预期完成时间决定，
 *    缺省时才用固定兜底值，不含随机数；起点按任务缓存，重渲染、列表回收重挂载都不会
 *    让进度回退。
 * 2. 聊天区工具卡和画布元素必须显示同一个数字 —— 两端都走 resolveGenerationProgress()
 *    这一个入口，同一套起点语义。
 */

/**
 * 后端未给出预期完成时间时的兜底预计耗时（秒）。
 *
 * 与 magic-service 的 `EXPECTED_DURATION_SECONDS` 取同一个值，这样「后端下发」和「本端
 * 兜底」两种口径算出的进度不会出现台阶。
 */
const FALLBACK_ESTIMATED_SECONDS = 90

/**
 * 后端预期完成时间可接受的最大时长（秒）。
 *
 * 超过它只可能是脏数据（例如毫秒与秒的单位搞混）或两端时钟偏差过大；此时退回兜底值，
 * 否则进度会以 1% 的速度爬上一个多小时。
 */
const MAX_PLAUSIBLE_DURATION_SECONDS = 600

export type GenerationProgressStatus =
	| "pending"
	| "processing"
	| "completed"
	| "failed"
	| "terminated"

export interface GenerationProgressInput {
	/** 进度起点（毫秒时间戳）：本端首次观察到生成中的时刻。 */
	startedAtMs: number
	status: GenerationProgressStatus
	/**
	 * 后端给出的预期完成时间（ISO 8601，带时区偏移）。
	 *
	 * 有值时它直接决定预计耗时：这个值来自 magic-service，是画布元素和聊天工具卡唯一能
	 * 共享的权威时长。缺省时（历史消息、画布提交前的预写）才退化成兜底值。
	 */
	expectedFinishedAt?: string
	/** 进入 failed / terminated 的时刻；缺省时按 nowMs 冻结。 */
	endedAtMs?: number
	nowMs?: number
}

/**
 * 解析后端写下的 ISO 8601 日期时间（如 `2026-09-28T20:42:46+08:00`）。
 *
 * `expected_finished_at` 是后端按这一规则输出的（本地时区 + 偏移量）。解析失败返回
 * undefined，让调用方退化到兜底值而不是显示 0%。
 */
export function parseBackendDateTime(value?: string | null): number | undefined {
	if (!value) {
		return undefined
	}
	const timestamp = Date.parse(value)
	return Number.isNaN(timestamp) ? undefined : timestamp
}

/**
 * 解析预计耗时（秒）：优先用后端预期完成时间，否则用兜底值。
 *
 * 预期完成时间早于起点（两端时钟偏差）或超过 MAX_PLAUSIBLE_DURATION_SECONDS 时都不采用，
 * 两种情况都退回兜底值。
 */
function resolveEstimatedSeconds({
	startedAtMs,
	expectedFinishedAt,
}: Pick<GenerationProgressInput, "startedAtMs" | "expectedFinishedAt">): number {
	const expectedFinishedAtMs = parseBackendDateTime(expectedFinishedAt)
	if (expectedFinishedAtMs !== undefined) {
		const derivedSeconds = (expectedFinishedAtMs - startedAtMs) / 1000
		if (derivedSeconds > 0 && derivedSeconds <= MAX_PLAUSIBLE_DURATION_SECONDS) {
			return derivedSeconds
		}
	}

	return FALLBACK_ESTIMATED_SECONDS
}

/**
 * 按元素 / 工具卡上的原始字段一步算出 1~99 的估算进度。
 *
 * 画布元素和聊天工具卡共用这一个入口。`startedAtMs` 一律取本端首次观察到生成中的
 * 时刻，两端语义一致；调用方负责把它按任务缓存下来，避免重渲染时回到起点。
 *
 * - `completed` 直接 100
 * - `failed` / `terminated` 冻结在进入终态的那一刻，不再增长
 * - 其余状态按「已过时间 / 预计总时长」线性换算，超过预计时长仍停在 99%，不会越过 100
 */
export function resolveGenerationProgress({
	startedAtMs,
	status,
	expectedFinishedAt,
	endedAtMs,
	nowMs = Date.now(),
}: GenerationProgressInput): number {
	if (status === "completed") {
		return 100
	}

	const estimatedSeconds = resolveEstimatedSeconds({ startedAtMs, expectedFinishedAt })
	if (estimatedSeconds <= 0) {
		return 1
	}

	const isFrozen = status === "failed" || status === "terminated"
	const effectiveNowMs = isFrozen ? (endedAtMs ?? nowMs) : nowMs
	const elapsedSeconds = Math.max(0, (effectiveNowMs - startedAtMs) / 1000)
	const ratio = Math.min(1, elapsedSeconds / estimatedSeconds)
	return Math.min(99, Math.max(1, Math.floor(ratio * 100)))
}
