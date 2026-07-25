import { memo, useEffect, useState } from "react"
import type { DefaultOptionType, SelectProps } from "antd/es/select"
import { useMemoizedFn } from "ahooks"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import { IconSitemap, IconUsers } from "@tabler/icons-react"
import type { FormInstance, FormItemProps } from "antd"
import { Flex, Form, Tag } from "antd"
import MagicAvatar from "../MagicAvatar"
import type { MagicSelectProps } from "../MagicSelect"
import MagicSelect from "../MagicSelect"
import MemberDepartmentSelector from "../MemberDepartmentSelector"
import { useAdminComponents } from "../AdminComponentsProvider"
import type { MemberDepartmentSelectorProps } from "../MemberDepartmentSelector"
import { useStyles } from "./style"

export type DataSource = "Magic" | "Teamshare"

export interface UserSelectProps extends MagicSelectProps {
	/** 表单实例 */
	form?: FormInstance
	/** 占位符 */
	placeholder?: string
	/** 数据源, 默认是 Magic */
	dataSource?: DataSource
	/** 选中值 */
	selected: TreeNode[]
	/** 设置选中值 */
	setSelected: (selected: TreeNode[]) => void
	/** 成员选择器属性 */
	departmentSelectorProps?: MemberDepartmentSelectorProps
	/** 表单项标签 */
	formItemProps?: FormItemProps
	/** 成员选择弹层打开时触发（与组织架构等在打开时请求数据对齐） */
	onDepartmentSelectorOpen?: () => void
}

type TagRender = SelectProps["tagRender"]

const UserSelect = memo(
	({
		form,
		selected,
		setSelected,
		dataSource = "Magic",
		placeholder,
		disabled,
		departmentSelectorProps,
		formItemProps,
		onDepartmentSelectorOpen,
		...props
	}: UserSelectProps) => {
		const { styles } = useStyles()

		const { getLocale } = useAdminComponents()
		const locale = getLocale("UserSelect")

		const [open, setOpen] = useState(false)
		const [draftSelected, setDraftSelected] = useState(selected)
		const [optionValues, setOptionValues] = useState<DefaultOptionType[]>([])

		const transformTag = useMemoizedFn((data: TreeNode[]) => {
			return data?.map((item) => {
				let avatar: React.ReactNode = null
				if (item.dataType === NodeType.User) {
					avatar = (
						<MagicAvatar src={item.avatar_url || item.avatar} size={18}>
							{item.name || item.real_name}
						</MagicAvatar>
					)
				} else if (item.dataType === NodeType.Department) {
					avatar = (
						<MagicAvatar
							className={styles.avatar}
							size={18}
							src={<IconSitemap size={14} />}
						>
							{item.name}
						</MagicAvatar>
					)
				} else if (item.dataType === NodeType.UserGroup) {
					avatar = (
						<MagicAvatar
							className={styles.avatar}
							size={18}
							src={<IconUsers size={14} />}
						>
							{item.name}
						</MagicAvatar>
					)
				} else if (item.dataType === NodeType.Partner) {
					avatar = (
						<MagicAvatar size={18} src={item.avatar_url || item.avatar}>
							{item.name || item.real_name}
						</MagicAvatar>
					)
				}

				const label = (
					<Flex gap={4} align="center">
						{avatar}
						<div>{item.name || item.real_name}</div>
					</Flex>
				)
				const value =
					item.dataType === NodeType.Partner
						? String((item as TreeNode & { user_id?: string }).user_id ?? item.id)
						: item.id

				return {
					label,
					value,
				}
			})
		})

		const onOk = useMemoizedFn((data: TreeNode[]) => {
			setDraftSelected(data)
			departmentSelectorProps?.onOk?.(data)
			setOpen(false)
			setSelected(data)
		})

		const onCancel = useMemoizedFn(() => {
			setDraftSelected(selected)
			setOpen(false)
		})

		useEffect(() => {
			setDraftSelected(selected)
		}, [selected])

		useEffect(() => {
			if (!open) return
			onDepartmentSelectorOpen?.()
		}, [open, onDepartmentSelectorOpen])

		const onTagClose = useMemoizedFn((value: string) => {
			const newSelected = selected.filter((item) => {
				if (item.dataType === NodeType.Partner) {
					const key = String((item as TreeNode & { user_id?: string }).user_id ?? item.id)
					return key !== value
				}
				return item.id !== value
			})
			setSelected(newSelected)
		})

		const defaultTagRender: TagRender = (option) => {
			const { label, value, closable, onClose } = option
			const onPreventMouseDown = (event: React.MouseEvent<HTMLSpanElement>) => {
				event.preventDefault()
				event.stopPropagation()
			}
			const onInnerClose = () => {
				onClose?.()
				onTagClose?.(value)
			}

			return (
				<Tag
					key={value}
					className={styles.tag}
					closable={closable}
					onClose={onInnerClose}
					onMouseDown={onPreventMouseDown}
					bordered={false}
				>
					{label}
				</Tag>
			)
		}

		useEffect(() => {
			const newOptionValues = transformTag(selected)
			if (form) {
				form.setFieldsValue({
					[formItemProps?.name]: newOptionValues,
				})
			} else {
				setOptionValues(newOptionValues)
			}
		}, [selected, transformTag, form, formItemProps?.name])

		return (
			<>
				<Form.Item {...formItemProps}>
					<MagicSelect
						placeholder={placeholder ?? locale.addMember}
						onClick={() => !disabled && setOpen(true)}
						open={false}
						value={optionValues}
						tagRender={defaultTagRender}
						mode="tags"
						disabled={disabled}
						{...props}
					/>
				</Form.Item>
				{/* Magic 数据源 */}
				{dataSource === "Magic" && open && (
					<MemberDepartmentSelector
						open={open}
						selectedValues={draftSelected}
						onSelectChange={setDraftSelected}
						onCancel={onCancel}
						{...departmentSelectorProps}
						onOk={onOk}
					/>
				)}
			</>
		)
	},
)

export default UserSelect
