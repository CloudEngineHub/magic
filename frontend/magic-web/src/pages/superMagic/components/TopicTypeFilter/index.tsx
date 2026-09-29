import { useTranslation } from "react-i18next"
import { ChevronDown } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuCheckboxItem,
} from "@/components/shadcn-ui/dropdown-menu"
import { toggleTopicType, type TopicTypeFilterValue } from "../../utils/topicTypeFilter"

export interface TopicTypeFilterProps {
	value: TopicTypeFilterValue
	onChange: (value: TopicTypeFilterValue) => void
}

/** Shared controlled multi-select; membership is always decided by the list API. */
export default function TopicTypeFilter({ value, onChange }: TopicTypeFilterProps) {
	const { t } = useTranslation("super")
	const options = [
		{ value: "all" as const, label: t("topicTypeFilter.all") },
		{ value: "topic" as const, label: t("topicTypeFilter.topic") },
		{ value: "scheduled_task" as const, label: t("topicTypeFilter.scheduledTask") },
	]
	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size="sm"
					className="w-full justify-between"
					aria-label={t("topicTypeFilter.label")}
				>
					{options.find((option) => option.value === value)?.label}
					<ChevronDown className="size-4" />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="start"
				className="min-w-[var(--radix-dropdown-menu-trigger-width)]"
			>
				{options.map((option) => (
					<DropdownMenuCheckboxItem
						key={option.value}
						checked={value === "all" || value === option.value}
						onSelect={(event) => event.preventDefault()}
						onCheckedChange={() => onChange(toggleTopicType(value, option.value))}
					>
						{option.label}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
