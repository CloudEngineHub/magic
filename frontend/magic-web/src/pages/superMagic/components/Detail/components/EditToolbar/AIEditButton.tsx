import { memo, useLayoutEffect, useState, useMemo } from "react"
import { useTranslation } from "react-i18next"
import { ChevronDown, MousePointerClick } from "lucide-react"
import { BorderBeam } from "border-beam"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { HTMLGuideTourElementId } from "@/pages/superMagic/hooks/useHTMLGuideTour"
import { useAIEdit } from "@/pages/superMagic/components/Detail/components/PPTRender/hooks/useAIEdit"
import { cn } from "@/utils/cn"
import ConditionalTooltip from "./ConditionalTooltip"
import { TOOLBAR_Z_INDEX } from "../../constants/z-index"

interface AIEditButtonProps {
	/** 是否显示按钮文字 */
	showButtonText?: boolean
	/** 限制下拉菜单展示的 AI 编辑项数量 */
	maxItems?: number
	/** 主按钮点击回调；未传入时点击主按钮仍打开菜单 */
	onPrimaryAction?: () => void
	/** 主按钮是否处于选取模式 */
	isPrimaryActive?: boolean
	/** 附件列表（用于AI编辑） */
	attachmentList?: any[]
	/** 当前文件ID */
	fileId?: string
	/** 触发元素选取检查器（仅 HTML 场景下传入）*/
	onStartInspector?: () => void
}

function AIEditButton({
	showButtonText = false,
	maxItems,
	onPrimaryAction,
	isPrimaryActive = false,
	attachmentList,
	fileId,
	onStartInspector,
}: AIEditButtonProps) {
	const { t } = useTranslation("super")
	const [dropdownOpen, setDropdownOpen] = useState(false)

	useLayoutEffect(() => {
		setDropdownOpen(false)
	}, [fileId])

	// Find current file from attachmentList
	const currentFile = useMemo(() => {
		return attachmentList?.find((item: any) => item.file_id === fileId)
	}, [attachmentList, fileId])

	// Use AI edit hook
	const { aiEditItems } = useAIEdit({
		currentFile,
		onActionComplete: () => setDropdownOpen(false),
		onStartInspector,
	})
	const visibleAiEditItems = maxItems === undefined ? aiEditItems : aiEditItems.slice(0, maxItems)
	// HTML uses the main hit area for element picking; other callers keep the legacy menu action.
	const handlePrimaryAction = () => {
		if (onPrimaryAction) {
			setDropdownOpen(false)
			onPrimaryAction()
			return
		}

		setDropdownOpen(true)
	}
	// Keep the split actions visually unified: BorderBeam owns the animated rim,
	// while the inner buttons remain independently clickable.
	const buttonGroupClassName =
		"relative isolate flex h-6 min-w-max overflow-visible rounded-[10px] border border-white/10 " +
		"bg-[#111] shadow-none transition-transform duration-150"
	const buttonClassName = cn(
		"relative z-[2] h-full gap-1.5 rounded-l-[9px] rounded-r-none border-0 px-3",
		"bg-[#111] text-xs font-normal text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.5)] transition-[background-color,filter,transform] duration-150 hover:bg-[#1b1b1b] active:scale-[0.96]",
		isPrimaryActive && "bg-[#1b1b1b] ring-1 ring-white/35",
	)
	const arrowButtonClassName = cn(
		"relative z-[2] h-full rounded-l-none rounded-r-[9px] border-0 border-l border-white/25 px-1.5",
		"bg-[#171717] text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08),inset_0_-1px_0_rgba(0,0,0,0.45)] transition-[background-color,filter,transform] duration-150 hover:bg-[#242424] active:scale-[0.96]",
	)

	return (
		<DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
			<div className="ai-edit-button-shell">
				<BorderBeam
					size="sm"
					colorVariant="ocean"
					theme="dark"
					staticColors
					strength={0.9}
					brightness={1.18}
					saturation={0.9}
					duration={2.8}
					borderRadius={10}
					className="ai-edit-border-beam ai-edit-border-beam--inner"
				>
					<div className={buttonGroupClassName}>
						<ConditionalTooltip
							showText={showButtonText}
							title={t("topicFiles.AIOptimization")}
						>
							<Button
								type="button"
								size="sm"
								onClick={handlePrimaryAction}
								className={buttonClassName}
								id={HTMLGuideTourElementId.AIOptimizationButton}
							>
								<MousePointerClick size={16} />
								{showButtonText && <span>{t("topicFiles.AIOptimization")}</span>}
							</Button>
						</ConditionalTooltip>
						<DropdownMenuTrigger asChild>
							<Button
								type="button"
								size="sm"
								aria-label={t("topicFiles.AIOptimization")}
								className={arrowButtonClassName}
							>
								<ChevronDown size={16} />
							</Button>
						</DropdownMenuTrigger>
					</div>
				</BorderBeam>
			</div>
			<DropdownMenuContent
				side="bottom"
				align="end"
				sideOffset={8}
				className="min-w-[280px]"
				style={{ zIndex: TOOLBAR_Z_INDEX.AI_EDIT_DROPDOWN }}
			>
				{visibleAiEditItems.map((item) => (
					<DropdownMenuItem key={item.key} onClick={item.onClick}>
						<div className="flex items-start gap-3">
							<div className="mt-0.5 flex-shrink-0">{item.icon}</div>
							<div className="flex flex-col gap-1">
								<div className="text-sm font-medium">{item.label}</div>
								<div className="text-xs text-muted-foreground">
									{item.description}
								</div>
							</div>
						</div>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export default memo(AIEditButton)
