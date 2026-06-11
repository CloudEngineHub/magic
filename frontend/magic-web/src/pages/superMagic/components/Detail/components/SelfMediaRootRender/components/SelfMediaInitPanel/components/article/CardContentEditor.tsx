import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"
import { cn } from "@/lib/utils"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import { Textarea } from "@/components/shadcn-ui/textarea"
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
		<div className="pt-1">
			{cardCount === 0 ? (
				<p className="rounded-lg border bg-card py-6 text-center text-sm text-muted-foreground">
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
		<div className="group/card rounded-lg border bg-card p-3 shadow-xs transition-all hover:border-primary/40 hover:bg-accent/30">
			<div className="flex items-start gap-2">
				<Badge
					variant={card.text ? "default" : "secondary"}
					className="mt-1 h-5 w-5 shrink-0 rounded-md px-0 text-[10px]"
				>
					{index + 1}
				</Badge>
				<div className="flex-1">
					<div className="flex items-start gap-1">
						<Textarea
							className="min-h-[64px] flex-1 resize-none text-sm shadow-none"
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
										<Button
											type="button"
											variant="ghost"
											size="sm"
											className="h-6 px-2 text-[10px]"
											onClick={() => setPendingRemove(false)}
										>
											<X size={9} />
											<span>
												{t(
													"detail.selfMedia.initPanel.stepDetail.removeCancel",
													"取消",
												)}
											</span>
										</Button>
										<Button
											type="button"
											variant="destructive"
											size="sm"
											className="h-6 px-2 text-[10px]"
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
										</Button>
									</div>
								) : (
									<Button
										type="button"
										variant="ghost"
										size="icon-sm"
										className="size-7 text-muted-foreground/50 opacity-0 hover:text-destructive group-hover/card:opacity-100"
										onClick={() => setPendingRemove(true)}
										title={t(
											"detail.selfMedia.initPanel.stepDetail.cardRemoveBtn",
											"移除此卡片",
										)}
									>
										<Trash2 size={12} />
									</Button>
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
