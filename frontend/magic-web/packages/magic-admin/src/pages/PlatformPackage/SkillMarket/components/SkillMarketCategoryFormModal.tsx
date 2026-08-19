import { memo, useEffect, useMemo, useState } from "react"
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
import type { PlatformPackage } from "@admin/types/platformPackage"
import { SkillMarketCategoryStatusMap } from "@admin/types/platformPackage/market"
import { buildSkillCategorySaveParams, flattenSkillCategoryTree } from "../utils"

interface SkillMarketCategoryFormModalProps extends MagicModalProps {
	info?: PlatformPackage.SkillMarketCategoryItem | null
	categories: PlatformPackage.SkillMarketCategoryItem[]
	initialParentId?: string | null
	onSuccess?: () => void
}

type CategoryLangErrorState = Record<"name_i18n", boolean>
type FieldPath = Array<string | number>
type FormValidationError = {
	errorFields?: Array<{
		name?: unknown
	}>
}

const DEFAULT_LANG_ERRORS: CategoryLangErrorState = {
	name_i18n: false,
}

const isSameFieldPath = (name: unknown, path: FieldPath) => {
	if (!Array.isArray(name)) return false
	return path.length === name.length && path.every((item, index) => item === name[index])
}

const getLangErrors = (
	errorFields: FormValidationError["errorFields"] = [],
): CategoryLangErrorState => ({
	name_i18n: errorFields.some((field) => isSameFieldPath(field.name, ["name_i18n", "en_US"])),
})

export const SkillMarketCategoryFormModal = memo(
	({
		info,
		categories,
		initialParentId,
		onCancel,
		onOk,
		onSuccess,
		...rest
	}: SkillMarketCategoryFormModalProps) => {
		const { t } = useTranslation("admin/platform/skillMarket")
		const { t: tCommon } = useTranslation("admin/common")
		const { PlatformPackageApi } = useApis()
		const [form] = Form.useForm()
		const [loading, setLoading] = useState(false)
		const [langErrors, setLangErrors] = useState<CategoryLangErrorState>(DEFAULT_LANG_ERRORS)
		const name = Form.useWatch(["name_i18n"], form)
		const hasChildren = Boolean(info?.children?.length)
		// Keep existing top-level nodes at the root so their children cannot become
		// a third level when the category tree is edited.
		const parentLocked = hasChildren || Boolean(info && String(info.parent_id ?? "0") === "0")

		const parentOptions = useMemo(() => {
			if (parentLocked) return [{ label: t("category.root"), value: "0" }]

			const excludedIds = new Set<string>()
			if (info) {
				excludedIds.add(info.id)
				flattenSkillCategoryTree(info.children ?? []).forEach((category) =>
					excludedIds.add(category.id),
				)
			}

			return [
				{ label: t("category.root"), value: "0" },
				...categories
					.filter(
						(category) =>
							String(category.parent_id ?? "0") === "0" &&
							!excludedIds.has(category.id),
					)
					.map((category) => ({
						label: category.name_i18n?.zh_CN || category.name || category.id,
						value: category.id,
					})),
			]
		}, [categories, info, parentLocked, t])

		const initialValues = useMemo(
			() => ({
				// Category IDs are serialized as strings by the admin API. Normalize the
				// legacy numeric value here so the Select can resolve the current parent.
				parent_id: String(info?.parent_id ?? initialParentId ?? "0"),
				name_i18n: {
					zh_CN: info?.name_i18n?.zh_CN ?? "",
					en_US: info?.name_i18n?.en_US ?? "",
				},
				logo: info?.logo ?? "",
				status: info ? info.status === SkillMarketCategoryStatusMap.visible : true,
				sort_order: info?.sort_order ?? 0,
			}),
			[info, initialParentId],
		)

		useEffect(() => {
			if (!rest.open) return
			form.setFieldsValue(initialValues)
			setLangErrors(DEFAULT_LANG_ERRORS)
		}, [form, initialValues, rest.open])

		const updateLangField = useMemoizedFn((value: Lang) => {
			form.setFieldsValue({
				name_i18n: {
					...form.getFieldValue("name_i18n"),
					...value,
				},
			})
			form.setFields([{ name: ["name_i18n", "en_US"], errors: [] }])
			setLangErrors(DEFAULT_LANG_ERRORS)
		})

		const onInnerCancel = useMemoizedFn((event?: React.MouseEvent<HTMLButtonElement>) => {
			form.resetFields()
			setLangErrors(DEFAULT_LANG_ERRORS)
			if (event) onCancel?.(event)
		})

		const onInnerOk = useMemoizedFn(async (event) => {
			try {
				const values = await form.validateFields()
				setLangErrors(DEFAULT_LANG_ERRORS)
				setLoading(true)
				const payload = buildSkillCategorySaveParams(values)

				if (info?.id) await PlatformPackageApi.updateSkillMarketCategory(info.id, payload)
				else await PlatformPackageApi.createSkillMarketCategory(payload)

				message.success(
					info ? tCommon("message.updateSuccess") : tCommon("message.createSuccess"),
				)
				onOk?.(event)
				onSuccess?.()
			} catch (error) {
				const nextLangErrors = getLangErrors((error as FormValidationError)?.errorFields)
				setLangErrors(nextLangErrors)
				if (nextLangErrors.name_i18n) {
					message.error(tCommon("message.pleaseInputRequiredFields"))
				}
			} finally {
				setLoading(false)
			}
		})

		return (
			<MagicModal
				width={560}
				title={info ? t("category.editTitle") : t("category.addTitle")}
				okText={tCommon("button.save")}
				cancelText={tCommon("button.cancel")}
				onCancel={onInnerCancel}
				onOk={onInnerOk}
				okButtonProps={{ loading }}
				maskClosable={false}
				centered
				destroyOnHidden
				{...rest}
			>
				<MagicForm afterRequiredMask colon={false} form={form}>
					<Form.Item label={t("category.fields.name")} required>
						<Flex gap={10}>
							<Form.Item
								name={["name_i18n", "zh_CN"]}
								noStyle
								rules={[{ required: true, message: "" }]}
							>
								<MagicInput maxLength={100} />
							</Form.Item>
							<Form.Item
								name={["name_i18n", "en_US"]}
								noStyle
								hidden
								rules={[{ required: true, message: "" }]}
							>
								<MagicInput />
							</Form.Item>
							<MultiLangSetting
								required
								supportLangs={[LanguageType.en_US]}
								info={name}
								danger={langErrors.name_i18n}
								onSave={updateLangField}
							/>
						</Flex>
					</Form.Item>
					<Form.Item label={t("category.fields.parent")} name="parent_id">
						<Select disabled={parentLocked} options={parentOptions} />
					</Form.Item>
					<Form.Item label={t("category.fields.logo")} name="logo">
						<MagicInput maxLength={512} />
					</Form.Item>
					<Form.Item label={t("sortOrder")} name="sort_order">
						<InputNumber min={0} precision={0} style={{ width: "100%" }} />
					</Form.Item>
					<Form.Item
						label={t("category.fields.status")}
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
