import { memo, useEffect, useMemo, useRef, useState } from "react"
import { Flex, Form, InputNumber, Select, Switch, message } from "antd"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import {
	LanguageType,
	MagicForm,
	MagicInput,
	MagicModal,
	MultiLangSetting,
	type Lang,
	type MagicModalProps,
} from "@admin-components"
import { useApis } from "@admin/apis"
import { useUpload } from "@admin/hooks/useUpload"
import type { Upload } from "@admin/types/upload"
import { genFileData } from "@admin/utils/file"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import { buildSlidesTemplateSaveParams } from "../utils"
import {
	SlidesTemplateUploadField,
	type SlidesTemplateFileField,
} from "./SlidesTemplateUploadField"

interface SlidesTemplateModalProps extends MagicModalProps {
	info?: SlidesTemplate.Item | null
	categoryOptions?: Array<{ label: string; value: string }>
	onSuccess?: () => void
}

type LangField = "label" | "description"
type LangErrorState = Record<LangField, boolean>
type FieldPath = Array<string | number>
type FormValidationError = {
	errorFields?: Array<{
		name?: unknown
	}>
}

type ImageFileField = "thumbnail_file_key" | "collage_file_key"

const IMAGE_ACCEPT = "image/*"
const ZIP_ACCEPT = ".zip,application/zip,application/x-zip-compressed"
const IMAGE_FILE_FIELDS = new Set<SlidesTemplateFileField>([
	"thumbnail_file_key",
	"collage_file_key",
])
const DEFAULT_LANG_ERRORS: LangErrorState = {
	label: false,
	description: false,
}

const isSameFieldPath = (name: unknown, path: FieldPath) => {
	if (!Array.isArray(name)) return false
	return path.length === name.length && path.every((item, index) => item === name[index])
}

const getLangErrors = (errorFields: FormValidationError["errorFields"] = []): LangErrorState => ({
	label: errorFields.some((field) => isSameFieldPath(field.name, ["label", "en_US"])),
	description: errorFields.some((field) => isSameFieldPath(field.name, ["description", "en_US"])),
})

export const SlidesTemplateModal = memo(
	({
		info,
		categoryOptions = [],
		onCancel,
		onOk,
		onSuccess,
		...rest
	}: SlidesTemplateModalProps) => {
		const { t } = useTranslation("admin/common")
		const { SlidesTemplateApi } = useApis()
		const [form] = Form.useForm()
		const [loading, setLoading] = useState(false)
		const [langErrors, setLangErrors] = useState<LangErrorState>(DEFAULT_LANG_ERRORS)
		const [previewUrls, setPreviewUrls] = useState({
			thumbnail_file_key: "",
			collage_file_key: "",
		})
		const [uploadingField, setUploadingField] = useState<SlidesTemplateFileField | null>(null)
		const [draggingField, setDraggingField] = useState<SlidesTemplateFileField | null>(null)
		const [uploadedFields, setUploadedFields] = useState<
			Record<SlidesTemplateFileField, boolean>
		>({
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
				category_code: info?.category_code ?? undefined,
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
			setLangErrors(DEFAULT_LANG_ERRORS)
		}, [form, info, initialValues, rest.open, revokeObjectPreviewUrl])

		useEffect(() => {
			return () => {
				revokeObjectPreviewUrl("thumbnail_file_key")
				revokeObjectPreviewUrl("collage_file_key")
			}
		}, [revokeObjectPreviewUrl])

		const updateLangField = useMemoizedFn((key: LangField, value: Lang) => {
			form.setFieldsValue({
				[key]: {
					...form.getFieldValue(key),
					...value,
				},
			})
			form.setFields([{ name: [key, "en_US"], errors: [] }])
			setLangErrors((prev) => ({ ...prev, [key]: false }))
		})

		const validateImage = useMemoizedFn((file: File) => {
			if (!file.type.startsWith("image/")) {
				message.error(t("slidesTemplate.upload.onlyImage"))
				return false
			}
			return true
		})

		const isImageField = useMemoizedFn(
			(field: SlidesTemplateFileField): field is ImageFileField =>
				IMAGE_FILE_FIELDS.has(field),
		)

		const validateZip = useMemoizedFn((file: File) => {
			if (!file.name.toLowerCase().endsWith(".zip")) {
				message.error(t("slidesTemplate.upload.onlyZip"))
				return false
			}
			return true
		})

		const handleUpload = useMemoizedFn(
			async (field: SlidesTemplateFileField, files: FileList) => {
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
			},
		)

		const handleDragEnter = useMemoizedFn((field: SlidesTemplateFileField) => {
			if (uploadingField) return
			setDraggingField(field)
		})

		const handleDragLeave = useMemoizedFn((field: SlidesTemplateFileField) => {
			setDraggingField((current) => (current === field ? null : current))
		})

		const onInnerCancel = useMemoizedFn((e?: React.MouseEvent<HTMLButtonElement>) => {
			form.resetFields()
			setLangErrors(DEFAULT_LANG_ERRORS)
			if (e) onCancel?.(e)
		})

		const onInnerOk = useMemoizedFn(async (e) => {
			try {
				const values = await form.validateFields()
				setLangErrors(DEFAULT_LANG_ERRORS)
				setLoading(true)
				const payload = buildSlidesTemplateSaveParams(values)

				if (info?.id) await SlidesTemplateApi.update(info.id, payload)
				else await SlidesTemplateApi.create(payload)

				message.success(info ? t("message.updateSuccess") : t("message.createSuccess"))
				onOk?.(e)
				onSuccess?.()
			} catch (error) {
				const nextLangErrors = getLangErrors((error as FormValidationError)?.errorFields)
				setLangErrors(nextLangErrors)
				if (nextLangErrors.label || nextLangErrors.description) {
					message.error(t("message.pleaseInputRequiredFields"))
				}
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
				maskClosable={false}
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
								clickToToggle
								supportLangs={[LanguageType.en_US]}
								info={label}
								danger={langErrors.label}
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
								clickToToggle
								supportLangs={[LanguageType.en_US]}
								supportType="textarea"
								info={description}
								danger={langErrors.description}
								onSave={(value) => updateLangField("description", value)}
							/>
						</Flex>
					</Form.Item>

					<Form.Item label={t("slidesTemplate.fields.category")} name="category_code">
						<Select
							allowClear
							showSearch
							placeholder={t("slidesTemplate.fields.category")}
							options={categoryOptions}
							filterOption={(input, option) =>
								String(option?.label ?? "")
									.toLowerCase()
									.includes(input.toLowerCase())
							}
						/>
					</Form.Item>

					<SlidesTemplateUploadField
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
					<SlidesTemplateUploadField
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
					<SlidesTemplateUploadField
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
