import { useCallback, useEffect, useRef, useState } from "react"
import { useTranslation } from "react-i18next"
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
				<p className="border-b border-dashed border-zinc-950/10 bg-zinc-50/40 py-6 text-center text-sm text-muted-foreground">
					{t("detail.selfMedia.initPanel.stepDetail.cardContentEmpty")}
				</p>
			) : (
				<div className="flex flex-col px-0.5">
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
	const [restoreRemoveFocus, setRestoreRemoveFocus] = useState(false)
	const removeButtonRef = useRef<HTMLButtonElement>(null)
	const cancelRemoveButtonRef = useRef<HTMLButtonElement>(null)
	const materials = card.materials || []
	const removeLabel = t("detail.selfMedia.initPanel.stepDetail.cardRemoveBtn", "移除此卡片")

	useEffect(() => {
		if (!pendingRemove) return
		cancelRemoveButtonRef.current?.focus()
	}, [pendingRemove])

	useEffect(() => {
		if (pendingRemove || !restoreRemoveFocus) return
		removeButtonRef.current?.focus()
		setRestoreRemoveFocus(false)
	}, [pendingRemove, restoreRemoveFocus])

	const handleCancelRemove = () => {
		setRestoreRemoveFocus(true)
		setPendingRemove(false)
	}

	return (
		<div
			data-testid={`self-media-card-content-item-${index}`}
			className="group/card border-b border-dashed border-zinc-950/10 px-0 py-4 shadow-none last:border-b-0 last:pb-5"
		>
			<div className="flex items-start gap-3">
				<Badge
					variant="secondary"
					className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-0 bg-[#f4f4f5] px-0 text-xs font-[760] text-[#18181b] shadow-none"
				>
					{index + 1}
				</Badge>
				<div className="min-w-0 flex-1">
					<div
						data-testid={`self-media-card-content-field-${index}`}
						className="overflow-hidden rounded-none border-0 border-b border-zinc-200 bg-zinc-50/40 shadow-none ring-0 ring-offset-0 focus-within:border-zinc-950 focus-within:bg-primary/[0.03] focus-within:ring-0 focus-within:ring-offset-0"
					>
						<div className="flex">
							<Textarea
								className="min-h-[128px] flex-1 resize-none border-0 bg-transparent px-4 py-3 text-sm shadow-none focus-visible:ring-0"
								placeholder={t(
									"detail.selfMedia.initPanel.stepDetail.cardContentPlaceholder",
									{ index: index + 1 },
								)}
								rows={3}
								value={card.text}
								onChange={(e) => onTextChange(e.target.value)}
								onBlur={onBlur}
							/>
							<div
								data-testid={`self-media-card-content-toolbar-${index}`}
								className="flex shrink-0 flex-col items-center gap-1 border-l border-zinc-200 px-1 py-2"
							>
								<InlineVoiceButton
									variant="textarea"
									value={card.text}
									onResult={onTextChange}
									className="relative right-auto top-auto translate-y-0 opacity-100"
								/>
								{onRemove &&
									(pendingRemove ? (
										<div
											className="flex flex-col gap-0.5"
											onKeyDown={(event) => {
												if (event.key !== "Escape") return
												event.stopPropagation()
												handleCancelRemove()
											}}
										>
											<Button
												ref={cancelRemoveButtonRef}
												type="button"
												variant="ghost"
												size="sm"
												className="h-6 px-2 text-[10px]"
												onClick={handleCancelRemove}
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
											ref={removeButtonRef}
											type="button"
											variant="ghost"
											size="icon-sm"
											className="size-7 text-muted-foreground/70 hover:text-destructive"
											onClick={() => setPendingRemove(true)}
											aria-label={removeLabel}
											title={removeLabel}
										>
											<Trash2 size={12} />
										</Button>
									))}
							</div>
						</div>
						<div
							data-testid={`self-media-card-content-attachments-${index}`}
							className="border-t border-zinc-200/70 bg-zinc-50/40 px-3 py-1.5"
						>
							<MaterialAttachmentList
								compact
								enableProjectPicker
								materials={materials}
								onChange={onMaterialsChange}
								uploadToProject={uploadToProject}
								addLabel={t(
									"detail.selfMedia.initPanel.stepDetail.outlineAttachBtn",
								)}
								descriptionPlaceholder={t(
									"detail.selfMedia.initPanel.stepDetail.outlineAttachPlaceholder",
								)}
							/>
						</div>
					</div>
				</div>
			</div>
		</div>
	)
}
