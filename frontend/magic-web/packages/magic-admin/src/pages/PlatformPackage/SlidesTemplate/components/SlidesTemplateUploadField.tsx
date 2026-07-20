import { memo, useState } from "react"
import { Flex, Form, Image } from "antd"
import { IconCheck, IconUpload } from "@tabler/icons-react"
import { useMemoizedFn } from "ahooks"
import { MagicInput, UploadButton } from "@admin-components"

export type SlidesTemplateFileField =
	| "thumbnail_file_key"
	| "collage_file_key"
	| "template_file_key"

interface SlidesTemplateUploadFieldProps {
	field: SlidesTemplateFileField
	label: string
	required?: boolean
	accept: string
	description: string
	uploadedDescription: string
	previewUrl?: string
	uploading: boolean
	uploaded?: boolean
	uploadedText: string
	pasteable?: boolean
	dragging?: boolean
	disabled?: boolean
	onDragEnter: (field: SlidesTemplateFileField) => void
	onDragLeave: (field: SlidesTemplateFileField) => void
	onUpload: (field: SlidesTemplateFileField, files: FileList) => void
}

export const SlidesTemplateUploadField = memo(
	({
		field,
		label,
		required,
		accept,
		description,
		uploadedDescription,
		previewUrl,
		uploading,
		uploaded,
		uploadedText,
		pasteable,
		dragging,
		disabled,
		onDragEnter,
		onDragLeave,
		onUpload,
	}: SlidesTemplateUploadFieldProps) => {
		const [focused, setFocused] = useState(false)

		const active = dragging || focused
		const borderColor = active ? "#315CEC" : uploaded ? "#BFE7CD" : "#E5E7EB"
		const background = dragging
			? "rgba(49, 92, 236, 0.08)"
			: focused
				? "rgba(49, 92, 236, 0.04)"
				: uploaded
					? "rgba(26, 159, 85, 0.04)"
					: "#FFFFFF"
		const boxShadow = focused && !dragging ? "0 0 0 3px rgba(49, 92, 236, 0.12)" : "none"

		const handleDragOver = useMemoizedFn((event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			if (disabled) return
			event.dataTransfer.dropEffect = "copy"
			onDragEnter(field)
		})

		const handleDragLeave = useMemoizedFn((event: React.DragEvent<HTMLDivElement>) => {
			if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
			onDragLeave(field)
		})

		const handleDrop = useMemoizedFn((event: React.DragEvent<HTMLDivElement>) => {
			event.preventDefault()
			onDragLeave(field)
			if (disabled) return
			const { files } = event.dataTransfer
			if (files.length) onUpload(field, files)
		})

		const handlePaste = useMemoizedFn((event: React.ClipboardEvent<HTMLDivElement>) => {
			if (!pasteable || disabled) return
			const { files } = event.clipboardData
			if (!files.length) return
			event.preventDefault()
			onUpload(field, files)
		})

		const handleMouseDown = useMemoizedFn((event: React.MouseEvent<HTMLDivElement>) => {
			if (disabled) return
			event.currentTarget.focus()
		})

		const handleFocus = useMemoizedFn(() => {
			if (!disabled) setFocused(true)
		})

		const handleBlur = useMemoizedFn((event: React.FocusEvent<HTMLDivElement>) => {
			if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
			setFocused(false)
		})

		return (
			<Form.Item label={label} required={required}>
				<Flex
					vertical
					gap={8}
					tabIndex={disabled ? undefined : 0}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					onDrop={handleDrop}
					onPaste={handlePaste}
					onMouseDown={handleMouseDown}
					onFocus={handleFocus}
					onBlur={handleBlur}
					style={{
						width: "100%",
						minHeight: 64,
						padding: 10,
						border: `1px dashed ${borderColor}`,
						borderRadius: 8,
						boxShadow,
						outline: "none",
						background,
						boxSizing: "border-box",
						transition:
							"border-color 0.2s ease, background 0.2s ease, box-shadow 0.2s ease",
					}}
				>
					<Flex align="center" gap={12} wrap="wrap">
						<UploadButton
							loading={uploading}
							disabled={disabled}
							onFileChange={(files) => onUpload(field, files)}
							icon={
								uploaded && !uploading ? (
									<IconCheck size={20} color="#1a9f55" />
								) : (
									<IconUpload size={20} />
								)
							}
							multiple={false}
							accept={accept}
							type="default"
						>
							{uploaded && !uploading ? uploadedText : label}
						</UploadButton>
						<span
							style={{
								color: uploaded ? "#1a9f55" : "#6B7280",
								fontSize: 13,
								lineHeight: "20px",
							}}
						>
							{uploaded ? uploadedDescription : description}
						</span>
					</Flex>
					{previewUrl ? (
						<Image
							src={previewUrl}
							alt={label}
							width={160}
							height={96}
							style={{ objectFit: "cover", borderRadius: 8 }}
							preview={{ src: previewUrl }}
							draggable={false}
						/>
					) : null}
					<Form.Item
						name={field}
						hidden
						rules={required ? [{ required: true, message: "" }] : undefined}
					>
						<MagicInput />
					</Form.Item>
				</Flex>
			</Form.Item>
		)
	},
)
