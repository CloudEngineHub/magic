import { memo, useEffect, useMemo, useRef, useState } from "react"
import { Flex, Form, InputNumber, Switch, message } from "antd"
import { IconCheck, IconUpload } from "@tabler/icons-react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import {
	LanguageType,
	MagicForm,
	MagicInput,
	MagicModal,
	MultiLangSetting,
	UploadButton,
	type Lang,
	type MagicModalProps,
} from "@admin-components"
import { useApis } from "@admin/apis"
import { useUpload } from "@admin/hooks/useUpload"
import type { Upload } from "@admin/types/upload"
import { genFileData } from "@admin/utils/file"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { buildSlidesTemplateSaveParams } from "../utils"

interface SlidesTemplateModalProps extends MagicModalProps {
	info?: SlidesTemplate.Item | null
	onSuccess?: () => void
}

type FileField = "thumbnail_file_key" | "collage_file_key" | "template_file_key"

interface UploadFieldProps {
	field: FileField
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
	onDragEnter: (field: FileField) => void
	onDragLeave: (field: FileField) => void
	onUpload: (field: FileField, files: FileList) => void
}

type ImageFileField = "thumbnail_file_key" | "collage_file_key"

const IMAGE_ACCEPT = "image/*"
const ZIP_ACCEPT = ".zip,application/zip,application/x-zip-compressed"
const IMAGE_FILE_FIELDS = new Set<FileField>(["thumbnail_file_key", "collage_file_key"])

