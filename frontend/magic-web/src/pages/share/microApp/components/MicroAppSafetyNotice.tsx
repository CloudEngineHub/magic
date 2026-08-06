import { useEffect, useState } from "react"
import { AlertTriangle, ArrowLeft, Check, ShieldAlert } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"

interface MicroAppSafetyNoticeProps {
	appName?: string
	coverUrl?: string
	onConfirm: () => void
	onLeave: () => void
}

export default function MicroAppSafetyNotice({
	appName,
	coverUrl,
	onConfirm,
	onLeave,
}: MicroAppSafetyNoticeProps) {
	const { t } = useTranslation("super")
	const displayAppName = appName?.trim() || t("microAppShare.title")
	const normalizedCoverUrl = coverUrl?.trim() || ""
	const [coverLoadFailed, setCoverLoadFailed] = useState(false)

	useEffect(() => {
		setCoverLoadFailed(false)
	}, [normalizedCoverUrl])

	return (
		<div
			className="h-full w-full overflow-y-auto bg-gradient-to-b from-amber-50/60 via-background to-background dark:from-amber-950/15"
			data-testid="micro-app-share-safety-notice"
		>
			{/* 独立滚动层保证低高度移动端可以从卡片顶部开始阅读。 */}
			<div className="flex min-h-full items-center justify-center px-4 py-8 sm:px-6">
				<section className="w-full max-w-[620px] overflow-hidden rounded-2xl border border-border/80 bg-background shadow-[0_20px_60px_rgba(15,23,42,0.12)]">
					<div className="border-b border-border/70 px-5 py-6 sm:px-8 sm:py-7">
						<div className="mb-5 flex size-11 items-center justify-center rounded-xl border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/50 dark:text-amber-300">
							<ShieldAlert size={16} aria-hidden="true" />
						</div>
						<p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-amber-700 dark:text-amber-300">
							{t("microAppShare.safetyEyebrow")}
						</p>
						<h1 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
							{t("microAppShare.safetyTitle")}
						</h1>
						<p className="mt-3 text-sm leading-6 text-muted-foreground">
							{t("microAppShare.safetyDescription")}
						</p>
					</div>

					<div className="space-y-5 px-5 py-6 sm:px-8">
						<div className="rounded-xl border border-border/70 bg-muted/35 px-4 py-3.5">
							<p className="text-xs text-muted-foreground">
								{t("microAppShare.safetyAppLabel")}
							</p>
							<p className="truncate text-sm font-semibold text-foreground">
								{displayAppName}
							</p>
						</div>

						{normalizedCoverUrl && !coverLoadFailed ? (
							<div className="aspect-[16/10] overflow-hidden rounded-xl border border-border/70 bg-muted/40 shadow-sm">
								<img
									src={normalizedCoverUrl}
									alt={t("microAppShare.safetyCoverAlt", {
										appName: displayAppName,
									})}
									className="size-full object-cover"
									referrerPolicy="no-referrer"
									decoding="async"
									onError={() => setCoverLoadFailed(true)}
									data-testid="micro-app-share-cover"
								/>
							</div>
						) : null}

						<div className="rounded-xl border border-amber-200/80 bg-amber-50/70 p-4 dark:border-amber-900/60 dark:bg-amber-950/20">
							<div className="mb-3 flex items-center gap-2 text-sm font-semibold text-amber-950 dark:text-amber-100">
								<AlertTriangle size={16} aria-hidden="true" />
								{t("microAppShare.safetyWarningTitle")}
							</div>
							<ul className="space-y-2.5 text-sm leading-5 text-amber-950/80 dark:text-amber-100/80">
								<li className="flex gap-2.5">
									<Check
										className="mt-0.5 shrink-0"
										size={16}
										aria-hidden="true"
									/>
									<span>{t("microAppShare.safetySensitiveData")}</span>
								</li>
								<li className="flex gap-2.5">
									<Check
										className="mt-0.5 shrink-0"
										size={16}
										aria-hidden="true"
									/>
									<span>{t("microAppShare.safetyPermissions")}</span>
								</li>
								<li className="flex gap-2.5">
									<Check
										className="mt-0.5 shrink-0"
										size={16}
										aria-hidden="true"
									/>
									<span>{t("microAppShare.safetyVerifyPublisher")}</span>
								</li>
							</ul>
						</div>

						<p className="text-xs leading-5 text-muted-foreground">
							{t("microAppShare.safetyDisclaimer")}
						</p>
					</div>

					<div className="flex flex-col-reverse gap-3 border-t border-border/70 bg-muted/20 px-5 py-4 sm:flex-row sm:justify-end sm:px-8">
						<Button
							type="button"
							variant="outline"
							size="lg"
							className="rounded-lg"
							onClick={onLeave}
						>
							<ArrowLeft size={16} aria-hidden="true" />
							{t("microAppShare.safetyLeave")}
						</Button>
						<Button
							type="button"
							size="lg"
							className="rounded-lg px-5 font-semibold"
							onClick={onConfirm}
							data-testid="micro-app-share-safety-confirm"
						>
							{t("microAppShare.safetyContinue")}
						</Button>
					</div>
				</section>
			</div>
		</div>
	)
}
