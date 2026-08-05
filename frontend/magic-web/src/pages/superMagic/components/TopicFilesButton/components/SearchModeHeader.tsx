import { memo, useRef, useState, useEffect } from "react"
import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"
import { Search, X } from "lucide-react"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/shadcn-ui/input-group"
import { Button } from "@/components/shadcn-ui/button"
import { cn } from "@/lib/utils"
import HeaderTrailingAction from "./HeaderTrailingAction"

interface SearchModeHeaderProps {
	searchValue: string
	onSearchChange: (value: string) => void
	onSearchCommit?: (value: string) => void
	onClose: () => void
	headerTrailingAction?: ReactNode
	className?: string
}

function SearchModeHeader({
	searchValue,
	onSearchChange,
	onSearchCommit,
	onClose,
	headerTrailingAction,
	className,
}: SearchModeHeaderProps) {
	const { t } = useTranslation("super")
	const [localValue, setLocalValue] = useState(searchValue)
	const isComposingRef = useRef(false)

	// 当外部 searchValue 变化时，同步到 localValue
	useEffect(() => {
		setLocalValue(searchValue)
	}, [searchValue])

	const handleCompositionStart = () => {
		isComposingRef.current = true
	}

	const handleCompositionEnd = (e: React.CompositionEvent<HTMLInputElement>) => {
		isComposingRef.current = false
		const value = e.currentTarget.value
		setLocalValue(value)
		if (onSearchCommit) {
			onSearchCommit(value)
			return
		}
		onSearchChange(value)
	}

	const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const value = e.target.value
		setLocalValue(value)

		// 只有在非组合状态下才触发搜索
		if (!isComposingRef.current) {
			onSearchChange(value)
		}
	}

	return (
		<div
			className={cn(
				"relative flex h-8 items-center gap-2 px-2",
				headerTrailingAction ? "pr-10" : undefined,
				className,
			)}
		>
			<InputGroup className="h-7 min-w-0 flex-1 rounded-md duration-300 animate-in fade-in slide-in-from-left-4 [&:has([data-slot=input-group-control]:focus-visible)]:border-input [&:has([data-slot=input-group-control]:focus-visible)]:ring-0">
				<InputGroupAddon align="inline-start">
					<Search size={16} />
				</InputGroupAddon>
				<InputGroupInput
					className="h-6"
					placeholder={t("common.searchFiles")}
					data-testid="file-search-input"
					value={localValue}
					onChange={handleChange}
					onCompositionStart={handleCompositionStart}
					onCompositionEnd={handleCompositionEnd}
					autoFocus
				/>
			</InputGroup>
			<Button
				type="button"
				size="icon-sm"
				className="size-7 shrink-0 border bg-white text-foreground duration-300 animate-in fade-in hover:bg-accent"
				data-testid="file-search-close-button"
				onClick={onClose}
				aria-label={t("common.cancel")}
			>
				<X size={16} />
			</Button>
			{headerTrailingAction ? (
				<HeaderTrailingAction>{headerTrailingAction}</HeaderTrailingAction>
			) : null}
		</div>
	)
}

export default memo(SearchModeHeader)
