import { useState } from "react"
import type { TFunction } from "i18next"
import { Clock3, Loader2, ShieldOff } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/shadcn-ui/badge"
import { Button } from "@/components/shadcn-ui/button"
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/shadcn-ui/select"
import type { HtmlPermissionScope } from "../../iframe-api/types"
import type { HtmlPermissionSnapshotItem } from "../../iframe-api/services/IframePermissionService"
import { useHtmlPermissionI18n } from "../../hooks/useHtmlPermissionI18n"

interface HtmlPermissionItemProps {
	item: HtmlPermissionSnapshotItem
	now: number
	dateFormatter: Intl.DateTimeFormat
	disabled: boolean
	updating: boolean
	revoking: boolean
	onUpdateTtl: (scope: HtmlPermissionScope, ttlMs: number) => Promise<void>
	onRevoke: (scope: HtmlPermissionScope) => Promise<void>
}

export function HtmlPermissionItem({
	item,
	now,
	dateFormatter,
	disabled,
	updating,
	revoking,
	onUpdateTtl,
	onRevoke,
}: HtmlPermissionItemProps) {
	const { t } = useTranslation("super")
	const { getScopeLabel, getTtlLabel } = useHtmlPermissionI18n()
	const grant = item.grant
	const currentTtlMs = grant ? grant.expiresAt - grant.grantedAt : 0
	const [selectedTtlMs, setSelectedTtlMs] = useState(String(currentTtlMs))
	const selectedTtl = Number(selectedTtlMs)
	const scope = item.scope as HtmlPermissionScope
	const busy = disabled || updating || revoking
	const canUpdate =
		Boolean(grant) &&
		Number.isFinite(selectedTtl) &&
		selectedTtl > 0 &&
		selectedTtl !== currentTtlMs

	return (
		<div className="p-4">
			<div className="flex flex-wrap items-center gap-2">
				<span className="text-sm font-medium">
					{item.supported ? getScopeLabel(scope) : item.scope}
				</span>
				{item.declarationStatus === "unsupported" ? <UnsupportedBadge /> : null}
				<GrantBadge granted={Boolean(grant)} />
			</div>
			{grant ? (
				<>
					<div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
						<span>
							{t("htmlEditor.permissionManager.grantedAt", {
								time: dateFormatter.format(grant.grantedAt),
							})}
						</span>
						<span className="inline-flex items-center gap-1">
							<Clock3 size={12} />
							{t("htmlEditor.permissionManager.expiresAt", {
								time: dateFormatter.format(grant.expiresAt),
								remaining: formatRemaining(grant.expiresAt - now, t),
							})}
						</span>
					</div>
					{item.supported ? (
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<span className="text-xs text-muted-foreground">
								{t("htmlEditor.permissionManager.durationLabel")}
							</span>
							{item.ttlOptions.length > 0 ? (
								<>
									<Select
										value={selectedTtlMs}
										onValueChange={setSelectedTtlMs}
										disabled={busy}
									>
										<SelectTrigger
											size="sm"
											className="w-32"
											aria-label={t(
												"htmlEditor.permissionManager.durationSelect",
												{ scope: getScopeLabel(scope) },
											)}
										>
											<SelectValue />
										</SelectTrigger>
										<SelectContent>
											{item.ttlOptions.map((option) => (
												<SelectItem
													key={option.ttlMs}
													value={String(option.ttlMs)}
												>
													{getTtlLabel(option.ttlMs)}
												</SelectItem>
											))}
										</SelectContent>
									</Select>
									<Button
										size="sm"
										disabled={!canUpdate || busy}
										onClick={() => void onUpdateTtl(scope, selectedTtl)}
									>
										{updating ? (
											<Loader2 size={14} className="animate-spin" />
										) : null}
										{t("htmlEditor.permissionManager.updateDuration")}
									</Button>
								</>
							) : null}
							<Button
								variant="outline"
								size="sm"
								className="gap-1.5"
								disabled={busy}
								onClick={() => void onRevoke(scope)}
							>
								{revoking ? (
									<Loader2 size={14} className="animate-spin" />
								) : (
									<ShieldOff size={14} />
								)}
								{t("htmlEditor.permissionManager.revoke")}
							</Button>
						</div>
					) : null}
				</>
			) : item.supported ? (
				<p className="mt-2 text-xs text-muted-foreground">
					{t("htmlEditor.permissionManager.askWhenUsed")}
				</p>
			) : null}
		</div>
	)
}

function UnsupportedBadge() {
	const { t } = useTranslation("super")
	return (
		<Badge variant="outline" className="border-amber-300 text-amber-700 dark:text-amber-300">
			{t("htmlEditor.permissionManager.unsupported")}
		</Badge>
	)
}

function GrantBadge({ granted }: { granted: boolean }) {
	const { t } = useTranslation("super")
	return granted ? (
		<Badge className="bg-emerald-600 text-white hover:bg-emerald-600">
			{t("htmlEditor.permissionManager.granted")}
		</Badge>
	) : (
		<Badge variant="outline">{t("htmlEditor.permissionManager.notGranted")}</Badge>
	)
}

function formatRemaining(remainingMs: number, t: TFunction<"super">) {
	if (remainingMs <= 0) return t("htmlEditor.permissionManager.remainingExpired")
	const minutes = Math.ceil(remainingMs / 60_000)
	if (minutes <= 1) return t("htmlEditor.permissionManager.remainingLessThanMinute")
	if (minutes < 60) return t("htmlEditor.permissionManager.remainingMinutes", { count: minutes })
	const hours = Math.ceil(minutes / 60)
	return t("htmlEditor.permissionManager.remainingHours", { count: hours })
}
