import { memo, useEffect, useMemo, useState } from "react"
import { Flex, Form, Radio, InputNumber, Switch, message } from "antd"
import { useTranslation } from "react-i18next"
import type { MagicModalProps, Lang } from "@admin-components"
import {
	MagicModal,
	MagicInput,
	MagicForm,
	MultiLangSetting,
	LanguageType,
	UploadButton,
	MagicSelect,
	UserSelect,
} from "@admin-components"
import { useMemoizedFn } from "ahooks"
import { IconChevronDown, IconUpload } from "@tabler/icons-react"
import { NodeType, type TreeNode } from "@dtyq/user-selector"
import useFormChangeDetection from "@admin/hooks/useFormChangeDetection"
import { AppMenu } from "@admin/types/appMenu"
import { useApis } from "@admin/apis"
import { useOpenModal } from "@admin/hooks/useOpenModal"
import { useUpload } from "@admin/hooks/useUpload"
import { genFileData } from "@admin/utils/file"
import { IMAGE_TYPE } from "@admin/const/common"
import type { Upload } from "@admin/types/upload"
import { useOrganizationTree } from "@admin/hooks/useOrganizationTree"
import IconSelectModal from "@admin/pages/PlatformPackage/ModeManagement/components/IconSelectModal"
import { IconComponent } from "@admin/pages/PlatformPackage/ModeManagement/utils"
import { useStyles } from "./styles"

interface AppMenuModalProps extends MagicModalProps {
	info?: AppMenu.MenuItem | null
	saveAppMenu?: (data: AppMenu.SaveParams) => Promise<AppMenu.MenuItem>
	onSuccess?: () => void
}

