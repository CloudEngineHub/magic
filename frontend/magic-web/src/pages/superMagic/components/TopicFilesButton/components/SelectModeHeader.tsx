import { memo } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/lib/utils"
import HeaderTrailingAction from "./HeaderTrailingAction"

interface SelectModeHeaderProps {
	selectedCount: number
	totalCount: number
	onSelectAll: () => void
	onDeselectAll: () => void
	onCancel: () => void
	headerTrailingAction?: ReactNode
	className?: string
}

function SelectModeHeader({
	selectedCount,
	totalCount,
	onSelectAll,
	onDeselectAll,
	onCancel,
	headerTrailingAction,
	className,
}: SelectModeHeaderProps) {
	const { t } = useTranslation("super")

	const isAllSelected = selectedCount === totalCount && totalCount > 0
	const isIndeterminate = selectedCount > 0 && selectedCount < totalCount

	const handleCheckboxChange = () => {
		if (selectedCount === totalCount) {
			onDeselectAll()
		} else {
			onSelectAll()
		}
	}

	return (
		<div
			className={cn(
				"relative flex h-8 w-full shrink-0 items-center px-2",
				headerTrailingAction ? "pr-10" : undefined,
				className,
			)}
		>
			<label
				className="flex min-w-0 shrink-0 cursor-pointer items-center gap-2 p-0"
				data-testid="select-mode-header-label"
			>
				<Checkbox
					checked={isIndeterminate ? "indeterminate" : isAllSelected}
					data-testid="file-select-all-checkbox"
					onCheckedChange={handleCheckboxChange}
				/>
				<span className="text-sm font-medium leading-none text-foreground">
					{t("topicFiles.selectAll")}
				</span>
			</label>
			<div className="ml-auto flex min-w-0 items-center justify-end gap-1 overflow-hidden">
				<Button
					variant="outline"
					size="sm"
					onClick={onCancel}
					data-testid="file-select-cancel-button"
					className="h-7 shrink-0 px-3 py-2"
				>
					<span className="text-sm font-medium leading-5">
						{t("topicFiles.cancelSelect")}
					</span>
				</Button>
			</div>
			{headerTrailingAction ? (
				<HeaderTrailingAction>{headerTrailingAction}</HeaderTrailingAction>
			) : null}
		</div>
	)
}

export default memo(SelectModeHeader)
