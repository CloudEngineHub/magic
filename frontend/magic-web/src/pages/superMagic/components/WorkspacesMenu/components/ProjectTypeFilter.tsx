import { useTranslation } from "react-i18next"
import { Check, ChevronDown, Filter } from "lucide-react"
import MagicDropdown from "@/components/base/MagicDropdown"
import { Button } from "@/components/shadcn-ui/button"
import type { SuperMagicApi } from "@/apis"

export type RecentProjectType = NonNullable<
	Parameters<typeof SuperMagicApi.getProjectsWithCollaboration>[0]["project_type"]
>

export function ProjectTypeFilter({
	value,
	onChange,
}: {
	value: RecentProjectType
	onChange: (value: RecentProjectType) => void
}) {
	const { t } = useTranslation("super")
	const options: { key: RecentProjectType; label: string }[] = [
		{ key: "all", label: t("projectResources.allTypes") },
		{ key: "general", label: t("projectResources.generalType") },
		{ key: "claw", label: t("projectTypeTag.magicClaw") },
		{ key: "micro-app", label: t("projectTypeTag.microApp") },
		{ key: "agent", label: t("projectTypeTag.agent") },
		{ key: "skill", label: t("projectTypeTag.skill") },
	]
	return (
		<MagicDropdown
			menu={{
				items: options.map(({ key, label }) => ({
					key,
					label: (
						<div className="flex items-center justify-between gap-2">
							{label}
							{value === key && <Check size={16} />}
						</div>
					),
				})),
				onClick: ({ key }) => {
					const option = options.find((item) => item.key === key)
					if (option) onChange(option.key)
				},
			}}
		>
			<Button variant="ghost" size="sm" className="h-8 gap-1 text-xs">
				<Filter size={16} />
				{options.find((item) => item.key === value)?.label}
				<ChevronDown size={16} />
			</Button>
		</MagicDropdown>
	)
}
