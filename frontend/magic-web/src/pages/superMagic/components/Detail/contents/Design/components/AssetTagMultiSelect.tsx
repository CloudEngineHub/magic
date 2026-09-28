import { Badge } from "@/components/shadcn-ui/badge"
import { Checkbox } from "@/components/shadcn-ui/checkbox"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/shadcn-ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import { cn } from "@/utils/cn"
import { ChevronsUpDown, X } from "lucide-react"
import { useMemo, useState } from "react"

export interface AssetTagOption {
	id: string
	name: string
	groupName: string
}

interface AssetTagMultiSelectProps {
	options: AssetTagOption[]
	value: string[]
	onChange: (value: string[]) => void
	label: string
	placeholder: string
	searchPlaceholder: string
	emptyText: string
	removeLabel: string
}

export default function AssetTagMultiSelect({
	options,
	value,
	onChange,
	label,
	placeholder,
	searchPlaceholder,
	emptyText,
	removeLabel,
}: AssetTagMultiSelectProps) {
	const [open, setOpen] = useState(false)
	const selectedOptions = useMemo(
		() => options.filter((option) => value.includes(option.id)),
		[options, value],
	)
	const groupedOptions = useMemo(() => {
		const groups = new Map<string, AssetTagOption[]>()
		options.forEach((option) => {
			const current = groups.get(option.groupName) ?? []
			current.push(option)
			groups.set(option.groupName, current)
		})
		return Array.from(groups.entries())
	}, [options])

	const toggleOption = (optionId: string) => {
		onChange(
			value.includes(optionId)
				? value.filter((selectedId) => selectedId !== optionId)
				: [...value, optionId],
		)
	}

	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<div
					role="combobox"
					tabIndex={0}
					aria-label={label}
					aria-expanded={open}
					aria-haspopup="listbox"
					className={cn(
						"flex min-h-10 w-full cursor-pointer items-center gap-1.5 rounded-md border border-input bg-background px-3 py-1.5 text-sm shadow-xs transition-[color,box-shadow]",
						"focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
					)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault()
							setOpen((current) => !current)
						}
					}}
				>
					<div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
						{selectedOptions.length > 0 ? (
							selectedOptions.map((option) => (
								<Badge
									key={option.id}
									variant="secondary"
									className="max-w-full rounded-md pr-1"
								>
									<span className="truncate">{option.name}</span>
									<button
										type="button"
										className="rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										aria-label={`${removeLabel}: ${option.name}`}
										onKeyDown={(event) => event.stopPropagation()}
										onClick={(event) => {
											event.stopPropagation()
											toggleOption(option.id)
										}}
									>
										<X className="size-3" aria-hidden="true" />
									</button>
								</Badge>
							))
						) : (
							<span className="py-0.5 text-muted-foreground">{placeholder}</span>
						)}
					</div>
					<ChevronsUpDown
						className="size-4 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				</div>
			</PopoverTrigger>
			{/* Popover portals to body, so it must sit one layer above the z-modal dialog. */}
			<PopoverContent
				align="start"
				className="z-[1001] w-[var(--radix-popover-trigger-width)] p-0"
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				<Command>
					<CommandInput placeholder={searchPlaceholder} />
					<CommandList aria-multiselectable="true">
						<CommandEmpty>{emptyText}</CommandEmpty>
						{groupedOptions.map(([groupName, groupOptions]) => (
							<CommandGroup key={groupName} heading={groupName}>
								{groupOptions.map((option) => {
									const checked = value.includes(option.id)
									return (
										<CommandItem
											key={option.id}
											value={`${option.name} ${option.groupName}`}
											onSelect={() => toggleOption(option.id)}
										>
											<Checkbox checked={checked} tabIndex={-1} />
											<span className="min-w-0 truncate">{option.name}</span>
										</CommandItem>
									)
								})}
							</CommandGroup>
						))}
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
