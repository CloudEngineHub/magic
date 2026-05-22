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

// Keep backward compat alias
const STORAGE_KEY = STORAGE_KEYS.text

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
		modelType === "image"
			? superMagicModeService.getImageModelListByMode(TopicMode.Default)
			: modelType === "video"
				? superMagicModeService.getVideoModelListByMode(TopicMode.Default)
				: superMagicModeService.getModelListByMode(TopicMode.Default)
	).filter((m: any) => m.model_name) as ModelOption[]

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
							? "flex items-center gap-1 px-2.5 py-1.5 hover:opacity-80 transition-all rounded-l-full"
							: "flex items-center gap-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/80 dark:bg-zinc-950/80 px-3 py-1.5 text-xs text-zinc-600 dark:text-zinc-300 hover:border-indigo-500/40 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors",
						className,
					)}
					title="切换模型"
				>
					{label && (
						<span className="text-muted-foreground/70 shrink-0">{label}</span>
					)}
					{selected?.model_icon && (
						<img
							src={selected.model_icon}
							alt=""
							className={cn(
								mode === "icon" ? "h-4 w-4" : "h-3.5 w-3.5",
								"rounded-md shrink-0 shadow-sm",
							)}
						/>
					)}
					{mode === "full" && (
						<span className="max-w-[80px] truncate font-medium">
							{selected?.model_name ?? "默认"}
						</span>
					)}
					<svg
						className={cn(
							"transition-transform opacity-60 shrink-0",
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
				className="min-w-[190px] max-h-[240px] overflow-y-auto p-1 rounded-xl shadow-lg border border-zinc-200/80 dark:border-zinc-800 bg-white/95 dark:bg-zinc-950/95 backdrop-blur-md"
			>
				{models.map((m) => (
					<DropdownMenuItem
						key={m.model_id}
						className={cn(
							"flex items-center gap-2 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer font-medium",
							m.model_id === (selected?.model_id ?? "")
								? "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"
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
								className="h-4 w-4 rounded-md shrink-0 shadow-sm"
							/>
						)}
						<span className="truncate">{m.model_name}</span>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
})
