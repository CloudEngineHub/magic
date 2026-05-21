import { useTranslation } from "react-i18next"
import { History, Trash2, X, User, Compass, Target } from "lucide-react"

interface BrandRecord {
	id: string
	author: string
	brandPosition: string
	targetAudience: string
	createdAt: number
}

interface HistoryRecordPickerProps {
	records: BrandRecord[]
	onSelect: (record: BrandRecord) => void
	onDelete: (id: string) => void
	onClose: () => void
}

export function HistoryRecordPicker({
	records,
	onSelect,
	onDelete,
	onClose,
}: HistoryRecordPickerProps) {
	const { t } = useTranslation("super")

	return (
		<div className="rounded-xl border border-border/60 bg-background shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-3 duration-200">
			{/* Header */}
			<div className="flex items-center justify-between border-b border-border/50 bg-muted/30 px-4 py-2.5">
				<div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
					<History size={14} className="text-primary/70" />
					<span>
						{t(
							"detail.selfMedia.initPanel.stepBrand.selectRecordHint",
							"选择历史记录以回填",
						)}
					</span>
				</div>
				<button
					type="button"
					className="rounded-md p-1 text-muted-foreground/60 hover:bg-muted hover:text-foreground transition-all"
					onClick={onClose}
				>
					<X size={12} />
				</button>
			</div>

			{/* Record List */}
			<div className="max-h-56 overflow-y-auto divide-y divide-border/30">
				{records.map((record) => (
					<div
						key={record.id}
						className="group flex items-center justify-between gap-4 px-4 py-3 hover:bg-primary/[0.01] transition-colors"
					>
						<button
							type="button"
							className="flex flex-1 flex-col items-start gap-1 text-left"
							onClick={() => onSelect(record)}
						>
							{/* Account Name */}
							<div className="flex items-center gap-1.5 font-semibold text-sm text-foreground group-hover:text-primary transition-colors">
								<User
									size={12}
									className="text-muted-foreground/80 group-hover:text-primary/80"
								/>
								<span>{record.author}</span>
							</div>

							{/* Brand Position & Audience details */}
							<div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
								<span className="flex items-center gap-1">
									<Compass size={10} className="text-muted-foreground/50" />
									<span className="line-clamp-1 max-w-[200px]">
										{record.brandPosition}
									</span>
								</span>
								{record.targetAudience && (
									<>
										<span className="text-muted-foreground/30">•</span>
										<span className="flex items-center gap-1">
											<Target
												size={10}
												className="text-muted-foreground/50"
											/>
											<span className="line-clamp-1 max-w-[150px]">
												{record.targetAudience}
											</span>
										</span>
									</>
								)}
							</div>
						</button>

						<div className="flex items-center gap-2 shrink-0">
							<span className="text-[10px] text-muted-foreground/50">
								{new Date(record.createdAt).toLocaleDateString()}
							</span>
							<button
								type="button"
								className="rounded-lg p-1.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
								onClick={(e) => {
									e.stopPropagation()
									onDelete(record.id)
								}}
							>
								<Trash2 size={12} />
							</button>
						</div>
					</div>
				))}
			</div>
		</div>
	)
}
