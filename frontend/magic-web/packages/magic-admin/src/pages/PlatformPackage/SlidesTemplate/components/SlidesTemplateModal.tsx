import { memo, useEffect, useMemo, useRef, useState } from "react"
import { Flex, Form, InputNumber, Select, Spin, Switch, message } from "antd"
import { useMemoizedFn } from "ahooks"
import { nanoid } from "nanoid"
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
import type { CustomCredentials, Upload } from "@admin/types/upload"
import { genFileData } from "@admin/utils/file"
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import {
	buildSlidesTemplateSaveParams,
	generateSlidesTemplateCode,
	joinUploadDir,
	resolveSlidesTemplateTagName,
} from "../utils"
import {
	SlidesTemplateUploadField,
	type SlidesTemplateFileField,
} from "./SlidesTemplateUploadField"
import {
	SlidesTemplatePreviewImagesField,
	type SlidesTemplatePreviewImageItem,
} from "./SlidesTemplatePreviewImagesField"

interface SlidesTemplateModalProps extends MagicModalProps {
	info?: SlidesTemplate.Item | null
	mode?: "create" | "edit"
	detailLoading?: boolean
	categoryOptions?: Array<{ label: string; value: string }>
	tagOptions?: Array<{ label: string; value: string }>
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
type SlidesTemplateUploadKind = "asset" | "preview"
type SlidesTemplateUploadStorage = "private" | "public"

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

const CODE_CONFLICT_MARKERS = [
	"CODE_ALREADY_EXISTS",
	"code_already_exists",
	"slides_template.code_already_exists",
]

const isSameFieldPath = (name: unknown, path: FieldPath) => {
	if (!Array.isArray(name)) return false
	return path.length === name.length && path.every((item, index) => item === name[index])
}

const getLangErrors = (errorFields: FormValidationError["errorFields"] = []): LangErrorState => ({
	label: errorFields.some((field) => isSameFieldPath(field.name, ["label", "en_US"])),
	description: errorFields.some((field) => isSameFieldPath(field.name, ["description", "en_US"])),
})

const isCodeConflictError = (error: unknown) => {
	const text = JSON.stringify(error) || String(error)
	return CODE_CONFLICT_MARKERS.some((marker) => text.includes(marker))
}

export const SlidesTemplateModal = memo(
	({
		info,
		mode = "create",
		detailLoading = false,
		categoryOptions = [],
		tagOptions = [],
		onCancel,
		onOk,
		onSuccess,
		...rest
	}: SlidesTemplateModalProps) => {
		const { t } = useTranslation("admin/common")
		const { SlidesTemplateApi, FileApi } = useApis()
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
		// Preview-image object URLs for the multi-image field, keyed by stable item id
		const previewObjectUrls = useRef<Record<string, string>>({})

		// Hidden PPT code: generated on the client for new templates (never user-editable).
		// For editing we reuse the existing code from `info.code`.
		const [generatedCode, setGeneratedCode] = useState(() => generateSlidesTemplateCode())
		const effectiveCode = info?.code ?? generatedCode
		const isEditMode = mode === "edit"

		const [previewImages, setPreviewImages] = useState<SlidesTemplatePreviewImageItem[]>([])
		const [uploadingPreviews, setUploadingPreviews] = useState(false)

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
				tag_codes: info?.tags?.map((tag) => tag.code) ?? [],
				thumbnail_file_key: info?.thumbnail_file_key ?? "",
				collage_file_key: info?.collage_file_key ?? "",
				template_file_key: info?.template_file_key ?? "",
				preview_url: info?.preview_url ?? "",
				status: info ? info.status === SlidesTemplate.StatusMap.enabled : true,
				sort: info?.sort ?? 0,
			}),
			[info],
		)

		const mergedTagOptions = useMemo(() => {
			const optionMap = new Map(tagOptions.map((option) => [option.value, option]))
			info?.tags?.forEach((tag) => {
				if (optionMap.has(tag.code)) return
				optionMap.set(tag.code, {
					label: resolveSlidesTemplateTagName(tag),
					value: tag.code,
				})
			})
			return Array.from(optionMap.values())
		}, [info?.tags, tagOptions])

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
			// Reset preview images from the loaded template.
			// File keys drive the submitted payload; URLs (object or remote) drive the thumbnails.
			const fileKeys = info?.preview_image_file_keys ?? []
			const remoteUrls = info?.preview_image_urls ?? []
			setPreviewImages(
				fileKeys.map((fileKey, index) => ({
					id: `${fileKey}-${index}`,
					fileKey,
					url: remoteUrls[index] ?? "",
				})),
			)
			// Re-generate hidden code on every new-template open so each session is unique
			if (!info?.id) setGeneratedCode(generateSlidesTemplateCode())
			// Cleanup any leftover object URLs from a previous session
			Object.values(previewObjectUrls.current).forEach((url) => URL.revokeObjectURL(url))
			previewObjectUrls.current = {}
		}, [form, info, initialValues, rest.open, revokeObjectPreviewUrl])

		useEffect(() => {
			return () => {
				revokeObjectPreviewUrl("thumbnail_file_key")
				revokeObjectPreviewUrl("collage_file_key")
				Object.values(previewObjectUrls.current).forEach((url) => URL.revokeObjectURL(url))
				previewObjectUrls.current = {}
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

		/**
		 * 构建目标业务目录（公有桶）。
		 * - 单图字段：`slide-templates/{code}`
		 * - 多页预览：`slide-templates/{code}/previews`
		 * 服务端返回的 `temporary_credential.dir` 作为基础目录，上传前再追加这里的业务目录。
		 */
		const buildAssetDir = useMemoizedFn((kind: SlidesTemplateUploadKind) => {
			if (!effectiveCode) return null
			const base = `slide-templates/${effectiveCode}`
			// upload-sdk 内部使用 `${dir}${key}` 直接拼接，dir 必须带尾部 `/`
			return kind === "preview" ? `${base}/previews/` : `${base}/`
		})

		/**
		 * 上传模板资源到指定目录。
		 * 先调 `/file/temporary-credential` 取目标桶凭证，
		 * 再把业务目标目录拼到 `temporary_credential.dir` 后，最后走 SDK 的 customCredentials 通道上传。
		 * 这样上传后的 fileKey 会落在 `{temporary_credential.dir}/slide-templates/{code}[/previews]/<filename>` 下。
		 */
		const uploadToTemplateDir = useMemoizedFn(
			async (
				fileList: Upload.FileData[],
				kind: SlidesTemplateUploadKind,
				storage: SlidesTemplateUploadStorage,
			): Promise<Upload.UploadResult> => {
				const dir = buildAssetDir(kind)
				if (!dir) {
					message.error(t("slidesTemplate.upload.imageDescription"))
					return Promise.resolve({ fullfilled: [], rejected: [] })
				}
				const firstFile = fileList[0]?.file
				// 先取目标桶的临时凭证，再追加业务目标目录前缀，传给 SDK 的 customCredentials
				const resp = await FileApi.getTemporaryCredential({
					storage,
					content_type: firstFile?.type,
					sts: storage === "private",
				})
				const platform: string = (resp?.platform as string) ?? ""
				const temporaryCredential = (resp?.temporary_credential ?? {}) as Record<
					string,
					unknown
				>
				if (!platform || !temporaryCredential || !Object.keys(temporaryCredential).length) {
					throw new Error("get temporary credential failed")
				}
				const baseDir = temporaryCredential.dir
				if (typeof baseDir !== "string" || !baseDir) {
					throw new Error("temporary credential dir is empty")
				}
				temporaryCredential.dir = joinUploadDir(baseDir, dir)
				const customCredentials = {
					platform,
					temporary_credential: temporaryCredential,
				} as CustomCredentials
				return upload(fileList, customCredentials)
			},
		)

		/**
		 * 多页预览图上传：支持一次多文件、追加到现有列表。
		 * 新上传项先用品本地 object URL 占位预览，上传成功后替换为真实 fileKey/url（在 dir 改写后 SDK 返回完整 fileKey，
		 * 由于该 fileKey 含 organizationCode 前缀，后台 save 时直接保留）。
		 */
		const handlePreviewImagesUpload = useMemoizedFn(async (files: FileList) => {
			if (uploadingPreviews) return
			const allFiles = Array.from(files)
			if (!allFiles.length) return
			const invalid = allFiles.find((file) => !validateImage(file))
			if (invalid) return

			setUploadingPreviews(true)
			// 先把每张本地预览追加到列表，乐观展示，再逐张上传并回填结果
			const placeholderItems: SlidesTemplatePreviewImageItem[] = allFiles.map((file) => {
				const id = nanoid()
				const objectUrl = URL.createObjectURL(file)
				previewObjectUrls.current[id] = objectUrl
				return { id, fileKey: "", url: objectUrl }
			})
			setPreviewImages((prev) => [...prev, ...placeholderItems])

			try {
				const fileList = allFiles.map(genFileData)
				const { fullfilled } = await uploadToTemplateDir(fileList, "preview", "public")
				const placeholderIds = placeholderItems.map((item) => item.id)
				// SDK 在 customCredentials 模式下通常按顺序返回；若部分成功则只保留成功项对应的占位图
				setPreviewImages((prev) => {
					const uploadedById = new Map<string, string>()
					fullfilled.forEach((f, index) => {
						const id = placeholderIds[index]
						if (id) uploadedById.set(id, f.value.key)
					})
					const failedPlaceholderIds = placeholderIds.slice(fullfilled.length)
					// 清理失败占位项的 object URL
					failedPlaceholderIds.forEach((id) => {
						const url = previewObjectUrls.current[id]
						if (url) URL.revokeObjectURL(url)
						delete previewObjectUrls.current[id]
					})
					return prev
						.map((item) => {
							const fileKey = uploadedById.get(item.id)
							return fileKey ? { ...item, fileKey } : item
						})
						.filter((item) => !failedPlaceholderIds.includes(item.id))
				})
				if (fullfilled.length) message.success(t("message.uploadSuccess"))
			} catch (error) {
				const placeholderIds = new Set(placeholderItems.map((item) => item.id))
				placeholderIds.forEach((id) => {
					const url = previewObjectUrls.current[id]
					if (url) URL.revokeObjectURL(url)
					delete previewObjectUrls.current[id]
				})
				setPreviewImages((prev) => prev.filter((item) => !placeholderIds.has(item.id)))
				console.error("preview images upload failed", error)
				message.error(t("message.actionFailed"))
			} finally {
				setUploadingPreviews(false)
			}
		})

		const handlePreviewImagesChange = useMemoizedFn(
			(nextItems: SlidesTemplatePreviewImageItem[]) => {
				// 释放不再被引用的 object URL，避免内存泄漏
				const nextIds = new Set(nextItems.map((item) => item.id))
				Object.entries(previewObjectUrls.current).forEach(([id, url]) => {
					if (!nextIds.has(id)) {
						URL.revokeObjectURL(url)
						delete previewObjectUrls.current[id]
					}
				})
				setPreviewImages(nextItems)
			},
		)

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
						const { fullfilled } = await uploadToTemplateDir(
							fileList,
							"asset",
							"private",
						)
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
					const { fullfilled } = await uploadToTemplateDir(fileList, "asset", "public")
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
			if (detailLoading || (isEditMode && !info?.id)) return
			try {
				const values = await form.validateFields()
				setLangErrors(DEFAULT_LANG_ERRORS)
				setLoading(true)
				// 隐藏的 code：新建模式由前端在打开时生成（见 generatedCode）；编辑模式绝不发送 code
				const baseValues = {
					...values,
					preview_image_file_keys: previewImages
						.map((item) => item.fileKey)
						.filter((key) => Boolean(key)),
				}
				const buildPayload = (code?: string) =>
					buildSlidesTemplateSaveParams(code ? { ...baseValues, code } : baseValues)

				if (info?.id) {
					await SlidesTemplateApi.update(info.id, buildPayload())
				} else {
					// 第一次用 generatedCode；若命中 DB 唯一约束错误，再生成一次重试
					try {
						await SlidesTemplateApi.create(buildPayload(generatedCode))
					} catch (error) {
						if (!isCodeConflictError(error)) throw error
						const retriedCode = generateSlidesTemplateCode()
						setGeneratedCode(retriedCode)
						message.warning(t("message.codeConflictRetry"))
						await SlidesTemplateApi.create(buildPayload(retriedCode))
					}
				}

				message.success(
					isEditMode ? t("message.updateSuccess") : t("message.createSuccess"),
				)
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
				title={isEditMode ? t("slidesTemplate.editTitle") : t("slidesTemplate.addTitle")}
				okText={t("button.save")}
				cancelText={t("button.cancel")}
				onCancel={onInnerCancel}
				onOk={onInnerOk}
				okButtonProps={{
					loading,
					disabled:
						detailLoading ||
						(isEditMode && !info?.id) ||
						uploadingField !== null ||
						uploadingPreviews,
				}}
				maskClosable={false}
				centered
				destroyOnHidden
				{...rest}
			>
				{detailLoading ? (
					<Flex justify="center" style={{ padding: "24px 0" }}>
						<Spin />
					</Flex>
				) : null}
				<MagicForm
					afterRequiredMask
					colon={false}
					form={form}
					style={detailLoading ? { display: "none" } : undefined}
				>
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

					<Form.Item label={t("slidesTemplate.fields.tags")} name="tag_codes">
						<Select
							allowClear
							showSearch
							mode="multiple"
							maxTagCount="responsive"
							placeholder={t("slidesTemplate.fields.tags")}
							options={mergedTagOptions}
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
					<SlidesTemplatePreviewImagesField
						items={previewImages}
						accept={IMAGE_ACCEPT}
						uploading={uploadingPreviews}
						disabled={uploadingField !== null}
						onUpload={handlePreviewImagesUpload}
						onChange={handlePreviewImagesChange}
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
