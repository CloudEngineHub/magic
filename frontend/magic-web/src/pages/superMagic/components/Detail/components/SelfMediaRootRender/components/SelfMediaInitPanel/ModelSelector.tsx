/**
 * ModelSelector - 轻量级模型选择下拉组件
 *
 * 用于 AI 生成按钮旁，允许用户选择不同的 LLM 模型。
 */

import { useState, useRef, useEffect, useMemo } from "react"
import { cn } from "@/lib/utils"
import superMagicModeService from "@/services/superMagic/SuperMagicModeService"
import { TopicMode } from "@/pages/superMagic/pages/Workspace/TopicMode"
import { platformKey } from "@/utils/storage"

const STORAGE_KEY = platformKey("super_magic/self_media_model")

interface ModelOption {
	id: string
	model_id: string
	model_name: string
	model_icon: string
}

interface ModelSelectorProps {
	value?: string
	onChange: (modelId: string) => void
	className?: string
}

export default function ModelSelector({ value, onChange, className }: ModelSelectorProps) {
	const [open, setOpen] = useState(false)
	const ref = useRef<HTMLDivElement>(null)

	const models = useMemo<ModelOption[]>(() => {
		const list = superMagicModeService.getModelListByMode(TopicMode.Default) as ModelOption[]
		return list.filter((m) => m.model_name)
	}, [])

	const selected = useMemo(
		() => models.find((m) => m.model_id === value) ?? models[0],
		[models, value],
	)

	// 初始化时：若 value 为空，从 localStorage 恢复或使用第一个可用模型，同步给父组件
	useEffect(() => {
		if (models.length === 0) return
		if (value) return // 已有有效值，不需要初始化
		const stored = localStorage.getItem(STORAGE_KEY)
		const resolved = models.find((m) => m.model_id === stored) ?? models[0]
		if (resolved) {
			onChange(resolved.model_id)
		}
	}, [models]) // eslint-disable-line react-hooks/exhaustive-deps

	// 点击外部关闭
	useEffect(() => {
		if (!open) return
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) {
				setOpen(false)
			}
		}
		document.addEventListener("mousedown", handler)
		return () => document.removeEventListener("mousedown", handler)
	}, [open])

	if (models.length === 0) return null

	return (
		<div ref={ref} className={cn("relative inline-flex", className)}>
			<button
				type="button"
				className="flex items-center gap-1 rounded-md border border-border/50 bg-background/80 px-2 py-1 text-xs text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors"
				onClick={(e) => {
					e.stopPropagation()
					setOpen(!open)
				}}
				title="切换模型"
			>
				{selected?.model_icon && (
					<img src={selected.model_icon} alt="" className="h-3.5 w-3.5 rounded-sm" />
				)}
				<span className="max-w-[80px] truncate">{selected?.model_name ?? "默认"}</span>
				<svg
					className={cn("h-3 w-3 transition-transform", open && "rotate-180")}
					viewBox="0 0 12 12"
					fill="none"
				>
					<path
						d="M3 4.5L6 7.5L9 4.5"
						stroke="currentColor"
						strokeWidth="1.5"
						strokeLinecap="round"
					/>
				</svg>
			</button>

			{open && (
				<div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] max-h-[240px] overflow-y-auto rounded-lg border border-border bg-popover p-1 shadow-lg animate-in fade-in-0 zoom-in-95">
					{models.map((m) => (
						<button
							key={m.model_id}
							type="button"
							className={cn(
								"flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-xs transition-colors",
								m.model_id === (selected?.model_id ?? "")
									? "bg-primary/10 text-primary"
									: "hover:bg-muted text-foreground",
							)}
							onClick={(e) => {
								e.stopPropagation()
								onChange(m.model_id)
								localStorage.setItem(STORAGE_KEY, m.model_id)
								setOpen(false)
							}}
						>
							{m.model_icon && (
								<img src={m.model_icon} alt="" className="h-4 w-4 rounded-sm" />
							)}
							<span className="truncate">{m.model_name}</span>
						</button>
					))}
				</div>
			)}
		</div>
	)
}
