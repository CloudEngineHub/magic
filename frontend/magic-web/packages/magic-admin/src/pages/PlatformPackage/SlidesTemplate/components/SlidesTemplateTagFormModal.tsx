import { memo, useEffect, useMemo, useState } from "react"
import { Flex, Form, InputNumber, Select, Switch, message } from "antd"
import { createStyles } from "antd-style"
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
import { SlidesTemplate } from "@admin/types/slidesTemplate"
import {
	SLIDES_TEMPLATE_TAG_CODE_PATTERN,
	SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN,
	buildSlidesTemplateTagSaveParams,
	isSystemSlidesTemplateTagGroup,
} from "../utils"

interface SlidesTemplateTagFormModalProps extends MagicModalProps {
	info?: SlidesTemplate.TagItem | null
	nodeType: SlidesTemplate.TagNodeType
	parentGroup?: SlidesTemplate.TagItem | null
	onSuccess?: (tag: SlidesTemplate.TagItem) => void
}

type TagLangErrorState = Record<"name_i18n", boolean>
type FieldPath = Array<string | number>
type FormValidationError = {
	errorFields?: Array<{
		name?: unknown
	}>
}

const DEFAULT_LANG_ERRORS: TagLangErrorState = {
	name_i18n: false,
}

const useStyles = createStyles(() => ({
	codeFormItem: {
		// Ant Design 默认会同时显示 extra 和错误信息；校验失败时只保留错误信息。
		"&.ant-form-item-has-error .ant-form-item-extra": {
			display: "none",
		},
	},
}))

const getSelectPopupContainer = (triggerNode: HTMLElement): HTMLElement =>
	(triggerNode.closest(".ant-modal-wrap") as HTMLElement | null) ?? document.body

const isSameFieldPath = (name: unknown, path: FieldPath) => {
	if (!Array.isArray(name)) return false
	return path.length === name.length && path.every((item, index) => item === name[index])
}

const getLangErrors = (
	errorFields: FormValidationError["errorFields"] = [],
): TagLangErrorState => ({
	name_i18n: errorFields.some((field) => isSameFieldPath(field.name, ["name_i18n", "en_US"])),
})

export const SlidesTemplateTagFormModal = memo(
	({
		info,
		nodeType,
		parentGroup,
		onCancel,
		onOk,
		onSuccess,
		...rest
	}: SlidesTemplateTagFormModalProps) => {
		const { t } = useTranslation("admin/common")
		const { styles } = useStyles()
		const { SlidesTemplateApi } = useApis()
		const [form] = Form.useForm()
		const [loading, setLoading] = useState(false)
		const [groups, setGroups] = useState<SlidesTemplate.TagItem[]>([])
		const [langErrors, setLangErrors] = useState<TagLangErrorState>(DEFAULT_LANG_ERRORS)
		const name = Form.useWatch(["name_i18n"], form)
		const effectiveNodeType = info?.node_type ?? nodeType
		const isGroup = effectiveNodeType === "group"
		const isSystemGroup = Boolean(info && isSystemSlidesTemplateTagGroup(info))
		const codeHint = isGroup
			? t("slidesTemplate.tag.groupCodeHint")
			: t("slidesTemplate.tag.codeHint")
		const codeRuleMessage = isGroup
			? t("slidesTemplate.tag.groupCodeRule")
			: t("slidesTemplate.tag.codeRule")
		const modalTitle = info
			? isGroup
				? t("slidesTemplate.tag.editGroupTitle")
				: t("slidesTemplate.tag.editTitle")
			: isGroup
				? t("slidesTemplate.tag.addGroupTitle")
				: t("slidesTemplate.tag.addTitle")

		const initialValues = useMemo(
			() => ({
				code: info?.code ?? "",
				node_type: effectiveNodeType,
				parent_id: isGroup ? 0 : (info?.parent_id ?? parentGroup?.id),
				name_i18n: {
					zh_CN: info?.name_i18n?.zh_CN ?? "",
					en_US: info?.name_i18n?.en_US ?? "",
				},
				status: info ? info.status === SlidesTemplate.StatusMap.enabled : true,
				sort: info?.sort ?? 0,
			}),
			[effectiveNodeType, info, isGroup, parentGroup?.id],
		)

		useEffect(() => {
			if (!rest.open) return
			form.setFieldsValue(initialValues)
			setLangErrors(DEFAULT_LANG_ERRORS)
		}, [form, initialValues, rest.open])

		const loadGroups = useMemoizedFn(() => {
			return SlidesTemplateApi.tag
				.tree()
				.then((tree) => setGroups(tree))
				.catch((error) => {
					console.error("Failed to fetch slides template tag tree", error)
					setGroups([])
				})
		})

		useEffect(() => {
			if (!rest.open || isGroup) return

			loadGroups()
		}, [isGroup, loadGroups, rest.open])

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
				const payload = buildSlidesTemplateTagSaveParams(values)
				const savedTag = info?.id
					? await SlidesTemplateApi.tag.update(info.id, payload)
					: await SlidesTemplateApi.tag.create(payload)

				message.success(info ? t("message.updateSuccess") : t("message.createSuccess"))
				onOk?.(e)
				onSuccess?.(savedTag)
			} catch (error) {
				const nextLangErrors = getLangErrors((error as FormValidationError)?.errorFields)
				setLangErrors(nextLangErrors)
				if (nextLangErrors.name_i18n) {
					message.error(t("message.pleaseInputRequiredFields"))
				}
			} finally {
				setLoading(false)
			}
		})

		return (
			<MagicModal
				width={560}
				title={modalTitle}
				okText={t("button.save")}
				cancelText={t("button.cancel")}
				onCancel={onInnerCancel}
				onOk={onInnerOk}
				okButtonProps={{ loading }}
				maskClosable={false}
				centered
				destroyOnHidden
				{...rest}
			>
				<MagicForm afterRequiredMask colon={false} form={form}>
					<Form.Item name="node_type" hidden>
						<MagicInput />
					</Form.Item>
					<Form.Item
						className={styles.codeFormItem}
						extra={codeHint}
						label={t("slidesTemplate.tag.fields.code")}
						name="code"
						rules={[
							{ required: true, message: "" },
							{
								pattern: isGroup
									? SLIDES_TEMPLATE_TAG_GROUP_CODE_PATTERN
									: SLIDES_TEMPLATE_TAG_CODE_PATTERN,
								message: codeRuleMessage,
							},
						]}
					>
						<MagicInput disabled={isSystemGroup} maxLength={64} />
					</Form.Item>
					{!isGroup ? (
						<Form.Item
							label={t("slidesTemplate.tag.fields.parent")}
							name="parent_id"
							rules={[{ required: true, message: "" }]}
						>
							<Select
								getPopupContainer={getSelectPopupContainer}
								options={groups.map((group) => ({
									label:
										group.name_i18n.zh_CN ||
										group.name_i18n.en_US ||
										group.code,
									value: group.id,
								}))}
							/>
						</Form.Item>
					) : null}
					<Form.Item label={t("slidesTemplate.tag.fields.name")} required>
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
								clickToToggle
								supportLangs={[LanguageType.en_US]}
								info={name}
								danger={langErrors.name_i18n}
								onSave={updateLangField}
							/>
						</Flex>
					</Form.Item>
					<Form.Item label={t("slidesTemplate.tag.fields.sort")} name="sort">
						<InputNumber style={{ width: "100%" }} />
					</Form.Item>
					<Form.Item
						label={t("slidesTemplate.tag.fields.status")}
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
