import type { ChangeEventHandler, RefObject } from "react"
import { Copy, ImagePlus, Loader2, RefreshCw, Rocket, Trash2, X } from "lucide-react"
import { useTranslation } from "react-i18next"

import type { PublishedMicroAppProjectItem } from "@/apis/modules/superMagic"
import { Button } from "@/components/shadcn-ui/button"
import { Input } from "@/components/shadcn-ui/input"
import { Label } from "@/components/shadcn-ui/label"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { Separator } from "@/components/shadcn-ui/separator"
import { cn } from "@/lib/utils"
import {
	ShareRangeField,
	ShareTypeField,
	type ShareRange,
	type ShareTarget,
} from "@/pages/superMagic/components/Share/ShareFields"
import { ShareType } from "@/pages/superMagic/components/Share/types"

import type {
	MicroAppPublishFormState,
	MicroAppPublishValidationError,
} from "./microAppPublishDialogUtils"

interface MicroAppPublishDialogContentProps {
	mobile: boolean
	appId?: string
	formState: MicroAppPublishFormState
	publishedItem: PublishedMicroAppProjectItem | null
	publishedAtText: string
	accessUrl: string
	hasPublished: boolean
	loading: boolean
	saving: boolean
	unpublishing: boolean
	coverUploading: boolean
	coverUploadError: boolean
	validationError: MicroAppPublishValidationError | null
	validationMessage: string
	coverInputRef: RefObject<HTMLInputElement | null>
	onAppNameChange: ChangeEventHandler<HTMLInputElement>
	onCoverChange: ChangeEventHandler<HTMLInputElement>
	onClearCover: () => void
	onShareTypeChange: (shareType: ShareType) => void
	onShareRangeChange: (shareRange: ShareRange) => void
	onTargetsChange: (targets: ShareTarget[]) => void
	onPasswordChange: ChangeEventHandler<HTMLInputElement>
	onPasswordReset: () => void
	onCopyAccessUrl: () => void
	onCopyShareText: () => void
	onUnpublish: () => void
	onClose: () => void
	onSave: () => void
}

const MICRO_APP_PUBLISH_TYPES = [
	ShareType.Organization,
	ShareType.Public,
	ShareType.PasswordProtected,
]

