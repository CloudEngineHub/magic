import { useMemo, useState } from "react"
import { Check, ChevronDown } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/shadcn-ui/popover"
import {
	Command,
	CommandInput,
	CommandList,
	CommandItem,
	CommandEmpty,
	CommandGroup,
} from "@/components/shadcn-ui/command"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import type { AttachmentItem } from "@/pages/superMagic/components/TopicFilesButton/hooks"
import { cn } from "@/utils/cn"
import { collectHtmlFiles, getAttachmentId, getMicroAppPreviewPath } from "../utils/microAppFiles"

interface Props {
	attachmentList: AttachmentItem[]
	value: string | null
	onChange: (value: string | null) => void
	disabled?: boolean
	mobile?: boolean
}

export default function MicroAppEntryFileSelect({
	attachmentList,
	value,
	onChange,
	disabled,
	mobile,
}: Props) {
	const { t } = useTranslation("super")
	const [open, setOpen] = useState(false)
	const files = useMemo(
		() =>
			collectHtmlFiles(attachmentList).map((file) => ({
				id: String(getAttachmentId(file)),
				label: getMicroAppPreviewPath(file).replace(/^\//, ""),
			})),
		[attachmentList],
	)
	const options = [{ id: null, label: t("microAppPage.publish.defaultOpenFileAuto") }, ...files]
	return (
		<Popover open={open} onOpenChange={setOpen}>
			<PopoverTrigger asChild>
				<Button
					id="micro-app-default-open-file"
					data-testid="micro-app-default-open-file"
					variant="outline"
					role="combobox"
					aria-expanded={open}
					disabled={disabled}
					className={cn(
						"w-full justify-between bg-background font-normal",
						mobile ? "h-11" : "mt-2 h-9",
					)}
				>
					<span className="truncate">
						{options.find((option) => option.id === value)?.label ??
							t("microAppPage.publish.defaultOpenFileAuto")}
					</span>
					<ChevronDown className="size-4 shrink-0 text-muted-foreground" />
				</Button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-[var(--radix-popover-trigger-width)] p-0">
				<Command
					filter={(_value, search, keywords) =>
						(keywords?.join(" ") ?? "")
							.toLowerCase()
							.includes(search.trim().toLowerCase())
							? 1
							: 0
					}
				>
					<CommandInput
						placeholder={t("microAppPage.publish.defaultOpenFileSearch")}
						aria-label={t("microAppPage.publish.defaultOpenFileSearch")}
					/>
					{/* The shared viewport owns scrolling; keep the search field visible. */}
					<CommandList className="max-h-none overflow-hidden">
						<ScrollArea viewportClassName="max-h-60">
							<CommandEmpty>
								{t("microAppPage.publish.defaultOpenFileEmpty")}
							</CommandEmpty>
							<CommandGroup>
								{options.map((option) => (
									<CommandItem
										key={option.id ?? "auto"}
										value={option.id ?? "auto"}
										keywords={[option.label]}
										onSelect={() => {
											onChange(option.id)
											setOpen(false)
										}}
									>
										<span className="min-w-0 flex-1 break-all">
											{option.label}
										</span>
										<Check
											className={cn(
												"size-4 shrink-0",
												option.id !== value && "invisible",
											)}
										/>
									</CommandItem>
								))}
							</CommandGroup>
						</ScrollArea>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	)
}
