import { useRef, useState } from "react"
import { useTranslation } from "react-i18next"
import { CheckSquare, Search, MoreHorizontal, Loader2 } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/shadcn-ui/dialog"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import type { PPTDeckTools } from "../hooks/usePPTDeckTools"
import { cn } from "@/utils/cn"

export default function PPTDeckToolbar({
	tools,
	allowEdit,
	slideCount,
	isMobile,
}: {
	tools: PPTDeckTools
	allowEdit: boolean
	slideCount: number
	isMobile: boolean
}) {
	const { t } = useTranslation("super")
	const [removeTargets, setRemoveTargets] = useState<ReadonlySet<string> | null>(null)
	const [removing, setRemoving] = useState(false)
	const removingRef = useRef(false)
	const confirmRemove = async () => {
		if (!removeTargets || removingRef.current) return
		// Include the unsaved-edit prompt in the lock, before tools.busy becomes true.
		removingRef.current = true
		setRemoving(true)
		try {
			await tools.remove(removeTargets)
			setRemoveTargets(null)
		} finally {
			removingRef.current = false
			setRemoving(false)
		}
	}
	const selectedCount = tools.selected.size
	return (
		<div
			className={cn(
				"shrink-0 space-y-2 border-border p-2",
				isMobile ? "w-36 border-r" : "border-b",
			)}
		>
			<div className="flex gap-1">
				<Button
					className="min-w-0 flex-1 px-1 text-xs"
					size="sm"
					variant="ghost"
					disabled={tools.busy}
					onClick={() => tools.setSearchOpen(true)}
				>
					<Search className="mr-1 size-4" />
					{t("ppt.batch.search")}
				</Button>
				<Button
					className="min-w-0 flex-1 px-1 text-xs"
					size="sm"
					variant={tools.selecting ? "secondary" : "ghost"}
					aria-pressed={tools.selecting}
					disabled={tools.busy}
					onClick={() =>
						tools.selecting ? tools.clearSelection() : tools.setSelecting(true)
					}
				>
					<CheckSquare className="mr-1 size-4" />
					{t("ppt.batch.select")}
				</Button>
			</div>
			{tools.selecting ? (
				<>
					<p className="text-xs text-muted-foreground" role="status">
						{t("ppt.batch.selectedCount", { count: selectedCount })}
					</p>
					<div className="flex flex-wrap gap-1">
						<Button
							size="sm"
							variant="ghost"
							className="h-7 px-2 text-xs"
							disabled={tools.busy}
							onClick={tools.selectAll}
						>
							{t("ppt.batch.selectAll")}
						</Button>
						<Button
							size="sm"
							variant="ghost"
							className="h-7 px-2 text-xs"
							disabled={tools.busy}
							onClick={tools.clearSelection}
						>
							{t("ppt.batch.clear")}
						</Button>
					</div>
					{allowEdit ? (
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									size="sm"
									variant="outline"
									className="w-full text-xs"
									disabled={!selectedCount || tools.busy}
								>
									<MoreHorizontal className="mr-1 size-4" />
									{t("ppt.batch.actions")}
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="start">
								<DropdownMenuItem onSelect={() => void tools.duplicate()}>
									{t("ppt.batch.copy")}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => void tools.setHidden(true)}>
									{t("ppt.batch.hide")}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => void tools.setHidden(false)}>
									{t("ppt.batch.show")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onSelect={() => void tools.move(0)}>
									{t("ppt.batch.moveFirst")}
								</DropdownMenuItem>
								<DropdownMenuItem onSelect={() => void tools.move(slideCount)}>
									{t("ppt.batch.moveLast")}
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem
									className="text-destructive"
									disabled={selectedCount >= slideCount}
									onSelect={() => setRemoveTargets(new Set(tools.selected))}
								>
									{t("ppt.batch.remove")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					) : null}
				</>
			) : null}
			{tools.busy ? (
				<Button
					variant="outline"
					size="sm"
					className="w-full text-xs"
					onClick={tools.cancel}
				>
					<Loader2 className="mr-1 size-4 animate-spin" />
					{t("ppt.batch.stop")}
				</Button>
			) : null}
			<Dialog
				open={removeTargets !== null}
				onOpenChange={(open) => {
					if (!open && !removingRef.current) setRemoveTargets(null)
				}}
			>
				<DialogContent showCloseButton={!removing}>
					<DialogHeader>
						<DialogTitle>
							{t("ppt.batch.removeTitle", { count: removeTargets?.size || 0 })}
						</DialogTitle>
						<DialogDescription>{t("ppt.batch.removeDescription")}</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button
							variant="outline"
							disabled={removing}
							onClick={() => setRemoveTargets(null)}
						>
							{t("ppt.batch.cancel")}
						</Button>
						<Button
							variant="destructive"
							disabled={removing || tools.busy || !allowEdit || !removeTargets?.size}
							aria-busy={removing}
							onClick={confirmRemove}
						>
							{removing && (
								<Loader2 className="size-4 animate-spin" aria-hidden="true" />
							)}
							{t("ppt.batch.remove")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	)
}
