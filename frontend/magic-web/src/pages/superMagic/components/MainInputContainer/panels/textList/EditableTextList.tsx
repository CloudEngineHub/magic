import { useTranslation } from "react-i18next"
import { Ellipsis, PencilLine, Trash2 } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import { cn } from "@/lib/utils"
import MagicDropdown from "@/components/base/MagicDropdown"
import { useLocaleText } from "../hooks/useLocaleText"
import type { OptionItem, OptionItemKeyResolver } from "../types"
import { getOptionValue, resolveOptionItemKey } from "../utils"

interface EditableTextListProps {
	items: OptionItem[]
	selectedKeys: Set<string>
	getItemKey?: OptionItemKeyResolver
	onSelect: (value: string, checked: boolean) => void
	onEdit: (item: OptionItem) => void
	onDelete: (value: string) => void
}

interface EditableTextListItemProps {
	item: OptionItem
	itemKey: string
	isSelected: boolean
	onSelect: (value: string, checked: boolean) => void
	onEdit: () => void
	onDelete: () => void
}

function EditableTextListItem({
	item,
	itemKey,
	isSelected,
	onSelect,
	onEdit,
	onDelete,
}: EditableTextListItemProps) {
	const { t } = useTranslation("crew/create")
	const lt = useLocaleText()
	const itemValue = getOptionValue(item)
	const label = lt(item.label) ?? lt(item.value) ?? itemValue

	const menuItems = [
		{
			key: "edit",
			label: t("playbook.edit.inspiration.actions.edit"),
			icon: <PencilLine className="size-4" />,
			onClick: onEdit,
		},
		{
			key: "delete",
			label: t("playbook.edit.inspiration.actions.delete"),
			icon: <Trash2 className="size-4" />,
			danger: true,
			onClick: onDelete,
		},
	]

	return (
		<div
			className={cn(
				"flex items-center gap-2 rounded-md px-4 py-2 text-sm shadow-xs transition-colors",
				isSelected ? "bg-secondary/80" : "bg-secondary",
			)}
			data-testid={`editable-text-list-item-${itemKey}`}
		>
			<Checkbox
				checked={isSelected}
				onCheckedChange={(checked) => onSelect(itemKey, !!checked)}
				data-testid={`editable-text-list-item-checkbox-${itemKey}`}
			/>
			<span className="min-w-0 flex-1 truncate text-left leading-5 text-secondary-foreground">
				{label}
			</span>
			<MagicDropdown menu={{ items: menuItems }} trigger={["click"]} placement="bottomRight">
				<span>
					<Button
						variant="ghost"
						size="icon"
						className="h-9 w-9 shrink-0"
						data-testid={`editable-text-list-item-menu-${itemKey}`}
					>
						<Ellipsis className="size-4" />
					</Button>
				</span>
			</MagicDropdown>
		</div>
	)
}

export function EditableTextList({
	items,
	selectedKeys,
	getItemKey,
	onSelect,
	onEdit,
	onDelete,
}: EditableTextListProps) {
	return (
		<div className="flex w-full flex-col gap-2">
			{items.map((item, index) => {
				const itemKey = resolveOptionItemKey(item, index, getItemKey)
				return (
					<EditableTextListItem
						key={itemKey}
						item={item}
						itemKey={itemKey}
						isSelected={selectedKeys.has(itemKey)}
						onSelect={onSelect}
						onEdit={() => onEdit(item)}
						onDelete={() => onDelete(itemKey)}
					/>
				)
			})}
		</div>
	)
}
