import { memo, useEffect, useMemo, useRef, useState } from "react"
import {
	Alert,
	Divider,
	Flex,
	Form,
	Input,
	Progress,
	Select,
	Spin,
	Switch,
	Tag,
	Typography,
	message,
} from "antd"
import { useMemoizedFn } from "ahooks"
import { useTranslation } from "react-i18next"
import {
	IconCheck,
	IconFileZip,
	IconFolder,
	IconInfoCircle,
	IconUpload,
	IconX,
} from "@tabler/icons-react"
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
import type { PlatformPackage } from "@admin/types/platformPackage"
import { SkillMarketCategoryStatusMap } from "@admin/types/platformPackage/market"
import {
	createSkillArchiveFromSelectedFolderFiles,
	SKILL_ARCHIVE_ERROR,
	SkillArchiveError,
} from "@admin/utils/skillArchive"

const MAX_FILE_SIZE = 100 * 1024 * 1024
const ACCEPT = ".zip,.skill,application/zip,application/x-zip-compressed"

type ParsedSkill = PlatformPackage.ParseOfficialSkillResponse
type Category = PlatformPackage.SkillMarketCategoryItem

export interface OfficialSkillImportDialogProps extends Omit<MagicModalProps, "onOk" | "onCancel"> {
	onCancel?: () => void
	onSuccess?: (
		result: PlatformPackage.ImportOfficialSkillResponse,
		context: { publishStatus: "OFFLINE" | "PUBLISHED" },
	) => void | Promise<void>
}

type LocalizedFieldProps = {
	form: ReturnType<typeof Form.useForm>[0]
	field: "name_i18n" | "description_i18n" | "source_i18n"
	label: string
	placeholder?: string
	required?: boolean
	textarea?: boolean
}

function getLocalizedValue(value?: PlatformPackage.NameI18N | null, fallback = "") {
	if (!value) return { zh_CN: fallback, en_US: fallback }
	const defaultValue = value.zh_CN || value.en_US || value.default || fallback
	return {
		zh_CN: value.zh_CN || defaultValue,
		en_US: value.en_US || defaultValue,
	}
}

function flattenCategories(
	categories: Category[],
	depth = 0,
): Array<{ label: string; value: string }> {
	return categories.flatMap((category) => [
		{
			label: `${depth ? `${"　".repeat(depth)}└ ` : ""}${category.name_i18n?.zh_CN || category.name || category.id}`,
			value: String(category.id),
		},
		...flattenCategories(category.children ?? [], depth + 1),
	])
}

function LocalizedField({
	form,
	field,
	label,
	placeholder,
	required,
	textarea,
}: LocalizedFieldProps) {
	const value = Form.useWatch([field], form) as Lang | undefined
	const updateLang = useMemoizedFn((next: Lang) => {
		form.setFieldsValue({ [field]: { ...form.getFieldValue(field), ...next } })
		if (required) form.setFields([{ name: [field, "en_US"], errors: [] }])
	})

	return (
		<Form.Item label={label} required={required}>
			<Flex gap={8} align="start">
				<Form.Item
					name={[field, "zh_CN"]}
					noStyle
					rules={required ? [{ required: true, message: "" }] : undefined}
				>
					{textarea ? (
						<Input.TextArea rows={3} placeholder={placeholder} />
					) : (
						<MagicInput placeholder={placeholder} />
					)}
				</Form.Item>
				<Form.Item
					name={[field, "en_US"]}
					noStyle
					hidden
					rules={required ? [{ required: true, message: "" }] : undefined}
				>
					<MagicInput />
				</Form.Item>
				<MultiLangSetting
					required={required}
					supportLangs={[LanguageType.en_US]}
					supportType={textarea ? "textarea" : "input"}
					info={value}
					onSave={updateLang}
				/>
			</Flex>
		</Form.Item>
	)
}