export const AppMenuModal = memo(
	({ info, saveAppMenu, onCancel, onOk, onSuccess, ...rest }: AppMenuModalProps) => {
		const { styles } = useStyles()
		const { t } = useTranslation("admin/common")

		const { AppMenuApi } = useApis()
		const openModal = useOpenModal()
		const { fetchMagicDepartmentUser, searchUser, organizationInfo } = useOrganizationTree()

		const [form] = Form.useForm()

		const [selectedIcon, setSelectedIcon] = useState<string>("")
		const [imagePreviewUrl, setImagePreviewUrl] = useState<string>("")
		const [selectedVisibilityTargets, setSelectedVisibilityTargets] = useState<TreeNode[]>([])
		const [loading, setLoading] = useState(false)

		const iconTypeValue = Form.useWatch("icon_type", form)
		const nameI18n = Form.useWatch(["name_i18n"], form)
		const visibilityTypeValue = Form.useWatch("visibility_type", form)
		const isOfficialMenu = info?.source_type === AppMenu.SourceTypeMap.official
		const isOverrideOnly = isOfficialMenu

		const searchSelectorUser = useMemoizedFn(async (params) => {
			const result = await searchUser(params)
			return {
				...result,
				items: result.items.map(
					(item) =>
						({
							...item,
							dataType: NodeType.User,
						}) as TreeNode,
				),
			} as any
		})

		const initialFormValues = useMemo(() => {
			if (info) {
				return {
					name_i18n: {
						zh_CN: info.name_i18n?.zh_CN ?? "",
						en_US: info.name_i18n?.en_US ?? "",
					},
					icon_type: info.icon_type ?? AppMenu.IconTypeMap.icon,
					display_scope: AppMenu.DisplayScopeMap.all,
					path: info.path,
					open_method: info.open_method ?? AppMenu.OpenMethodMap.self,
					sort_order: info.sort_order,
					status: info.status === AppMenu.StatusMap.enabled,
					visibility_type:
						info.visibility_config?.visibility_type ??
						AppMenu.VisibilityTypeMap.allMembers,
				}
			}
			return {
				name_i18n: { zh_CN: "", en_US: "" },
				icon_type: AppMenu.IconTypeMap.icon,
				display_scope: AppMenu.DisplayScopeMap.all,
				open_method: AppMenu.OpenMethodMap.self,
				status: false,
				visibility_type: AppMenu.VisibilityTypeMap.allMembers,
			}
		}, [info])

		const { hasChanges, resetChangeDetection } = useFormChangeDetection({
			form,
			initialValues: initialFormValues,
		})

		/** 图标/图片 URL 是否相对打开时发生了变化（仅编辑模式下有意义） */
		const isIconChanged = useMemo(() => {
			if (!info) return true
			return selectedIcon !== (info.icon ?? "") || imagePreviewUrl !== (info.icon_url ?? "")
		}, [info, selectedIcon, imagePreviewUrl])

		const hasAnyChanges = hasChanges || isIconChanged

		const initialVisibilityTargets = useMemo<TreeNode[]>(() => {
			const users =
				info?.visibility_config?.users?.map(
					(user) =>
						({
							...user,
							dataType: NodeType.User,
							id: user.id,
							name: user.nickname || user.name || user.real_name,
							avatar: user.avatar_url || user.avatar,
						}) as TreeNode,
				) ?? []
			const departments =
				info?.visibility_config?.departments?.map(
					(department) =>
						({
							...department,
							dataType: NodeType.Department,
							id: department.id,
							name: department.name || department.department_name,
						}) as TreeNode,
				) ?? []
			return [...users, ...departments]
		}, [info])

		const isVisibilityChanged = useMemo(() => {
			if (isOfficialMenu) return false
			const serialize = (items: TreeNode[]) =>
				items
					.map((item) => `${item.dataType}:${item.id}`)
					.sort()
					.join(",")
			return serialize(selectedVisibilityTargets) !== serialize(initialVisibilityTargets)
		}, [initialVisibilityTargets, isOfficialMenu, selectedVisibilityTargets])

		const hasSubmitChanges = hasAnyChanges || isVisibilityChanged
		const shouldSkipSubmit = info && (isOverrideOnly ? !hasChanges : !hasSubmitChanges)

		useEffect(() => {
			if (rest.open) {
				form.setFieldsValue(initialFormValues)
				setSelectedIcon(info?.icon ?? "")
				setImagePreviewUrl(info?.icon_url ?? "")
				setSelectedVisibilityTargets(initialVisibilityTargets)
			}
		}, [rest.open, initialFormValues, form, info, initialVisibilityTargets])

		const updateNameI18n = useMemoizedFn((value: Lang) => {
			form.setFieldsValue({
				name_i18n: {
					...form.getFieldValue("name_i18n"),
					...value,
				},
			})
		})

		const openMethodOptions = useMemo(
			() => [
				{ label: t("appMenu.openMethod.self"), value: AppMenu.OpenMethodMap.self },
				{ label: t("appMenu.openMethod.blank"), value: AppMenu.OpenMethodMap.blank },
			],
			[t],
		)

		const { uploading, uploadAndGetFileUrl } = useUpload<Upload.FileData>({
			storageType: "public",
		})

		const uploadValidator = (file: File, maxSize = 2): Promise<boolean> => {
			return new Promise((resolve) => {
				if (!IMAGE_TYPE.includes(file.type)) {
					message.error(t("file.onlySupportUploadImage"))
					resolve(false)
					return
				}
				if (file.size / 1024 / 1024 > maxSize) {
					message.error(t("file.imageSizeTooLarge", { size: "2M" }))
					resolve(false)
					return
				}
				const img = new Image()
				const objectUrl = URL.createObjectURL(file)
				img.src = objectUrl
				img.onload = () => {
					URL.revokeObjectURL(objectUrl)
					if (img.width < 28 || img.height < 28) {
						message.error(t("file.imageSizeTooSmall", { width: 28, height: 28 }))
						resolve(false)
					} else {
						resolve(true)
					}
				}
				img.onerror = () => {
					URL.revokeObjectURL(objectUrl)
					message.error(t("file.imageLoadFailed"))
					resolve(false)
				}
			})
		}

		const onFileChange = useMemoizedFn(async (fileList: FileList) => {
			try {
				const newFiles = Array.from(fileList).map(genFileData)
				const { fullfilled } = await uploadAndGetFileUrl(newFiles, uploadValidator)
				if (fullfilled.length) {
					const { url } = fullfilled[0].value
					setImagePreviewUrl(url)
				}
			} catch {
				// upload error is handled by uploadAndGetFileUrl internally
			}
		})

		const handleIconSelect = useMemoizedFn((key: string) => {
			setSelectedIcon((prev) => (prev === key ? "" : key))
		})

		const openIconSelectModal = useMemoizedFn(() => {
			openModal(IconSelectModal, {
				selectedIcon,
				handleIconSelect,
				closeOnSelect: true,
			})
		})

		const onInnerCancel = useMemoizedFn((e?: React.MouseEvent<HTMLButtonElement>) => {
			form.resetFields()
			onCancel?.(e!)
		})

		const onInnerOk = useMemoizedFn(async (e) => {
			// 编辑模式下，内容未变化时直接关闭，不发起请求
			if (shouldSkipSubmit) {
				onOk?.(e)
				return
			}

			if (isOverrideOnly) {
				try {
					setLoading(true)
					const values = await form.validateFields(["sort_order", "status"])
					await (saveAppMenu ?? AppMenuApi.saveOrganizationAppMenu)({
						id: info?.id,
						override_only: true,
						sort_order: values.sort_order,
						status: values.status
							? AppMenu.StatusMap.enabled
							: AppMenu.StatusMap.disabled,
					})
					message.success(t("message.updateSuccess"))
					onOk?.(e)
					onSuccess?.()
				} catch {
					// errors are handled by the API layer
				} finally {
					setLoading(false)
				}
				return
			}

			const currentNameI18n = form.getFieldValue("name_i18n")
			if (!currentNameI18n?.en_US) {
				message.error(t("appMenu.pleaseInputEnglishName"))
				return
			}

			if (iconTypeValue === AppMenu.IconTypeMap.icon && !selectedIcon) {
				message.error(t("appMenu.pleaseSelectIcon"))
				return
			}
			if (iconTypeValue === AppMenu.IconTypeMap.image && !imagePreviewUrl) {
				message.error(t("appMenu.pleaseUploadImage"))
				return
			}
			if (
				visibilityTypeValue === AppMenu.VisibilityTypeMap.specified &&
				selectedVisibilityTargets.length === 0
			) {
				message.error(t("appMenu.pleaseSelectVisibilityTarget"))
				return
			}

			try {
				setLoading(true)
				const values = await form.validateFields()
				const visibilityUsers = selectedVisibilityTargets
					.filter((item) => item.dataType === NodeType.User)
					.map((item) => ({ id: item.id }))
				const visibilityDepartments = selectedVisibilityTargets
					.filter((item) => item.dataType === NodeType.Department)
					.map((item) => ({ id: item.id }))
				const params: AppMenu.SaveParams = {
					id: info?.id,
					name_i18n: values.name_i18n,
					icon_type: values.icon_type,
					icon: values.icon_type === AppMenu.IconTypeMap.icon ? selectedIcon : undefined,
					icon_url:
						values.icon_type === AppMenu.IconTypeMap.image
							? imagePreviewUrl
							: undefined,
					path: values.path,
					open_method: values.open_method,
					sort_order: values.sort_order,
					display_scope: AppMenu.DisplayScopeMap.all,
					status: values.status ? AppMenu.StatusMap.enabled : AppMenu.StatusMap.disabled,
					visibility_config: {
						visibility_type: values.visibility_type,
						users:
							values.visibility_type === AppMenu.VisibilityTypeMap.specified
								? visibilityUsers
								: [],
						departments:
							values.visibility_type === AppMenu.VisibilityTypeMap.specified
								? visibilityDepartments
								: [],
					},
				}

				await (saveAppMenu ?? AppMenuApi.saveOrganizationAppMenu)(params)
				message.success(info ? t("message.updateSuccess") : t("message.createSuccess"))
				onOk?.(e)
				onSuccess?.()
			} catch {
				// errors are handled by the API layer
			} finally {
				setLoading(false)
			}
		})

		const afterClose = useMemoizedFn(() => {
			form.resetFields()
			setSelectedIcon("")
			setImagePreviewUrl("")
			setSelectedVisibilityTargets([])
			resetChangeDetection()
		})

		return (
			<MagicModal
				width={600}
				title={
					isOverrideOnly
						? t("appMenu.displaySetting")
						: info
							? t("appMenu.editMenu")
							: t("appMenu.addMenu")
				}
				okText={t("button.save")}
				cancelText={t("button.cancel")}
				onCancel={onInnerCancel}
				onOk={onInnerOk}
				afterClose={afterClose}
				okButtonProps={{
					loading,
				}}
				centered
				destroyOnHidden
				{...rest}
			>
				<MagicForm className={styles.form} afterRequiredMask colon={false} form={form}>
					{isOverrideOnly ? null : (
						<>
							<Form.Item label={t("appMenu.name")} required>
								<Flex gap={10}>
									<Form.Item
										name={["name_i18n", "zh_CN"]}
										noStyle
										rules={[
											{
												required: true,
												message: t("pleaseInputPlaceholder", {
													name: t("appMenu.name"),
												}),
											},
										]}
									>
										<MagicInput
											placeholder={t("appMenu.namePlaceholder")}
											maxLength={100}
										/>
									</Form.Item>
									<Form.Item name={["name_i18n", "en_US"]} noStyle hidden>
										<MagicInput />
									</Form.Item>
									<MultiLangSetting
										required
										supportLangs={[LanguageType.en_US]}
										info={nameI18n}
										onSave={updateNameI18n}
									/>
								</Flex>
							</Form.Item>

							<Form.Item label={t("appMenu.icon")} required>
								<Flex vertical gap={6}>
									<Form.Item name="icon_type" noStyle>
										<Radio.Group
											options={[
												{
													label: t("appMenu.iconType.icon"),
													value: AppMenu.IconTypeMap.icon,
												},
												{
													label: t("appMenu.iconType.image"),
													value: AppMenu.IconTypeMap.image,
												},
											]}
										/>
									</Form.Item>
									{iconTypeValue === AppMenu.IconTypeMap.icon ? (
										<div
											role="button"
											tabIndex={0}
											aria-label={t("appMenu.icon")}
											className={styles.iconSelectBtn}
											onClick={openIconSelectModal}
											onKeyDown={(e) =>
												e.key === "Enter" && openIconSelectModal()
											}
										>
											{selectedIcon ? (
												IconComponent(selectedIcon, 26)
											) : (
												<div>{t("appMenu.clickToSelect")}</div>
											)}
											<IconChevronDown size={16} />
										</div>
									) : (
										<Flex gap={10} align="center">
											<UploadButton
												loading={uploading}
												onFileChange={onFileChange}
												icon={<IconUpload size={20} />}
												multiple={false}
												type="default"
											>
												{t("button.upload")}
											</UploadButton>
											{imagePreviewUrl && (
												<img
													src={imagePreviewUrl}
													alt="icon preview"
													style={{
														width: 32,
														height: 32,
														objectFit: "contain",
														borderRadius: 4,
													}}
													draggable={false}
												/>
											)}
										</Flex>
									)}
								</Flex>
							</Form.Item>

							<Form.Item
								label={t("appMenu.path")}
								name="path"
								required
								rules={[
									{
										required: true,
										message: t("pleaseInputPlaceholder", {
											name: t("appMenu.path"),
										}),
									},
								]}
							>
								<MagicInput
									placeholder={t("appMenu.pathPlaceholder")}
									maxLength={255}
								/>
							</Form.Item>

							<Form.Item label={t("appMenu.openMethod")} name="open_method" required>
								<MagicSelect options={openMethodOptions} />
							</Form.Item>
							<Form.Item
								label={t("appMenu.entryVisibility")}
								name="visibility_type"
								required
							>
								<Radio.Group
									options={[
										{
											label: t("appMenu.entryVisibilityOptions.allMembers"),
											value: AppMenu.VisibilityTypeMap.allMembers,
										},
										{
											label: t("appMenu.entryVisibilityOptions.specified"),
											value: AppMenu.VisibilityTypeMap.specified,
										},
									]}
								/>
							</Form.Item>
							{visibilityTypeValue === AppMenu.VisibilityTypeMap.specified && (
								<UserSelect
									selected={selectedVisibilityTargets}
									setSelected={setSelectedVisibilityTargets}
									placeholder={t("pleaseSelectPlaceholder", {
										name: t("appMenu.visibilityTarget"),
									})}
									departmentSelectorProps={{
										onFetchData: fetchMagicDepartmentUser,
										searchUser: searchSelectorUser,
										organization: organizationInfo,
									}}
									formItemProps={{
										label: t("appMenu.visibilityTarget"),
									}}
								/>
							)}
						</>
					)}

					<Form.Item
						label={t("appMenu.sortOrder")}
						name="sort_order"
						extra={t("appMenu.sortOrderTip")}
					>
						<InputNumber
							style={{ width: "100%" }}
							placeholder={t("appMenu.sortOrderPlaceholder")}
							min={0}
						/>
					</Form.Item>

					<Form.Item label={t("appMenu.status")} name="status" valuePropName="checked">
						<Switch />
					</Form.Item>
				</MagicForm>
			</MagicModal>
		)
	},
)
