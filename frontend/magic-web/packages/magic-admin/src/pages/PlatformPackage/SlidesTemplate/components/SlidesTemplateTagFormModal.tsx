import { memo, useEffect, useMemo, useState } from "react"
import { Flex, Form, InputNumber, Switch, message } from "antd"
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
import { buildSlidesTemplateTagSaveParams } from "../utils"

interface SlidesTemplateTagFormModalProps extends MagicModalProps {
	info?: SlidesTemplate.TagItem | null
	onSuccess?: () => void
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
const TAG_CODE_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/

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
	({ info, onCancel, onOk, onSuccess, ...rest }: SlidesTemplateTagFormModalProps) => {
		const { t } = useTranslation("admin/common")
		const { SlidesTemplateApi } = useApis()
		const [form] = Form.useForm()
		const [loading, setLoading] = useState(false)
		const [langErrors, setLangErrors] = useState<TagLangErrorState>(DEFAULT_LANG_ERRORS)
		const name = Form.useWatch(["name_i18n"], form)

		const initialValues = useMemo(
			() => ({
				code: info?.code ?? "",
				name_i18n: {
					zh_CN: info?.name_i18n?.zh_CN ?? "",
					en_US: info?.name_i18n?.en_US ?? "",
				},
				status: info ? info.status === SlidesTemplate.StatusMap.enabled : true,
				sort: info?.sort ?? 0,
			}),
			[info],
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

				if (info?.id) await SlidesTemplateApi.tag.update(info.id, payload)
				else await SlidesTemplateApi.tag.create(payload)

				message.success(info ? t("message.updateSuccess") : t("message.createSuccess"))
				onOk?.(e)
				onSuccess?.()
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
				title={info ? t("slidesTemplate.tag.editTitle") : t("slidesTemplate.tag.addTitle")}
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
					<Form.Item
						label={t("slidesTemplate.tag.fields.code")}
						name="code"
						rules={[
							{ required: true, message: "" },
							{
								pattern: TAG_CODE_PATTERN,
								message: t("slidesTemplate.tag.codeRule"),
							},
						]}
					>
						<MagicInput maxLength={64} />
					</Form.Item>
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
