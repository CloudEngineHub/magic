import { useCallback } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import type { MaterialItem, OutlineNode } from "./types"
import MaterialAttachmentList from "./MaterialAttachmentList"
import InlineVoiceButton from "./InlineVoiceButton"
import { Trash2 } from "lucide-react"

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
		<div className="rounded-lg border border-border p-3">
			{cardCount === 0 ? (
				<p className="py-4 text-center text-sm text-muted-foreground">
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
	const materials = card.materials || []

	return (
		<div className="group/card rounded-lg border border-border/50 bg-muted/20 p-2.5 transition-all hover:border-border">
			<div className="flex items-start gap-2">
				<span
					className={cn(
						"mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded text-[10px] font-bold",
						card.text ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground",
					)}
				>
					{index + 1}
				</span>
				<div className="flex-1">
					<div className="flex items-start gap-1">
						<textarea
							className="flex-1 resize-none rounded border-0 bg-transparent px-1 py-0.5 text-sm placeholder:text-muted-foreground/50 focus:bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
							placeholder={t(
								"detail.selfMedia.initPanel.stepDetail.cardContentPlaceholder",
								{ index: index + 1 },
							)}
							rows={2}
							value={card.text}
							onChange={(e) => onTextChange(e.target.value)}
							onBlur={onBlur}
						/>
						<div className="flex shrink-0 flex-col items-center gap-0.5 mt-0.5">
							<InlineVoiceButton
								variant="textarea"
								onResult={(text) => onTextChange(card.text + text)}
								className="relative right-auto top-auto translate-y-0 opacity-0 group-hover/card:opacity-100"
							/>
							{onRemove && (
								<button
									type="button"
									className="rounded p-1 text-muted-foreground/30 opacity-0 transition-all hover:bg-destructive/15 hover:text-destructive group-hover/card:opacity-100 cursor-pointer"
									onClick={onRemove}
									title={t(
										"detail.selfMedia.initPanel.stepDetail.cardRemoveBtn",
										"移除此卡片",
									)}
								>
									<Trash2 size={12} />
								</button>
							)}
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