const UploadField = memo(
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
	}: UploadFieldProps) => {
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
						<img
							src={previewUrl}
							alt={label}
							style={{ width: 160, height: 96, objectFit: "cover", borderRadius: 8 }}
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

export const SlidesTemplateModal = memo(
	({ info, onCancel, onOk, onSuccess, ...rest }: SlidesTemplateModalProps) => {
		const { t } = useTranslation("admin/common")
		const { SlidesTemplateApi } = useApis()
		const [form] = Form.useForm()
		const [loading, setLoading] = useState(false)
		const [previewUrls, setPreviewUrls] = useState({
			thumbnail_file_key: "",
			collage_file_key: "",
		})
		const [uploadingField, setUploadingField] = useState<FileField | null>(null)
		const [draggingField, setDraggingField] = useState<FileField | null>(null)
		const [uploadedFields, setUploadedFields] = useState<Record<FileField, boolean>>({
			thumbnail_file_key: false,
			collage_file_key: false,
			template_file_key: false,
		})
		const objectPreviewUrls = useRef<Partial<Record<ImageFileField, string>>>({})

		const label = Form.useWatch(["label"], form)
		const description = Form.useWatch(["description"], form)

		const initialValues = useMemo(
			() => ({
				label: {
					zh_CN: info?.label?.zh_CN ?? "",
					en_US: info?.label?.en_US ?? "",
				},
				description: {
					zh_CN: info?.description?.zh_CN ?? "",
					en_US: info?.description?.en_US ?? "",
				},
				thumbnail_file_key: info?.thumbnail_file_key ?? "",
				collage_file_key: info?.collage_file_key ?? "",
				template_file_key: info?.template_file_key ?? "",
				preview_url: info?.preview_url ?? "",
				status: info ? info.status === SlidesTemplate.StatusMap.enabled : true,
				sort: info?.sort ?? 0,
			}),
			[info],
		)

		const { upload } = useUpload<Upload.FileData>({
			storageType: "private",
		})

		const revokeObjectPreviewUrl = useMemoizedFn((field: ImageFileField) => {
			const url = objectPreviewUrls.current[field]
			if (!url) return
			URL.revokeObjectURL(url)
			delete objectPreviewUrls.current[field]
		})

		const setImagePreviewUrl = useMemoizedFn(
			(field: ImageFileField, url: string, isObjectUrl = false) => {
				revokeObjectPreviewUrl(field)
				if (isObjectUrl) objectPreviewUrls.current[field] = url
				setPreviewUrls((prev) => ({ ...prev, [field]: url }))
			},
		)

		useEffect(() => {
			if (!rest.open) return
			form.setFieldsValue(initialValues)
			revokeObjectPreviewUrl("thumbnail_file_key")
			revokeObjectPreviewUrl("collage_file_key")
			setPreviewUrls({
				thumbnail_file_key: info?.thumbnail_url ?? "",
				collage_file_key: info?.collage_url ?? "",
			})
			setUploadedFields({
				thumbnail_file_key: Boolean(info?.thumbnail_file_key),
				collage_file_key: Boolean(info?.collage_file_key),
				template_file_key: Boolean(info?.template_file_key),
			})
		}, [form, info, initialValues, rest.open, revokeObjectPreviewUrl])

		useEffect(() => {
			return () => {
				revokeObjectPreviewUrl("thumbnail_file_key")
				revokeObjectPreviewUrl("collage_file_key")
			}
		}, [revokeObjectPreviewUrl])

		const updateLangField = useMemoizedFn((key: "label" | "description", value: Lang) => {
			form.setFieldsValue({
				[key]: {
					...form.getFieldValue(key),
					...value,
				},
			})
		})

		const validateImage = useMemoizedFn((file: File) => {
			if (!file.type.startsWith("image/")) {
				message.error(t("slidesTemplate.upload.onlyImage"))
				return false
			}
			return true
		})

		const isImageField = useMemoizedFn((field: FileField): field is ImageFileField =>
			IMAGE_FILE_FIELDS.has(field),
		)

		const validateZip = useMemoizedFn((file: File) => {
			if (!file.name.toLowerCase().endsWith(".zip")) {
				message.error(t("slidesTemplate.upload.onlyZip"))
				return false
			}
			return true
		})

		const handleUpload = useMemoizedFn(async (field: FileField, files: FileList) => {
			if (uploadingField) return

			const fileList = Array.from(files).map(genFileData)
			if (!fileList.length) return

			if (field === "template_file_key") {
				const file = fileList[0].file
				if (!file || !validateZip(file)) return
				setUploadingField(field)
				try {
					const { fullfilled } = await upload(fileList)
					if (fullfilled.length) {
						form.setFieldValue(field, fullfilled[0].value.key)
						setUploadedFields((prev) => ({ ...prev, [field]: true }))
						message.success(t("message.uploadSuccess"))
					}
				} finally {
					setUploadingField(null)
				}
				return
			}

			const file = fileList[0].file
			if (!file || !isImageField(field) || !validateImage(file)) return

			setImagePreviewUrl(field, URL.createObjectURL(file), true)
			setUploadingField(field)
			try {
				const { fullfilled } = await upload(fileList)
				if (fullfilled.length) {
					const fileKey = fullfilled[0].value.key
					form.setFieldValue(field, fileKey)
					setUploadedFields((prev) => ({ ...prev, [field]: true }))
					message.success(t("message.uploadSuccess"))
				}
			} finally {
				setUploadingField(null)
			}
		})

		const handleDragEnter = useMemoizedFn((field: FileField) => {
			if (uploadingField) return
			setDraggingField(field)
		})

		const handleDragLeave = useMemoizedFn((field: FileField) => {
			setDraggingField((current) => (current === field ? null : current))
		})

		const onInnerCancel = useMemoizedFn((e?: React.MouseEvent<HTMLButtonElement>) => {
			form.resetFields()
			onCancel?.(e!)
		})

		const onInnerOk = useMemoizedFn(async (e) => {
			try {
				const values = await form.validateFields()
				setLoading(true)
				const payload = buildSlidesTemplateSaveParams(values)

				if (info?.id) await SlidesTemplateApi.update(info.id, payload)
				else await SlidesTemplateApi.create(payload)

				message.success(info ? t("message.updateSuccess") : t("message.createSuccess"))
				onOk?.(e)
				onSuccess?.()
			} catch {
				// API and form layers already surface validation and request errors.
			} finally {
				setLoading(false)
			}
		})

		return (
			<MagicModal
				width={720}
				title={info ? t("slidesTemplate.editTitle") : t("slidesTemplate.addTitle")}
				okText={t("button.save")}
				cancelText={t("button.cancel")}
				onCancel={onInnerCancel}
				onOk={onInnerOk}
				okButtonProps={{ loading, disabled: uploadingField !== null }}
				centered
				destroyOnHidden
				{...rest}
			>
				<MagicForm afterRequiredMask colon={false} form={form}>
					<Form.Item label={t("slidesTemplate.fields.label")} required>
						<Flex gap={10}>
							<Form.Item
								name={["label", "zh_CN"]}
								noStyle
								rules={[{ required: true, message: "" }]}
							>
								<MagicInput maxLength={100} />
							</Form.Item>
							<Form.Item
								name={["label", "en_US"]}
								noStyle
								hidden
								rules={[{ required: true, message: "" }]}
							>
								<MagicInput />
							</Form.Item>
							<MultiLangSetting
								required
								supportLangs={[LanguageType.en_US]}
								info={label}
								onSave={(value) => updateLangField("label", value)}
							/>
						</Flex>
					</Form.Item>

					<Form.Item label={t("slidesTemplate.fields.description")} required>
						<Flex gap={10}>
							<Form.Item
								name={["description", "zh_CN"]}
								noStyle
								rules={[{ required: true, message: "" }]}
							>
								<MagicInput.TextArea rows={3} maxLength={1000} />
							</Form.Item>
							<Form.Item
								name={["description", "en_US"]}
								noStyle
								hidden
								rules={[{ required: true, message: "" }]}
							>
								<MagicInput.TextArea />
							</Form.Item>
							<MultiLangSetting
								required
								supportLangs={[LanguageType.en_US]}
								supportType="textarea"
								info={description}
								onSave={(value) => updateLangField("description", value)}
							/>
						</Flex>
					</Form.Item>

					<UploadField
						field="thumbnail_file_key"
						label={t("slidesTemplate.fields.thumbnail")}
						required
						accept={IMAGE_ACCEPT}
						description={t("slidesTemplate.upload.imageDescription")}
						uploadedDescription={t("slidesTemplate.upload.imageUploadedDescription")}
						previewUrl={previewUrls.thumbnail_file_key}
						uploading={uploadingField === "thumbnail_file_key"}
						uploaded={uploadedFields.thumbnail_file_key}
						uploadedText={t("message.uploadSuccess")}
						pasteable
						disabled={
							uploadingField !== null && uploadingField !== "thumbnail_file_key"
						}
						dragging={draggingField === "thumbnail_file_key"}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onUpload={handleUpload}
					/>
					<UploadField
						field="collage_file_key"
						label={t("slidesTemplate.fields.collage")}
						accept={IMAGE_ACCEPT}
						description={t("slidesTemplate.upload.imageDescription")}
						uploadedDescription={t("slidesTemplate.upload.imageUploadedDescription")}
						previewUrl={previewUrls.collage_file_key}
						uploading={uploadingField === "collage_file_key"}
						uploaded={uploadedFields.collage_file_key}
						uploadedText={t("message.uploadSuccess")}
						pasteable
						disabled={uploadingField !== null && uploadingField !== "collage_file_key"}
						dragging={draggingField === "collage_file_key"}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onUpload={handleUpload}
					/>
					<UploadField
						field="template_file_key"
						label={t("slidesTemplate.fields.templateFile")}
						required
						accept={ZIP_ACCEPT}
						description={t("slidesTemplate.upload.zipDescription")}
						uploadedDescription={t("slidesTemplate.upload.zipUploadedDescription")}
						uploading={uploadingField === "template_file_key"}
						uploaded={uploadedFields.template_file_key}
						uploadedText={t("message.uploadSuccess")}
						disabled={uploadingField !== null && uploadingField !== "template_file_key"}
						dragging={draggingField === "template_file_key"}
						onDragEnter={handleDragEnter}
						onDragLeave={handleDragLeave}
						onUpload={handleUpload}
					/>

					<Form.Item
						label={t("slidesTemplate.fields.previewUrl")}
						name="preview_url"
						rules={[{ type: "url", message: "" }]}
					>
						<MagicInput maxLength={1024} />
					</Form.Item>
					<Form.Item label={t("slidesTemplate.fields.sort")} name="sort">
						<InputNumber style={{ width: "100%" }} />
					</Form.Item>
					<Form.Item
						label={t("slidesTemplate.fields.status")}
						name="status"
						valuePropName="checked"
					>
						<Switch />
					</Form.Item>
				</MagicForm>
			</MagicModal>
		)
	},
)
