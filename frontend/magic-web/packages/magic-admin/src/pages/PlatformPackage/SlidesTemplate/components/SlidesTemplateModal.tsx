import { memo, useEffect, useMemo, useState } from "react"
import { Flex, Form, InputNumber, Switch, message } from "antd"
import { IconUpload } from "@tabler/icons-react"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import {
	LanguageType,
	MagicButton,
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
	previewUrl?: string
	value?: string
	uploading: boolean
	onUpload: (field: FileField, files: FileList) => void
}

const IMAGE_ACCEPT = "image/*"
const ZIP_ACCEPT = ".zip,application/zip,application/x-zip-compressed"

const UploadField = memo(
	({
		field,
		label,
		required,
		accept,
		previewUrl,
		value,
		uploading,
		onUpload,
	}: UploadFieldProps) => {
		return (
			<Form.Item label={label} required={required}>
				<Flex vertical gap={8}>
					<Flex gap={10} align="center">
						<UploadButton
							loading={uploading}
							onFileChange={(files) => onUpload(field, files)}
							icon={<IconUpload size={20} />}
							multiple={false}
							accept={accept}
							type="default"
						>
							{label}
						</UploadButton>
						<span style={{ wordBreak: "break-all" }}>{value || "-"}</span>
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

		const label = Form.useWatch(["label"], form)
		const description = Form.useWatch(["description"], form)
		const thumbnailFileKey = Form.useWatch("thumbnail_file_key", form)
		const collageFileKey = Form.useWatch("collage_file_key", form)
		const templateFileKey = Form.useWatch("template_file_key", form)

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

		const { uploading, uploadAndGetFileUrl, upload } = useUpload<Upload.FileData>({
			storageType: "private",
		})

		useEffect(() => {
			if (!rest.open) return
			form.setFieldsValue(initialValues)
			setPreviewUrls({
				thumbnail_file_key: info?.thumbnail_url ?? "",
				collage_file_key: info?.collage_url ?? "",
			})
		}, [form, info, initialValues, rest.open])

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

		const validateZip = useMemoizedFn((file: File) => {
			if (!file.name.toLowerCase().endsWith(".zip")) {
				message.error(t("slidesTemplate.upload.onlyZip"))
				return false
			}
			return true
		})

		const handleUpload = useMemoizedFn(async (field: FileField, files: FileList) => {
			const fileList = Array.from(files).map(genFileData)
			if (!fileList.length) return

			if (field === "template_file_key") {
				const file = fileList[0].file
				if (!file || !validateZip(file)) return
				const { fullfilled } = await upload(fileList)
				if (fullfilled.length) {
					form.setFieldValue(field, fullfilled[0].value.key)
					message.success(t("message.uploadSuccess"))
				}
				return
			}

			const { fullfilled } = await uploadAndGetFileUrl(fileList, validateImage)
			if (fullfilled.length) {
				const { path, url } = fullfilled[0].value
				form.setFieldValue(field, path)
				setPreviewUrls((prev) => ({ ...prev, [field]: url }))
				message.success(t("message.uploadSuccess"))
			}
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
				okButtonProps={{ loading }}
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
						value={thumbnailFileKey}
						previewUrl={previewUrls.thumbnail_file_key}
						uploading={uploading}
						onUpload={handleUpload}
					/>
					<UploadField
						field="collage_file_key"
						label={t("slidesTemplate.fields.collage")}
						accept={IMAGE_ACCEPT}
						value={collageFileKey}
						previewUrl={previewUrls.collage_file_key}
						uploading={uploading}
						onUpload={handleUpload}
					/>
					<UploadField
						field="template_file_key"
						label={t("slidesTemplate.fields.templateFile")}
						required
						accept={ZIP_ACCEPT}
						value={templateFileKey}
						uploading={uploading}
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
