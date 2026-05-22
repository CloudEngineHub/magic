/**
 * AiActionButton - 集成模型选择 + AI 操作的按钮组件
 *
 * 左侧显示模型图标（点击切换模型），右侧显示操作文字（点击执行 AI 操作）。
 * 生成中时隐藏左侧模型图标，仅显示操作区（停止/加载状态）。
 * Uses flat workbench-style buttons for the init panel.
 * 使用 MobX observer 确保模型切换和加载状态及时响应更新。
 */

import type { ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import ModelSelector from "../picker/ModelSelector"

interface AiActionButtonProps {
	/** 当前选中的模型 ID */
	modelValue?: string
	/** 模型变更回调 */
	onModelChange: (modelId: string) => void
	/** 是否正在生成中 */
	loading?: boolean
	/** 是否禁用 */
	disabled?: boolean
	/** 点击操作区回调 */
	onClick: () => void
	/** 操作文字（非加载状态） */
	label: ReactNode
	/** 加载中文字 */
	loadingLabel?: ReactNode
	/** 样式变体：primary = 填充暗色/黑背景；outline = 浅色块；accent = 橙黄高亮背景 */
	variant?: "primary" | "outline" | "accent"
	/** 尺寸：sm = 紧凑(11px)；md = 常规(12px) */
	size?: "sm" | "md"
	/** 额外 className */
	className?: string
}

export default observer(function AiActionButton({
	modelValue,
	onModelChange,
	loading = false,
	disabled = false,
	onClick,
	label,
	loadingLabel,
	variant = "outline",
	size = "md",
	className,
}: AiActionButtonProps) {
	const isPrimary = variant === "primary"
	const isAccent = variant === "accent"
	const isSm = size === "sm"

	return (
		<div
			className={cn(
				"relative flex items-center overflow-hidden font-semibold transition-all duration-200",
				isSm ? "h-7 text-[11px]" : "h-9 text-xs",
				disabled && !loading && "pointer-events-none opacity-40",
				isAccent
					? loading
						? "bg-zinc-800 text-zinc-500"
						: "bg-primary text-zinc-950 hover:bg-primary/95 active:scale-[0.98]"
					: isPrimary
						? loading
							? "bg-zinc-100 text-zinc-400 dark:bg-zinc-900 dark:text-zinc-500"
							: "bg-zinc-950 text-zinc-50 hover:bg-zinc-900 active:scale-[0.98] dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
						: loading
							? "bg-zinc-50/50 text-zinc-400 dark:bg-zinc-900/50 dark:text-zinc-500"
							: "bg-zinc-100 text-zinc-700 hover:bg-zinc-200 hover:text-zinc-900 active:scale-[0.98] dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
				className,
			)}
		>
			{/* Model selector - hidden during loading */}
			{!loading && (
				<ModelSelector
					value={modelValue}
					onChange={onModelChange}
					mode="icon"
					className={cn(
						"flex h-full items-center justify-center border-r pl-3.5 pr-2 transition-colors",
						isAccent
							? "border-zinc-950/15 hover:bg-black/5"
							: isPrimary
								? "border-white/10 hover:bg-white/5 dark:border-zinc-300 dark:hover:bg-black/5"
								: "border-zinc-200 hover:bg-zinc-200 dark:border-zinc-800 dark:hover:bg-zinc-800/50",
					)}
				/>
			)}
			{/* Action button area */}
			<button
				type="button"
				className={cn(
					"flex h-full items-center justify-center gap-1.5 font-semibold transition-all flex-shrink-0",
					isSm ? "px-2" : "px-5",
					!loading &&
						(isAccent
							? "hover:bg-black/5 active:opacity-95"
							: isPrimary
								? "hover:bg-white/5 active:opacity-90 dark:hover:bg-black/5"
								: "hover:text-zinc-900 active:opacity-90 dark:hover:text-zinc-50"),
				)}
				onClick={onClick}
				disabled={disabled && !loading}
			>
				{loading && (
					<span className="relative mr-1 flex h-2 w-2">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
					</span>
				)}
				{loading ? loadingLabel : label}
			</button>
		</div>
	)
})
