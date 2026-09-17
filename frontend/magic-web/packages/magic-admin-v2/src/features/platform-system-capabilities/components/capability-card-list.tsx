import { useTranslation } from "react-i18next"
import { CapabilityCard } from "@magic-admin-v2/features/platform-system-capabilities/components/capability-card"
import type { AiPower } from "@magic-admin-v2/features/platform-system-capabilities/types"

export function CapabilityCardList({
	canEdit,
	items,
	onConfig,
	onStatusChange,
	statusPendingIds,
}: {
	canEdit: boolean
	items: AiPower[]
	onConfig: (item: AiPower) => void
	onStatusChange: (item: AiPower, checked: boolean) => void
	statusPendingIds: ReadonlySet<string>
}) {
	const { t } = useTranslation()

	return (
		<div className="space-y-3">
			<div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
				{items.map((item) => (
					<CapabilityCard
						canEdit={canEdit}
						item={item}
						key={item.id}
						onConfig={onConfig}
						onStatusChange={onStatusChange}
						statusPending={statusPendingIds.has(item.code)}
					/>
				))}
			</div>
			<div className="px-1 text-sm text-muted-foreground">
				{t("systemCapabilities.list.count", { count: items.length })}
			</div>
		</div>
	)
}
