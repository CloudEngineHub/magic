import { memo, useMemo, useState } from "react"
import { Flex, Form, Image } from "antd"
import { useTranslation } from "react-i18next"
import { useMemoizedFn } from "ahooks"
import { IconCheck, IconGripVertical, IconUpload, IconX } from "@tabler/icons-react"
import { MagicButton, UploadButton } from "@admin-components"
import {
	DndContext,
	PointerSensor,
	closestCenter,
	type DragEndEvent,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import { SortableContext, arrayMove, rectSortingStrategy, useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"

export interface SlidesTemplatePreviewImageItem {
	id: string
	fileKey: string
	url: string
}

interface SlidesTemplatePreviewImagesFieldProps {
	items: SlidesTemplatePreviewImageItem[]
	accept: string
	uploading: boolean
	disabled?: boolean
	onUpload: (files: FileList) => void
	onChange: (items: SlidesTemplatePreviewImageItem[]) => void
}

interface SortablePreviewImageProps {
	item: SlidesTemplatePreviewImageItem
	index: number
	disabled?: boolean
	onRemove: (id: string) => void
}

function SortablePreviewImage({ item, index, disabled, onRemove }: SortablePreviewImageProps) {
	const { t } = useTranslation("admin/common")
	const {
		attributes,
		listeners,
		setActivatorNodeRef,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: item.id, disabled })

	return (
		<Flex
			ref={setNodeRef}
			vertical
			gap={6}
			style={{
				width: 132,
				padding: 8,
				border: "1px solid #E5E7EB",
				borderRadius: 8,
				background: "#FFFFFF",
				opacity: isDragging ? 0.55 : 1,
				transform: CSS.Transform.toString(transform),
				transition,
			}}
		>
			<div style={{ position: "relative" }}>
				<Image
					src={item.url}
					alt={`${t("slidesTemplate.fields.previewImages")} ${index + 1}`}
					width={116}
					height={72}
					style={{ objectFit: "cover", borderRadius: 6 }}
					preview={false}
				/>
				<MagicButton
					type="text"
					size="small"
					danger
					disabled={disabled}
					aria-label={t("slidesTemplate.upload.removePreviewImage")}
					onClick={() => onRemove(item.id)}
					icon={<IconX size={14} />}
					style={{
						position: "absolute",
						top: 4,
						right: 4,
						width: 22,
						height: 22,
						background: "rgba(255,255,255,0.92)",
					}}
				/>
			</div>
			<Flex align="center" justify="space-between">
				<span style={{ color: "#6B7280", fontSize: 12 }}>#{index + 1}</span>
				<MagicButton
					ref={setActivatorNodeRef}
					type="text"
					size="small"
					disabled={disabled}
					icon={<IconGripVertical size={16} />}
					style={{ cursor: disabled ? "not-allowed" : "grab" }}
					{...attributes}
					{...listeners}
				/>
			</Flex>
		</Flex>
	)
}

export const SlidesTemplatePreviewImagesField = memo(
	({
		items,
		accept,
		uploading,
		disabled,
		onUpload,
		onChange,
	}: SlidesTemplatePreviewImagesFieldProps) => {
		const { t } = useTranslation("admin/common")
		const [dragging, setDragging] = useState(false)
		const sensors = useSensors(
			useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
		)
		const itemIds = useMemo(() => items.map((item) => item.id), [items])

		const handleDragEnd = useMemoizedFn((event: DragEndEvent) => {
			const { active, over } = event
			if (!over || active.id === over.id) return
			const oldIndex = items.findIndex((item) => item.id === active.id)
			const newIndex = items.findIndex((item) => item.id === over.id)
			if (oldIndex < 0 || newIndex < 0) return
			onChange(arrayMove(items, oldIndex, newIndex))
		})

		const handleRemove = useMemoizedFn((id: string) => {
			onChange(items.filter((item) => item.id !== id))
		})

		const handleDragOver = useMemoizedFn((event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			if (disabled) return
			event.dataTransfer.dropEffect = "copy"
			setDragging(true)
		})

		const handleDragLeave = useMemoizedFn((event: React.DragEvent<HTMLDivElement>) => {
			if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
			setDragging(false)
		})

		const handleDrop = useMemoizedFn((event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			setDragging(false)
			if (disabled || !event.dataTransfer.files.length) return
			onUpload(event.dataTransfer.files)
		})

		const handlePaste = useMemoizedFn((event: React.ClipboardEvent<HTMLDivElement>) => {
			if (disabled || !event.clipboardData.files.length) return
			event.preventDefault()
			onUpload(event.clipboardData.files)
		})

		const uploadedCount = items.filter((item) => item.fileKey).length
		const uploaded = uploadedCount > 0
		const description = uploaded
			? t("slidesTemplate.upload.previewImagesUploadedDescription", { count: uploadedCount })
			: t("slidesTemplate.upload.previewImagesDescription")

		return (
			<Form.Item label={t("slidesTemplate.fields.previewImages")}>
				<Flex
					vertical
					gap={10}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onPaste={handlePaste}
					style={{
						width: "100%",
						minHeight: 88,
						padding: 10,
						border: `1px dashed ${dragging ? "#315CEC" : uploaded ? "#BFE7CD" : "#E5E7EB"}`,
						borderRadius: 8,
						background: dragging
							? "rgba(49, 92, 236, 0.08)"
							: uploaded
								? "rgba(26, 159, 85, 0.04)"
								: "#FFFFFF",
						boxSizing: "border-box",
						transition: "border-color 0.2s ease, background 0.2s ease",
					}}
				>
					<Flex align="center" gap={12} wrap="wrap">
						<UploadButton
							loading={uploading}
							disabled={disabled}
							onFileChange={onUpload}
							icon={
								uploaded && !uploading ? (
									<IconCheck size={20} color="#1a9f55" />
								) : (
									<IconUpload size={20} />
								)
							}
							multiple
							accept={accept}
							type="default"
						>
							{uploaded && !uploading
								? t("message.uploadSuccess")
								: t("slidesTemplate.fields.previewImages")}
						</UploadButton>
						<span
							style={{
								color: uploaded ? "#1a9f55" : "#6B7280",
								fontSize: 13,
								lineHeight: "20px",
							}}
						>
							{description}
						</span>
					</Flex>
					{items.length ? (
						<DndContext
							sensors={sensors}
							collisionDetection={closestCenter}
							onDragEnd={handleDragEnd}
						>
							<SortableContext items={itemIds} strategy={rectSortingStrategy}>
								<Flex gap={10} wrap="wrap">
									{items.map((item, index) => (
										<SortablePreviewImage
											key={item.id}
											item={item}
											index={index}
											disabled={disabled}
											onRemove={handleRemove}
										/>
									))}
								</Flex>
							</SortableContext>
						</DndContext>
					) : (
						<span style={{ color: "#9CA3AF", fontSize: 13 }}>
							{t("slidesTemplate.upload.previewImagesEmpty")}
						</span>
					)}
				</Flex>
			</Form.Item>
		)
	},
)