const OfficialSkillImportDialog = memo(
	({ onCancel, onSuccess, ...rest }: OfficialSkillImportDialogProps) => {
		const { t } = useTranslation("admin/platform/skillMarket")
		const { t: tCommon } = useTranslation("admin/common")
		const { PlatformPackageApi } = useApis()
		const [form] = Form.useForm()
		const [parsed, setParsed] = useState<ParsedSkill | null>(null)
		const [file, setFile] = useState<Upload.FileData | null>(null)
		const [progress, setProgress] = useState(0)
		const [packing, setPacking] = useState(false)
		const [parsing, setParsing] = useState(false)
		const [submitting, setSubmitting] = useState(false)
		const [categories, setCategories] = useState<Category[]>([])
		const [categoriesLoading, setCategoriesLoading] = useState(false)
		const submittingRef = useRef(false)

		const { upload, uploading } = useUpload<Upload.FileData>({
			storageType: "private",
			sts: true,
			onProgress: (_, nextProgress) => setProgress(nextProgress),
		})

		const categoryOptions = useMemo(() => flattenCategories(categories), [categories])

		const clearSelectedFile = useMemoizedFn(() => {
			setFile(null)
			setParsed(null)
			setProgress(0)
			form.resetFields()
		})

		const reset = useMemoizedFn(() => {
			form.resetFields()
			setParsed(null)
			setFile(null)
			setProgress(0)
			setPacking(false)
			setParsing(false)
			setSubmitting(false)
			setCategories([])
			setCategoriesLoading(false)
			submittingRef.current = false
		})

		useEffect(() => {
			if (!rest.open) return
			reset()
			setCategoriesLoading(true)
			void PlatformPackageApi.getSkillMarketCategoryList({
				status: SkillMarketCategoryStatusMap.visible,
			})
				.then((response) => setCategories(response.list ?? []))
				.catch(() => message.error(t("officialSkillImport.errors.categoriesFailed")))
				.finally(() => setCategoriesLoading(false))
		}, [PlatformPackageApi, reset, rest.open, t])

		const processSelectedFile = useMemoizedFn(async (selected?: File) => {
			if (!selected) return
			clearSelectedFile()
			if (!/\.(zip|skill)$/i.test(selected.name)) {
				message.error(t("officialSkillImport.errors.invalidFile"))
				return
			}
			if (selected.size > MAX_FILE_SIZE) {
				message.error(t("officialSkillImport.errors.fileTooLarge"))
				return
			}

			const nextFile = genFileData(selected)
			setFile(nextFile)
			setParsed(null)
			setProgress(0)
			setParsing(true)
			try {
				const result = await upload([nextFile])
				if (!result.fullfilled.length) throw new Error("upload-failed")
				const parsedResult = await PlatformPackageApi.parseOfficialSkillFile({
					file_key: result.fullfilled[0].value.key,
				})
				setParsed(parsedResult)
				form.setFieldsValue({
					version: "1.0.0",
					name_i18n: getLocalizedValue(parsedResult.name_i18n, parsedResult.package_name),
					description_i18n: getLocalizedValue(
						parsedResult.description_i18n,
						parsedResult.package_description,
					),
					source_i18n: getLocalizedValue(
						parsedResult.source_i18n,
						t("officialSkillImport.defaultSource"),
					),
					logo: parsedResult.logo || "",
					category_ids: [],
					publish_status: "OFFLINE",
					is_hidden: false,
					is_featured: false,
					sort_order: 0,
				})
				setProgress(100)
			} catch {
				setFile({ ...nextFile, status: "error" })
				message.error(t("officialSkillImport.errors.parseFailed"))
			} finally {
				setParsing(false)
			}
		})

		const handleFileChange = useMemoizedFn(async (files: FileList) => {
			await processSelectedFile(files[0])
		})

		const handleFolderChange = useMemoizedFn(async (files: FileList) => {
			if (!files.length || packing || parsing || uploading) return
			clearSelectedFile()

			const selectedFiles = Array.from(files)
			const sourceSize = selectedFiles.reduce((total, selected) => total + selected.size, 0)
			if (sourceSize > MAX_FILE_SIZE) {
				message.error(t("officialSkillImport.errors.fileTooLarge"))
				return
			}

			let archive: File | undefined
			setPacking(true)
			try {
				archive = await createSkillArchiveFromSelectedFolderFiles(selectedFiles)
			} catch (error) {
				if (
					error instanceof SkillArchiveError &&
					error.code === SKILL_ARCHIVE_ERROR.EMPTY_FOLDER
				) {
					message.error(t("officialSkillImport.errors.emptyFolder"))
					return
				}
				message.error(t("officialSkillImport.errors.archiveFailed"))
			} finally {
				setPacking(false)
			}

			if (archive) await processSelectedFile(archive)
		})

		const handleRemoveFile = useMemoizedFn(() => {
			if (packing || parsing || uploading || submitting) return
			clearSelectedFile()
		})

		const handleSubmit = useMemoizedFn(async () => {
			if (!parsed || submittingRef.current) return
			submittingRef.current = true
			setSubmitting(true)
			try {
				const values = await form.validateFields()
				const result = await PlatformPackageApi.importOfficialSkill({
					import_token: parsed.import_token,
					version: String(values.version).trim(),
					name_i18n: values.name_i18n,
					description_i18n: values.description_i18n,
					source_i18n: values.source_i18n,
					logo: values.logo?.trim() || undefined,
					category_ids: (values.category_ids ?? []).map(String),
					publish_status: values.publish_status,
					is_hidden: Boolean(values.is_hidden),
					is_featured: Boolean(values.is_featured),
					sort_order: Number(values.sort_order) || 0,
				})
				message.success(
					result.action === "updated"
						? t("officialSkillImport.success.updated")
						: t("officialSkillImport.success.created"),
				)
				await onSuccess?.(result, { publishStatus: values.publish_status })
				onCancel?.()
			} catch (error) {
				if ((error as { errorFields?: unknown })?.errorFields) {
					message.error(tCommon("message.pleaseInputRequiredFields"))
				} else {
					message.error(t("officialSkillImport.errors.importFailed"))
				}
			} finally {
				submittingRef.current = false
				setSubmitting(false)
			}
		})

		const handleCancel = useMemoizedFn(() => {
			if (submittingRef.current) return
			reset()
			onCancel?.()
		})

		return (
			<MagicModal
				width={760}
				centered
				maskClosable={false}
				destroyOnHidden
				title={t("officialSkillImport.title")}
				okText={t("officialSkillImport.buttons.confirm")}
				cancelText={tCommon("button.cancel")}
				onCancel={handleCancel}
				onOk={handleSubmit}
				okButtonProps={{
					disabled: !parsed || packing || parsing || uploading || submitting,
					loading: submitting,
				}}
				{...rest}
			>
				<Flex vertical gap={16}>
					<Alert
						showIcon
						icon={<IconInfoCircle size={18} />}
						message={t("officialSkillImport.description")}
						type="info"
					/>
					<div
						style={{
							border: "1px dashed #D9DDE7",
							borderRadius: 10,
							padding: "20px 24px",
							background: "#FAFBFC",
						}}
					>
						<Flex align="center" justify="space-between" gap={16} wrap="wrap">
							<Flex align="center" gap={12}>
								<div
									style={{
										width: 40,
										height: 40,
										borderRadius: 10,
										background: "#EEF3FF",
										color: "#315CEC",
										display: "grid",
										placeItems: "center",
									}}
								>
									<IconFileZip size={22} />
								</div>
								<div>
									<Typography.Text strong>
										{t("officialSkillImport.upload.title")}
									</Typography.Text>
									<Typography.Paragraph
										type="secondary"
										style={{ margin: 0, fontSize: 12 }}
									>
										{t("officialSkillImport.upload.hint")}
									</Typography.Paragraph>
								</div>
							</Flex>
							<Flex gap={8} wrap="wrap">
								<UploadButton
									type="primary"
									icon={<IconUpload size={16} />}
									loading={packing || uploading || parsing}
									disabled={packing || uploading || parsing || submitting}
									multiple={false}
									accept={ACCEPT}
									onFileChange={handleFileChange}
								>
									{t("officialSkillImport.upload.chooseFile")}
								</UploadButton>
								<UploadButton
									type="default"
									icon={<IconFolder size={16} />}
									loading={packing || uploading || parsing}
									disabled={packing || uploading || parsing || submitting}
									directory
									onFileChange={handleFolderChange}
								>
									{t("officialSkillImport.upload.chooseFolder")}
								</UploadButton>
							</Flex>
						</Flex>
						{file ? (
							<Flex align="center" gap={10} style={{ marginTop: 16 }}>
								{file.status === "done" || parsed ? (
									<IconCheck size={17} color="#1A9F55" />
								) : file.status === "error" ? (
									<IconX size={17} color="#D4380D" />
								) : (
									<Spin size="small" />
								)}
								<Typography.Text ellipsis style={{ maxWidth: 420 }}>
									{file.name}
								</Typography.Text>
								<Typography.Text type="secondary" style={{ fontSize: 12 }}>
									{`${(file.size / 1024 / 1024).toFixed(1)} MB`}
								</Typography.Text>
								<MagicButton
									type="text"
									danger
									icon={<IconX size={15} />}
									disabled={packing || submitting || uploading || parsing}
									onClick={handleRemoveFile}
								/>
							</Flex>
						) : null}
						{file && (packing || uploading || parsing) ? (
							<Progress percent={progress} size="small" showInfo={false} />
						) : null}
					</div>

					{parsed ? (
						<>
							<Divider style={{ margin: "0" }} />
							<Flex align="center" justify="space-between" gap={12}>
								<div>
									<Typography.Text strong>{parsed.package_name}</Typography.Text>
									<Typography.Paragraph
										type="secondary"
										style={{ margin: 0, fontSize: 12 }}
									>
										{parsed.code}
									</Typography.Paragraph>
								</div>
								<Tag color={parsed.is_update ? "gold" : "green"}>
									{parsed.is_update
										? t("officialSkillImport.updateExisting")
										: t("officialSkillImport.createNew")}
								</Tag>
							</Flex>
							<MagicForm form={form} layout="vertical" afterRequiredMask>
								<LocalizedField
									form={form}
									field="name_i18n"
									label={t("officialSkillImport.fields.name")}
									placeholder={t("officialSkillImport.fields.namePlaceholder")}
									required
								/>
								<LocalizedField
									form={form}
									field="description_i18n"
									label={t("officialSkillImport.fields.description")}
									placeholder={t(
										"officialSkillImport.fields.descriptionPlaceholder",
									)}
									required
									textarea
								/>
								<LocalizedField
									form={form}
									field="source_i18n"
									label={t("officialSkillImport.fields.source")}
									placeholder={t("officialSkillImport.fields.sourcePlaceholder")}
								/>
								<Flex gap={12}>
									<Form.Item
										label={t("officialSkillImport.fields.version")}
										name="version"
										rules={[{ required: true, message: "" }]}
										style={{ flex: 1 }}
									>
										<MagicInput placeholder="1.0.0" maxLength={32} />
									</Form.Item>
									<Form.Item
										label={t("officialSkillImport.fields.status")}
										name="publish_status"
										style={{ flex: 1 }}
									>
										<Select
											options={[
												{
													label: t("officialSkillImport.fields.offline"),
													value: "OFFLINE",
												},
												{
													label: t(
														"officialSkillImport.fields.published",
													),
													value: "PUBLISHED",
												},
											]}
										/>
									</Form.Item>
								</Flex>
								<Form.Item
									label={t("officialSkillImport.fields.category")}
									name="category_ids"
								>
									<Select
										mode="multiple"
										allowClear
										loading={categoriesLoading}
										options={categoryOptions}
										placeholder={t(
											"officialSkillImport.fields.categoryPlaceholder",
										)}
										maxTagCount="responsive"
									/>
								</Form.Item>
								<Form.Item label={t("officialSkillImport.fields.logo")} name="logo">
									<MagicInput
										placeholder={t(
											"officialSkillImport.fields.logoPlaceholder",
										)}
									/>
								</Form.Item>
								<Flex gap={12} wrap="wrap">
									<Form.Item
										name="is_hidden"
										valuePropName="checked"
										style={{ marginBottom: 0 }}
									>
										<Switch
											checkedChildren={t("officialSkillImport.fields.hidden")}
											unCheckedChildren={t(
												"officialSkillImport.fields.visible",
											)}
										/>
									</Form.Item>
									<Form.Item
										name="is_featured"
										valuePropName="checked"
										style={{ marginBottom: 0 }}
									>
										<Switch
											checkedChildren={t(
												"officialSkillImport.fields.featured",
											)}
											unCheckedChildren={t(
												"officialSkillImport.fields.notFeatured",
											)}
										/>
									</Form.Item>
									<Form.Item
										label={t("officialSkillImport.fields.sortOrder")}
										name="sort_order"
										style={{ marginBottom: 0 }}
									>
										<Input type="number" min={0} />
									</Form.Item>
								</Flex>
							</MagicForm>
						</>
					) : null}
				</Flex>
			</MagicModal>
		)
	},
)

export default OfficialSkillImportDialog