/** 发布表单展示层，桌面弹窗和移动端底部弹窗共用同一份字段与操作。 */
export default function MicroAppPublishDialogContent({
	mobile,
	appId,
	formState,
	publishedItem,
	publishedAtText,
	accessUrl,
	hasPublished,
	loading,
	saving,
	unpublishing,
	coverUploading,
	coverUploadError,
	validationError,
	validationMessage,
	coverInputRef,
	onAppNameChange,
	onCoverChange,
	onClearCover,
	onShareTypeChange,
	onShareRangeChange,
	onTargetsChange,
	onPasswordChange,
	onPasswordReset,
	onCopyAccessUrl,
	onCopyShareText,
	onUnpublish,
	onClose,
	onSave,
}: MicroAppPublishDialogContentProps) {
	const { t } = useTranslation("super")
	const isBusy = saving || unpublishing || coverUploading

	return (
		<div
			className={cn(
				mobile
					? "flex min-h-0 flex-1 flex-col overflow-hidden"
					: "grid max-h-[80dvh] min-h-0 grid-rows-[minmax(0,1fr)_auto_auto] gap-4",
			)}
			data-testid="micro-app-publish-dialog"
			data-mobile={mobile ? "true" : undefined}
		>
			<ScrollArea
				className={cn("min-h-0", mobile ? "flex-1 px-4" : "pr-1")}
				viewportClassName="touch-pan-y [&>div]:!block"
				data-testid="micro-app-publish-scroll-area"
			>
				<div className={cn("flex flex-col gap-4", mobile && "pb-5 pt-1")}>
					<div
						className="rounded-lg border border-border bg-muted/30 p-3"
						data-testid="micro-app-publish-basic-settings"
					>
						<div>
							<Label htmlFor="micro-app-publish-project-name">
								{t("microAppPage.publish.projectName")}
							</Label>
							<Input
								id="micro-app-publish-project-name"
								value={formState.appName}
								onChange={onAppNameChange}
								maxLength={100}
								className={cn("mt-2 bg-background", mobile ? "h-11" : "h-9")}
								data-testid="micro-app-publish-project-name"
							/>
							<p className="mt-1 text-xs text-muted-foreground">
								{t("microAppPage.publish.description")}
							</p>
						</div>

						<div className="mt-4">
							<div className="flex items-center justify-between gap-3">
								<div>
									<Label>{t("microAppPage.publish.cover")}</Label>
									<p className="mt-1 text-xs text-muted-foreground">
										{t("microAppPage.publish.coverDescription")}
									</p>
								</div>
								<div className="flex shrink-0 items-center gap-2">
									<input
										ref={coverInputRef}
										type="file"
										accept="image/*"
										className="hidden"
										onChange={onCoverChange}
										data-testid="micro-app-cover-input"
									/>
									<Button
										type="button"
										variant="outline"
										size="sm"
										onClick={() => coverInputRef.current?.click()}
										disabled={coverUploading || loading || saving}
										data-testid="micro-app-cover-upload"
									>
										{coverUploading ? (
											<Loader2 className="mr-1.5 size-3.5 animate-spin" />
										) : (
											<ImagePlus className="mr-1.5 size-3.5" />
										)}
										{t("microAppPage.publish.coverUpload")}
									</Button>
									{formState.coverFileKey !== undefined || formState.coverUrl ? (
										<Button
											type="button"
											variant="ghost"
											size="icon"
											className="size-8 text-muted-foreground"
											onClick={onClearCover}
											aria-label={t("microAppPage.publish.coverClear")}
											data-testid="micro-app-cover-clear"
										>
											<X className="size-4" />
										</Button>
									) : null}
								</div>
							</div>
							<div className="mt-3 overflow-hidden rounded-md border border-border bg-background">
								{formState.coverUrl ? (
									<img
										src={formState.coverUrl}
										alt=""
										className={cn(
											"w-full object-cover",
											mobile ? "h-32" : "h-28",
										)}
										data-testid="micro-app-cover-preview"
									/>
								) : (
									<div className="flex h-20 items-center justify-center text-xs text-muted-foreground">
										{formState.coverFileKey
											? t("microAppPage.publish.coverSet")
											: t("microAppPage.publish.coverEmpty")}
									</div>
								)}
							</div>
						</div>
					</div>

					{loading ? (
						<div
							className="flex min-h-48 items-center justify-center text-muted-foreground"
							data-testid="micro-app-publish-loading"
						>
							<Loader2 className="size-6 animate-spin" />
						</div>
					) : (
						<>
							{hasPublished ? (
								<div className="rounded-lg border border-border p-3">
									<div className="flex items-center gap-2">
										<Rocket className="size-4 text-primary" />
										<p className="text-sm font-medium text-foreground">
											{t("microAppPage.publish.published")}
										</p>
									</div>
									{publishedAtText ? (
										<p className="mt-1 text-xs text-muted-foreground">
											{t("microAppPage.publish.publishedAt", {
												time: publishedAtText,
											})}
										</p>
									) : null}
									{accessUrl ? (
										<div
											className="mt-3 rounded-md border border-border bg-muted/30 p-3"
											data-testid="micro-app-publish-quick-share"
										>
											<div
												className={cn(
													"flex gap-3",
													mobile
														? "flex-col items-stretch"
														: "items-center justify-between",
												)}
											>
												<div className="min-w-0">
													<p className="text-sm font-medium text-foreground">
														{t("microAppPage.publish.quickShareTitle")}
													</p>
													<p className="mt-0.5 text-xs text-muted-foreground">
														{t(
															"microAppPage.publish.quickShareDescription",
														)}
													</p>
												</div>
												<div className="flex shrink-0 items-center gap-2">
													<Button
														type="button"
														variant="outline"
														size="sm"
														className={cn(
															"h-8 gap-1.5",
															mobile && "flex-1",
														)}
														onClick={onCopyAccessUrl}
														data-testid="micro-app-publish-copy-link"
													>
														<Copy className="size-3.5" />
														{t("microAppPage.publish.copyLink")}
													</Button>
													<Button
														type="button"
														size="sm"
														className={cn(
															"h-8 gap-1.5",
															mobile && "flex-1",
														)}
														onClick={onCopyShareText}
														data-testid="micro-app-publish-copy-share-text"
													>
														<Copy className="size-3.5" />
														{t("microAppPage.publish.copyShareText")}
													</Button>
												</div>
											</div>
											<Input
												readOnly
												value={accessUrl}
												className="mt-3 h-9 min-w-0 bg-background"
												data-testid="micro-app-publish-access-url"
											/>
										</div>
									) : null}
								</div>
							) : null}

							<ShareTypeField
								value={formState.shareType as ShareType}
								onChange={onShareTypeChange}
								availableTypes={MICRO_APP_PUBLISH_TYPES}
							/>

							{formState.shareType === ShareType.Organization ? (
								<ShareRangeField
									value={formState.shareRange}
									onChange={onShareRangeChange}
									targets={formState.targets}
									onTargetsChange={onTargetsChange}
									resourceId={publishedItem?.resource_id}
								/>
							) : null}

							{formState.shareType === ShareType.PasswordProtected ? (
								<div className="flex flex-col gap-2">
									<Label htmlFor="micro-app-publish-password">
										{t("microAppPage.publish.password")}
									</Label>
									<div className="flex items-center gap-2">
										<Input
											id="micro-app-publish-password"
											value={formState.password}
											onChange={onPasswordChange}
											maxLength={32}
											className={mobile ? "h-11" : "h-9"}
											data-testid="micro-app-publish-password"
										/>
										<Button
											type="button"
											variant="outline"
											size="icon"
											className={
												mobile ? "size-11 shrink-0" : "size-9 shrink-0"
											}
											onClick={onPasswordReset}
											aria-label={t("microAppPage.publish.resetPassword")}
										>
											<RefreshCw className="size-4" />
										</Button>
									</div>
									<p className="text-xs text-muted-foreground">
										{t("microAppPage.publish.passwordHint")}
									</p>
								</div>
							) : null}
						</>
					)}
				</div>
			</ScrollArea>

			<Separator />

			<div
				className={cn(
					"flex gap-3",
					mobile
						? "shrink-0 flex-col items-stretch px-4 pb-4 pt-3"
						: "items-center justify-between",
				)}
			>
				{hasPublished ? (
					<Button
						type="button"
						variant="ghost"
						className={cn(
							"gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive",
							mobile && "h-9 self-start px-0",
						)}
						onClick={onUnpublish}
						disabled={loading || isBusy || coverUploadError}
						data-testid="micro-app-unpublish-button"
					>
						{unpublishing ? (
							<Loader2 className="size-4 animate-spin" />
						) : (
							<Trash2 className="size-4" />
						)}
						{t("microAppPage.publish.unpublish")}
					</Button>
				) : (
					<div />
				)}
				<div className={cn("flex gap-3", mobile ? "flex-col" : "items-center")}>
					{!loading && validationMessage ? (
						<p
							id="micro-app-publish-validation-message"
							className="text-xs text-muted-foreground"
							role="status"
							data-testid="micro-app-publish-validation-message"
						>
							{validationMessage}
						</p>
					) : null}
					<div className="flex items-center gap-2">
						<Button
							type="button"
							variant="outline"
							className={mobile ? "h-11 flex-[30%]" : undefined}
							onClick={onClose}
							disabled={isBusy}
						>
							{t("common.cancel")}
						</Button>
						<Button
							type="button"
							className={cn("gap-2", mobile && "h-11 flex-[70%]")}
							onClick={onSave}
							aria-describedby={
								!loading && validationMessage
									? "micro-app-publish-validation-message"
									: undefined
							}
							disabled={
								!appId ||
								loading ||
								isBusy ||
								coverUploadError ||
								Boolean(validationError)
							}
							data-testid="micro-app-publish-save"
						>
							{saving ? <Loader2 className="size-4 animate-spin" /> : null}
							{hasPublished
								? t("microAppPage.publish.update")
								: t("microAppPage.publish.publish")}
						</Button>
					</div>
				</div>
			</div>
		</div>
	)
}
