/**
 * ModelSelector - 轻量级模型选择下拉组件
 *
 * 用于 AI 生成按钮旁，允许用户选择不同的 LLM 模型。
 * 基于 Radix DropdownMenu（portal 渲染），不受父容器 overflow-hidden 限制。
 * 使用 MobX observer 确保数据异步加载时的响应式更新。
 */

import { useEffect } from "react"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/shadcn-ui/dropdown-menu"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { platformKey } from "@/utils/storage"

const STORAGE_KEYS = {
	text: platformKey("super_magic/self_media_model"),
	image: platformKey("super_magic/self_media_image_model"),
	video: platformKey("super_magic/self_media_video_model"),
} as const

interface ModelOption {
	id: string
	model_id: string
	model_name: string
	model_icon: string
}

export interface ModelSelectorProps {
	value?: string
	onChange: (modelId: string) => void
	className?: string
	/** "full" (default): icon + name + chevron; "icon": just the icon, click to open dropdown */
	mode?: "full" | "icon"
	/** Which model type to display: text (default), image, or video */
	modelType?: "text" | "image" | "video"
	/** Optional label shown before the model name */
	label?: string
}

export default observer(function ModelSelector({
	value,
	onChange,
	className,
	mode = "full",
	modelType = "text",
	label,
}: ModelSelectorProps) {
	// 响应式获取模型列表，避免因 useMemo(..., []) 导致异步数据不更新
	const models = (
		(modelType === "image"
			? superMagicModeService.getImageModelListByMode(TopicMode.Default)
			: modelType === "video"
				? superMagicModeService.getVideoModelListByMode(TopicMode.Default)
				: superMagicModeService.getModelListByMode(TopicMode.Default)) as ModelOption[]
	).filter((m) => m.model_name)

	const storageKey = STORAGE_KEYS[modelType]
	const selected = models.find((m) => m.model_id === value) ?? models[0]

	// 初始化时：若 value 为空，从 localStorage 恢复或使用第一个可用模型，同步给父组件
	useEffect(() => {
		if (models.length === 0) return
		if (value) return // 已有有效值，不需要初始化
		const stored = localStorage.getItem(storageKey)
		const resolved = models.find((m) => m.model_id === stored) ?? models[0]
		if (resolved) {
			onChange(resolved.model_id)
		}
	}, [models, value, onChange, storageKey])

	if (models.length === 0) return null

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className={cn(
						mode === "icon"
							? "flex items-center gap-1 rounded-l-full px-2.5 py-1.5 transition-all hover:opacity-80"
							: "flex items-center gap-1.5 rounded-xl border border-zinc-200 bg-white/80 px-3 py-1.5 text-xs text-zinc-600 transition-colors hover:border-primary/50 hover:text-zinc-900 dark:border-zinc-800 dark:bg-zinc-950/80 dark:text-zinc-300 dark:hover:text-zinc-100",
						className,
					)}
					title="切换模型"
				>
					{label && <span className="shrink-0 text-muted-foreground/70">{label}</span>}
					{selected?.model_icon && (
						<img
							src={selected.model_icon}
							alt=""
							className={cn(
								mode === "icon" ? "h-4 w-4" : "h-3.5 w-3.5",
								"shrink-0 rounded-md shadow-sm",
							)}
						/>
					)}
					{mode === "full" && (
						<span className="max-w-full truncate font-medium">
							{selected?.model_name ?? "默认"}
						</span>
					)}
					<svg
						className={cn(
							"shrink-0 opacity-60 transition-transform",
							mode === "icon" ? "h-3 w-3" : "h-3 w-3",
						)}
						viewBox="0 0 12 12"
						fill="none"
					>
						<path
							d="M3 4.5L6 7.5L9 4.5"
							stroke="currentColor"
							strokeWidth="1.8"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
					</svg>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="max-h-[240px] min-w-[190px] overflow-y-auto rounded-xl border border-zinc-200/80 bg-white/95 p-1 shadow-lg backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
			>
				{models.map((m) => (
					<DropdownMenuItem
						key={m.model_id}
						className={cn(
							"flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors",
							m.model_id === (selected?.model_id ?? "")
								? "bg-primary/15 text-zinc-950 dark:text-primary"
								: "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900",
						)}
						onClick={() => {
							onChange(m.model_id)
							localStorage.setItem(storageKey, m.model_id)
						}}
					>
						{m.model_icon && (
							<img
								src={m.model_icon}
								alt=""
								className="h-4 w-4 shrink-0 rounded-md shadow-sm"
							/>
						)}
						<span className="truncate">{m.model_name}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
})
