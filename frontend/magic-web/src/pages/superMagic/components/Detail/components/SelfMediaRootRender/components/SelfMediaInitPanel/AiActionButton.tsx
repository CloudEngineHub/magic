/**
 * AiActionButton - 集成模型选择 + AI 操作的按钮组件
 *
 * 左侧显示模型图标（点击切换模型），右侧显示操作文字（点击执行 AI 操作）。
 * 生成中时隐藏左侧模型图标，仅显示操作区（停止/加载状态）。
 * 重构为极其优雅的现代胶囊形态（rounded-full），适配极致极简磨玻璃风格。
 * 使用 MobX observer 确保模型切换和加载状态及时响应更新。
 */

import type { ReactNode } from "react"
import { observer } from "mobx-react-lite"
import { cn } from "@/lib/utils"
import ModelSelector from "./ModelSelector"

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
	/** 样式变体：primary = 填充暗色/黑背景；outline = 描边 */
	variant?: "primary" | "outline"
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
	const isSm = size === "sm"

	return (
		<div
			className={cn(
				"relative flex items-center font-semibold transition-all duration-200 overflow-hidden",
				isSm ? "rounded-md text-[11px] h-7" : "rounded-full text-xs h-9",
				disabled && !loading && "opacity-40 pointer-events-none",
				isPrimary
					? loading
						? "border border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-500"
						: "border border-zinc-950 bg-zinc-950 text-zinc-50 shadow-sm shadow-zinc-950/10 hover:bg-zinc-900 active:scale-[0.98] dark:border-zinc-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
					: loading
						? "border border-zinc-200 bg-zinc-50/50 text-zinc-400 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-500"
						: "border border-zinc-200 text-zinc-700 hover:border-zinc-300 hover:text-zinc-900 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-300 dark:hover:border-zinc-700 dark:hover:text-zinc-100 dark:hover:bg-zinc-900",
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
						"border-r h-full flex items-center justify-center pl-3.5 pr-2 transition-colors",
						isPrimary
							? "border-zinc-850 dark:border-zinc-300 hover:bg-white/5 dark:hover:bg-black/5"
							: "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100/50 dark:hover:bg-zinc-800/50",
					)}
				/>
			)}
			{/* Action button area */}
			<button
				type="button"
				className={cn(
					"flex items-center justify-center gap-1.5 transition-all font-semibold h-full",
					isSm ? "px-2" : "px-5",
					!loading &&
						(isPrimary
							? "hover:bg-white/5 dark:hover:bg-black/5 active:opacity-90"
							: "hover:text-zinc-900 dark:hover:text-zinc-50 active:opacity-90"),
				)}
				onClick={onClick}
				disabled={disabled && !loading}
			>
				{loading && (
					<span className="relative flex h-2 w-2 mr-1">
						<span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
						<span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
					</span>
				)}
				{loading ? loadingLabel : label}
			</button>
		</div>
	)
})
