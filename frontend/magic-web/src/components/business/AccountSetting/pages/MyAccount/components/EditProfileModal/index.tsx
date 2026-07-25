import { memo, useEffect, useMemo, useState } from "react"
import { useBoolean, useMemoizedFn, useUpdateEffect } from "ahooks"
import { observer } from "mobx-react-lite"
import { Input, Spin } from "antd"
import { IconUpload } from "@tabler/icons-react"
import { useTranslation } from "react-i18next"
import { MagicUserApi } from "@/apis"
import MagicAvatar from "@/components/base/MagicAvatar"
import MagicButton from "@/components/base/MagicButton"
import MagicModal from "@/components/base/MagicModal"
import UploadAction from "@/components/base/UploadAction"
import { useUserInfo } from "@/models/user/hooks"
import { useAvatarUpload } from "@/components/settings/UserAvatar/hooks/useAvatarUpload"
import { service } from "@/services"
import type { UserService } from "@/services/user/UserService"
import SettingStore from "@/stores/setting"
import magicToast from "@/components/base/MagicToaster/utils"

interface EditProfileModalProps {
	open?: boolean
	onClose?: () => void
}

function EditProfileModal({ open: openProp, onClose }: EditProfileModalProps) {
	const { t } = useTranslation("accountSetting")
	const { t: tInterface } = useTranslation("interface")
	const { userInfo } = useUserInfo()
	const [open, { setTrue, setFalse }] = useBoolean(openProp ?? false)
	const [nickname, setNickname] = useState(userInfo?.nickname ?? "")
	const [avatarUrl, setAvatarUrl] = useState(userInfo?.avatar ?? "")
	const [isSaving, setIsSaving] = useState(false)
	const [hasChanges, setHasChanges] = useState(false)
	const { canUpdateAvatar, canUpdateNickname } = SettingStore
	const { uploadAvatar, isUploading } = useAvatarUpload()

	useEffect(() => {
		if (!open || !userInfo) return
		setNickname(userInfo.nickname ?? "")
		setAvatarUrl(userInfo.avatar ?? "")
		setHasChanges(false)
	}, [open, userInfo])

	useEffect(() => {
		if (openProp === undefined) return
		if (openProp) setTrue()
		else setFalse()
	}, [openProp, setFalse, setTrue])

	useUpdateEffect(() => {
		setHasChanges(nickname !== (userInfo?.nickname ?? ""))
	}, [nickname, userInfo])

	useEffect(() => {
		if (!userInfo?.avatar || !open) return
		setAvatarUrl(userInfo.avatar)
	}, [open, userInfo?.avatar])

	const handleFileChange = useMemoizedFn(async (files: FileList | File[]) => {
		if (!canUpdateAvatar) return
		await uploadAvatar(files)
	})

	const handleSave = useMemoizedFn(async () => {
		if (!hasChanges || !canUpdateNickname) {
			setFalse()
			onClose?.()
			return
		}

		setIsSaving(true)
		try {
			if (nickname !== (userInfo?.nickname ?? "")) {
				await MagicUserApi.updateUserInfo({ nickname })
				await service.get<UserService>("userService").refreshUserInfo()
				magicToast.success(tInterface("setting.updateNickname.success"))
			}
			setFalse()
			onClose?.()
		} catch (error) {
			console.error("Failed to update user profile:", error)
			magicToast.error(tInterface("setting.updateNickname.failed"))
		} finally {
			setIsSaving(false)
		}
	})

	const handleCancel = useMemoizedFn(() => {
		setFalse()
		onClose?.()
	})

	const uploadHandler = useMemoizedFn((onUpload: () => void) => {
		return (
			<button
				type="button"
				className="flex h-8 cursor-pointer items-center justify-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm leading-5 text-muted-foreground transition-all duration-200 hover:border-primary hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-border disabled:hover:bg-background"
				onClick={onUpload}
				disabled={!canUpdateAvatar || isUploading}
				data-testid="account-setting-upload-avatar-button"
			>
				<IconUpload size={20} />
				<span>{tInterface("setting.uploadAvatar.title")}</span>
			</button>
		)
	})

	const footer = useMemo(
		() => (
			<div className="flex w-full justify-end gap-2.5">
				<MagicButton
					onClick={handleCancel}
					disabled={isSaving}
					data-testid="account-setting-edit-profile-cancel-button"
				>
					{t("cancel") || tInterface("button.cancel")}
				</MagicButton>
				<MagicButton
					type="primary"
					onClick={handleSave}
					loading={isSaving}
					disabled={!canUpdateNickname || !hasChanges}
					data-testid="account-setting-edit-profile-save-button"
				>
					{t("save") || tInterface("button.save") || tInterface("common.confirm")}
				</MagicButton>
			</div>
		),
		[canUpdateNickname, handleCancel, handleSave, hasChanges, isSaving, t, tInterface],
	)

	return (
		<MagicModal
			width={400}
			title={t("editProfile")}
			open={open}
			onCancel={handleCancel}
			centered
			footer={footer}
			maskClosable={!isSaving}
			data-testid="account-setting-edit-profile-modal"
		>
			<div className="flex w-full flex-col gap-6">
				<div className="flex w-full flex-col items-center gap-2.5 rounded-lg border border-border p-5">
					<div className="relative flex size-16 items-center justify-center p-1">
						<MagicAvatar src={avatarUrl} size={64}>
							{userInfo?.nickname}
						</MagicAvatar>
						{isUploading ? (
							<div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
								<Spin size="small" />
							</div>
						) : null}
					</div>
					<UploadAction
						handler={uploadHandler}
						onFileChange={handleFileChange}
						multiple={false}
						accept="image/*"
						disabled={!canUpdateAvatar}
					/>
				</div>

				<div className="flex w-full flex-col gap-2">
					<label className="text-sm leading-5 text-muted-foreground">
						{t("username") || "用户名"}
					</label>
					<div className="w-full">
						<Input
							className="h-10 w-full rounded-lg border border-input px-3 text-base leading-[22px] text-foreground transition-colors hover:border-ring focus:border-primary focus:outline-none"
							value={nickname}
							onChange={(event) => setNickname(event.target.value)}
							placeholder={
								t("usernamePlaceholder") ||
								tInterface("setting.nickNamePlaceholder")
							}
							disabled={!canUpdateNickname || isSaving}
							data-testid="account-setting-nickname-input"
						/>
					</div>
				</div>
			</div>
		</MagicModal>
	)
}

export default memo(observer(EditProfileModal))
