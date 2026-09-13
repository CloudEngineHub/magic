import { useRef, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import { FolderTree } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"
import MagicTooltip from "@/components/base/MagicTooltip"
import { FileResourceIcon } from "../FileResourceIcon"
import type { FilePresentation } from "../../utils/file-presentation"

export function FileManagerPlaces({
	rootId,
	rootName,
	directoryId,
	folders,
	onNavigate,
	before,
	getPopupContainer,
	dropTarget,
}: {
	rootId: string
	rootName: string
	directoryId: string
	folders: FilePresentation[]
	onNavigate: (id: string) => void
	before?: ReactNode
	getPopupContainer: () => HTMLElement | null
	dropTarget: string | null
}) {
	const { t } = useTranslation("super")
	const viewport = useRef<HTMLDivElement>(null)
	const virtualizer = useVirtualizer({
		count: folders.length,
		getScrollElement: () => viewport.current,
		estimateSize: () => 36,
		overscan: 3,
	})
	return (
		<aside
			aria-label={t("fileManager.places")}
			className="flex min-h-0 w-[166px] shrink-0 flex-col border-r bg-muted/30 px-2 py-4 max-sm:w-32"
		>
			{before}
			<p className="px-2 pb-2 text-xs text-muted-foreground">{t("fileManager.places")}</p>
			<button
				type="button"
				className={cn(
					"flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent",
					directoryId === rootId && "bg-accent text-accent-foreground",
					dropTarget === rootId && "ring-2 ring-inset ring-primary",
				)}
				onClick={() => onNavigate(rootId)}
				data-manager-target={rootId}
				aria-current={directoryId === rootId ? "page" : undefined}
			>
				<FolderTree size={16} />
				<span className="truncate">{rootName}</span>
			</button>
			<div ref={viewport} className="min-h-0 flex-1 overflow-y-auto">
				<div className="relative" style={{ height: virtualizer.getTotalSize() }}>
					{virtualizer.getVirtualItems().map((row) => {
						const presentation = folders[row.index]
						const id = presentation.item.file_id
						if (!id) return null
						return (
							<MagicTooltip
								key={id}
								title={presentation.name}
								placement="right"
								getPopupContainer={getPopupContainer}
							>
								<button
									style={{
										position: "absolute",
										top: row.start,
										height: row.size,
									}}
									type="button"
									data-manager-target={id}
									aria-current={directoryId === id ? "page" : undefined}
									onClick={() => onNavigate(id)}
									className={cn(
										"my-0.5 flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs hover:bg-accent",
										directoryId === id && "bg-accent text-accent-foreground",
										dropTarget === id && "ring-2 ring-inset ring-primary",
									)}
								>
									<FileResourceIcon presentation={presentation} size={16} />
									<span className="truncate">{presentation.name}</span>
								</button>
							</MagicTooltip>
						)
					})}
				</div>
			</div>
		</aside>
	)
}
