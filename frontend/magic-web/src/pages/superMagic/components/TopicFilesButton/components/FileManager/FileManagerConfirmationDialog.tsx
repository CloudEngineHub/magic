import { useTranslation } from "react-i18next"
import { useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { Folder, FileText } from "lucide-react"
import { Input } from "@/components/shadcn-ui/input"
import { Button } from "@/components/shadcn-ui/button"
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogFooter,
} from "@/components/shadcn-ui/dialog"
import type { useFileManagerConfirmation } from "../../hooks/useFileManagerConfirmation"

export function FileManagerConfirmationDialog({
	controller,
}: {
	controller: ReturnType<typeof useFileManagerConfirmation>
}) {
	const { t } = useTranslation("super")
	const [text, setText] = useState("")
	const viewport = useRef<HTMLDivElement>(null)
	const cancel = useRef<HTMLButtonElement>(null)
	const state = controller.state
	const items = state?.items ?? []
	const rows = useVirtualizer({
		count: items.length,
		getScrollElement: () => viewport.current,
		estimateSize: () => 52,
		overscan: 4,
	})
	const deleting = state?.operation === "delete"
	const folders = items.filter((item) => item.folder).length
	const required =
		deleting && (folders > 0 || (state?.selectedCount ?? 0) > 1)
			? t("fileManager.confirmation.deletePhrase", { count: items.length })
			: ""
	const titles = {
		move: t("fileManager.confirmation.move"),
		copy: t("fileManager.confirmation.copy"),
		import: t("fileManager.confirmation.import"),
		delete: t("fileManager.confirmation.delete"),
		upload: t("fileManager.confirmation.upload"),
		replace: t("fileManager.confirmation.replace"),
		create: t("fileManager.confirmation.create"),
	}
	return (
		<Dialog
			open={Boolean(state)}
			onOpenChange={(open) => {
				if (!open) controller.cancel()
			}}
		>
			<DialogContent
				className="gap-4 rounded-2xl sm:max-w-lg"
				onOpenAutoFocus={(event) => {
					event.preventDefault()
					setText("")
					cancel.current?.focus()
				}}
			>
				<DialogHeader>
					<DialogTitle>{state && titles[state.operation]}</DialogTitle>
					<DialogDescription>
						{t("fileManager.confirmation.scope", {
							selected: state?.selectedCount ?? 0,
							files: items.length - folders,
							folders,
						})}
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-2 rounded-lg bg-muted/50 p-3 text-xs">
					<div className="break-words">
						<span className="text-muted-foreground">
							{t("fileManager.confirmation.source")}{" "}
						</span>
						{state?.source}
					</div>
					{!deleting && (
						<div className="break-words">
							<span className="text-muted-foreground">
								{t("fileManager.confirmation.target")}{" "}
							</span>
							{state?.target}
						</div>
					)}
				</div>
				<div
					ref={viewport}
					className="overflow-y-auto rounded-md border"
					style={{ height: Math.min(260, items.length * 52) }}
				>
					<div className="relative" style={{ height: rows.getTotalSize() }}>
						{rows.getVirtualItems().map((row) => {
							const item = items[row.index]
							const Icon = item.folder ? Folder : FileText
							return (
								<div
									key={item.id}
									className="absolute flex w-full items-center gap-2 px-3 text-xs"
									style={{ top: row.start, height: row.size }}
								>
									<Icon size={16} className="shrink-0 text-muted-foreground" />
									<div className="min-w-0 flex-1">
										<div className="truncate">
											{item.name}
											{item.dependency && (
												<span className="ml-2 text-muted-foreground">
													{t("fileManager.confirmation.dependency")}
												</span>
											)}
										</div>
										<div
											className="truncate text-muted-foreground"
											title={item.path}
										>
											{item.path}
										</div>
									</div>
								</div>
							)
						})}
					</div>
				</div>
				{Boolean(state?.skippedCount) && (
					<p className="text-xs text-muted-foreground">
						{t("fileManager.confirmation.skipped", { count: state?.skippedCount })}
					</p>
				)}
				<p className="text-xs leading-relaxed text-muted-foreground">
					{state?.warning ||
						(deleting
							? t("fileManager.confirmation.deleteWarning")
							: state?.operation === "move"
								? t("fileManager.confirmation.moveWarning")
								: state?.operation === "replace"
									? t("fileManager.confirmation.replaceWarning")
									: t("fileManager.confirmation.writeWarning"))}
				</p>
				{required && (
					<label className="space-y-2 text-sm">
						<span>
							{t("fileManager.confirmation.typePhrase", { phrase: required })}
						</span>
						<Input
							value={text}
							onChange={(event) => setText(event.target.value)}
							autoComplete="off"
						/>
					</label>
				)}
				<DialogFooter>
					<Button ref={cancel} variant="outline" onClick={controller.cancel}>
						{t("common.cancel")}
					</Button>
					<Button
						variant={deleting ? "destructive" : "default"}
						disabled={Boolean(required && text !== required)}
						onClick={controller.accept}
					>
						{state && titles[state.operation]}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
