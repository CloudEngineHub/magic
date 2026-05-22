import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { MaterialItem, OutlineNode } from "../../types"
import MaterialAttachmentList from "../material/MaterialAttachmentList"
import InlineVoiceButton from "../ui/InlineVoiceButton"
import { Trash2, Check, X } from "lucide-react"

interface CardContentEditorProps {
	outline: OutlineNode[]
	cardCount: number
	onChange: (outline: OutlineNode[]) => void
	onRemoveCard?: (index: number) => void
	onBlur?: () => void
	uploadToProject?: (file: File, materialId: string) => void
}

let idCounter = 0
function generateId(): string {
	return `card_${Date.now()}_${++idCounter}`
}

/**
 * Card-based content editor for platforms like Xiaohongshu and Instagram.
 * Each card is a flat item with a content description (no hierarchy).
 */
export default function CardContentEditor({
	outline,
	cardCount,
	onChange,
	onRemoveCard,
	onBlur,
	uploadToProject,
}: CardContentEditorProps) {
	const { t } = useTranslation("super")

	// Ensure we always have exactly `cardCount` cards
	const cards: OutlineNode[] = Array.from({ length: cardCount }, (_, i) => {
		if (outline[i]) return outline[i]
		return { id: generateId(), text: "", children: [], materials: [] }
	})

	const handleCardTextChange = useCallback(
		(index: number, text: string) => {
			const next = [...cards]
			next[index] = { ...next[index], text }
			onChange(next)
		},
		[cards, onChange],
	)

	const handleMaterialsChange = useCallback(
		(index: number, materials: MaterialItem[]) => {
			const next = [...cards]
			next[index] = { ...next[index], materials }
			onChange(next)
		},
		[cards, onChange],
	)

	return (
		<div className="border-t border-dashed border-zinc-950/10 pt-3">
			{cardCount === 0 ? (
				<p className="border-y border-dashed border-zinc-950/10 py-6 text-center text-sm text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepDetail.cardContentEmpty")}
				</p>
			) : (
				<div className="flex flex-col gap-3">
					{cards.map((card, index) => (
						<CardItem
							key={card.id}
							index={index}
							card={card}
							onTextChange={(text) => handleCardTextChange(index, text)}
							onMaterialsChange={(materials) =>
								handleMaterialsChange(index, materials)
							}
							onRemove={onRemoveCard ? () => onRemoveCard(index) : undefined}
							onBlur={onBlur}
							uploadToProject={uploadToProject}
						/>
					))}
				</div>
			)}
		</div>
	)
}

interface CardItemProps {
	index: number
	card: OutlineNode
	onTextChange: (text: string) => void
	onMaterialsChange: (materials: MaterialItem[]) => void
	onRemove?: () => void
	onBlur?: () => void
	uploadToProject?: (file: File, materialId: string) => void
}

function CardItem({
	index,
	card,
	onTextChange,
	onMaterialsChange,
	onRemove,
	onBlur,
	uploadToProject,
}: CardItemProps) {
	const { t } = useTranslation("super")
	const [pendingRemove, setPendingRemove] = useState(false)
	const materials = card.materials || []

	return (
		<div className="group/card border-l-2 border-zinc-950/10 bg-zinc-50/40 p-3 transition-all hover:border-primary/60 hover:bg-primary/[0.03]">
			<div className="flex items-start gap-2">
				<span
					className={cn(
						"mt-1 flex h-5 w-5 shrink-0 items-center justify-center text-[10px] font-black",
						card.text
							? "bg-primary/25 text-zinc-950"
							: "bg-zinc-100 text-muted-foreground",
					)}
				>
					{index + 1}
				</span>
				<div className="flex-1">
					<div className="flex items-start gap-1">
						<textarea
							className="flex-1 resize-none border-0 border-b border-transparent bg-transparent px-1 py-1 text-sm outline-none transition-all placeholder:text-muted-foreground/50 focus:border-zinc-950 focus:bg-primary/[0.03]"
							placeholder={t(
								"detail.selfMedia.initPanel.stepDetail.cardContentPlaceholder",
								{ index: index + 1 },
							)}
							rows={2}
							value={card.text}
							onChange={(e) => onTextChange(e.target.value)}
							onBlur={onBlur}
						/>
						<div className="mt-0.5 flex shrink-0 flex-col items-center gap-0.5">
							<InlineVoiceButton
								variant="textarea"
								value={card.text}
								onResult={onTextChange}
								className="relative right-auto top-auto translate-y-0 opacity-0 group-hover/card:opacity-100"
							/>
							{onRemove &&
								(pendingRemove ? (
									<div className="flex flex-col gap-0.5">
										<button
											type="button"
											className="flex items-center gap-0.5 px-1.5 py-0.5 text-[9px] font-black text-zinc-500 transition-all hover:bg-zinc-200/80 hover:text-zinc-950"
											onClick={() => setPendingRemove(false)}
										>
											<X size={9} />
											<span>
												{t(
													"detail.selfMedia.initPanel.stepDetail.removeCancel",
													"取消",
												)}
											</span>
										</button>
										<button
											type="button"
											className="flex items-center gap-0.5 bg-destructive px-1.5 py-0.5 text-[9px] font-black text-white transition-all hover:bg-destructive/90 active:scale-[0.98]"
											onClick={() => {
												onRemove()
												setPendingRemove(false)
											}}
										>
											<Check size={9} />
											<span>
												{t(
													"detail.selfMedia.initPanel.stepDetail.removeConfirm",
													"删除",
												)}
											</span>
										</button>
									</div>
								) : (
									<button
										type="button"
										className="cursor-pointer p-1 text-muted-foreground/30 opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover/card:opacity-100"
										onClick={() => setPendingRemove(true)}
										title={t(
											"detail.selfMedia.initPanel.stepDetail.cardRemoveBtn",
											"移除此卡片",
										)}
									>
										<Trash2 size={12} />
									</button>
								))}
						</div>
					</div>
					<div className="mt-1.5">
						<MaterialAttachmentList
							compact
							enableProjectPicker
							materials={materials}
							onChange={onMaterialsChange}
							uploadToProject={uploadToProject}
							addLabel={t("detail.selfMedia.initPanel.stepDetail.outlineAttachBtn")}
							descriptionPlaceholder={t(
								"detail.selfMedia.initPanel.stepDetail.outlineAttachPlaceholder",
							)}
						/>
					</div>
				</div>
			</div>
		</div>
	)
}
