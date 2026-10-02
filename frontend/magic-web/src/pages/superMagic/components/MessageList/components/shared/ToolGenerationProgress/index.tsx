import { useEffect, useState } from "react"
import { resolveGenerationProgress } from "@/utils/generationProgress"

/**
 * 触发图片生成、且耗时明显长于一次渲染的工具。
 *
 * 这里只列「一定在生成图片」的工具名；`add_canvas_elements` /
 * `add_canvas_contents` 既能新增素材也能触发生成，名字本身无法区分，
 * 不做判断以免在纯素材操作上显示假的进度。
 */
const IMAGE_GENERATION_TOOL_NAMES = new Set([
	"generate_canvas_images",
	"generate_video_production_images",
	"generate_images_to_canvas",
	"generate_image",
	"generate_images",
])

/** 工具已经结束的状态；其余状态都按「生成中」处理。 */
const TERMINAL_TOOL_STATUSES = new Set(["finished", "error", "suspended", "response_missing"])

/** 估算精度远低于 1 秒，每秒推进一次即可。 */
const TICK_INTERVAL_MS = 1000

/**
 * 进度起点：工具调用首次进入生成中的当前时刻。
 *
 * 用模块级 Map 而不是组件 ref：消息列表会回收重挂载节点，ref 会丢失锚点导致进度回退。
 * 任务进入终态时删除，因此条目数只与并发中的生图任务数量相关。
 *
 * 键取 `toolCallId`，卡片没有它时退到后端任务 id（`generation_progress` 详情一定带），
 * 这样没有 tool_call_id 的卡片也能记下自己的起点、正常算出进度。
 */
const firstSeenAtByAnchorKey = new Map<string, number>()

/** 工具卡上的详情；只有 `generation_progress` 这一种带生成预期完成时间。 */
export interface ToolGenerationProgressDetail {
	type?: string
	data?: Record<string, unknown>
}

/**
 * 读 `generation_progress` 详情的数据体；不是该类型时返回 undefined。
 *
 * 后端在 magic-service 建单成功后才补发它，所以它可能一直缺席（历史消息、建单失败）。
 */
function readGenerationProgressData(
	detail?: ToolGenerationProgressDetail,
): Record<string, unknown> | undefined {
	if (detail?.type !== "generation_progress") {
		return undefined
	}
	const data = detail.data
	return data && typeof data === "object" ? data : undefined
}

/** 只接受非空字符串，其余（含数字、null）一律当缺席。 */
function readNonEmptyString(value: unknown): string | undefined {
	return typeof value === "string" && value ? value : undefined
}

export interface ToolGenerationProgressProps {
	toolCallId?: string
	toolName?: string
	status?: string
	/** 工具详情；后端补发的预期完成时间就挂在它的 data 上。 */
	detail?: ToolGenerationProgressDetail
}

/**
 * 工具卡里的图片生成百分比。
 *
 * 进度由 `generationProgress.ts` 估算：有后端下发的预期完成时间就用它，没有才用固定兜底
 * 时长；起点是本端首次观察到生成中的时刻。画布元素走同一个入口、同一套起点语义。
 */
function ToolGenerationProgress({
	toolCallId,
	toolName,
	status,
	detail,
}: ToolGenerationProgressProps) {
	const isImageGenerationTool = Boolean(toolName && IMAGE_GENERATION_TOOL_NAMES.has(toolName))
	const isGenerating = !TERMINAL_TOOL_STATUSES.has(status ?? "")
	// 只有「确实在生成图片」的工具才需要锚点和定时器；否则消息列表里每个进行中的
	// 工具卡都会各起一个每秒定时器，而它们并不显示进度。
	const isActive = isImageGenerationTool && isGenerating
	const generationProgressData = readGenerationProgressData(detail)
	const expectedFinishedAt = readNonEmptyString(generationProgressData?.expected_finished_at)
	// 锚点的键：优先工具调用 id，卡片没有时用后端任务 id。
	const anchorKey = toolCallId ?? readNonEmptyString(generationProgressData?.task_id)
	const [observedAtMs, setObservedAtMs] = useState<number | null>(null)
	const [nowMs, setNowMs] = useState(() => Date.now())

	useEffect(() => {
		if (!anchorKey) {
			return
		}
		if (!isActive) {
			firstSeenAtByAnchorKey.delete(anchorKey)
			return
		}
		// 起点取当前时间，并按任务缓存：重渲染、列表回收重挂载都拿到同一个值。
		const anchor = firstSeenAtByAnchorKey.get(anchorKey) ?? Date.now()
		firstSeenAtByAnchorKey.set(anchorKey, anchor)
		setObservedAtMs(anchor)
	}, [anchorKey, isActive])

	useEffect(() => {
		if (!isActive) {
			return
		}
		const timer = setInterval(() => setNowMs(Date.now()), TICK_INTERVAL_MS)
		return () => clearInterval(timer)
	}, [isActive])

	if (!isActive || observedAtMs === null) {
		return null
	}

	const percent = resolveGenerationProgress({
		status: "processing",
		startedAtMs: observedAtMs,
		expectedFinishedAt,
		nowMs,
	})

	return (
		<div className="mt-1" data-testid="tool-generation-progress">
			<span className="text-[10px] tabular-nums leading-3 text-muted-foreground">
				{percent}%
			</span>
		</div>
	)
}

export default ToolGenerationProgress
