import { MessageSquareText } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/shadcn-ui/popover"
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandItem,
	CommandList,
} from "@/components/shadcn-ui/command"
import { ScrollArea } from "@/components/shadcn-ui/scroll-area"
import { matchesWechatCommand, type SlashMenuState } from "../../extensions/slash-command"

export default function SlashMenu({
	menu,
	onDismiss,
}: {
	menu: SlashMenuState | null
	onDismiss: () => void
}) {
	const { t } = useTranslation("super")
	if (!menu) return null
	return (
		<Popover
			open
			onOpenChange={(open) => {
				if (!open) onDismiss()
			}}
		>
			<PopoverAnchor virtualRef={{ current: { getBoundingClientRect: () => menu.rect } }} />
			<PopoverContent
				side="top"
				align="start"
				sideOffset={8}
				collisionPadding={16}
				className="w-80 max-w-[calc(100vw-32px)] rounded-xl p-1.5"
				onOpenAutoFocus={(event) => event.preventDefault()}
				onCloseAutoFocus={(event) => event.preventDefault()}
			>
				<Command shouldFilter={false} value="wechat-chat-history">
					<ScrollArea className="max-h-64">
						<CommandList className="max-h-none overflow-visible">
							<CommandGroup heading={t("wechatChat.importGroup")}>
								{matchesWechatCommand(menu.query) && (
									<CommandItem
										value="wechat-chat-history"
										onPointerDown={(event) => event.preventDefault()}
										onSelect={menu.choose}
										className="items-start gap-3 rounded-lg px-3 py-3"
									>
										<MessageSquareText className="mt-0.5 size-4" />
										<span>
											<span className="block text-sm font-medium">
												{t("wechatChat.command")}
											</span>
											<span className="mt-1 block text-xs leading-5 text-muted-foreground">
												{t("wechatChat.commandDescription")}
											</span>
										</span>
									</CommandItem>
								)}
								<CommandEmpty className="px-3 py-5 text-xs text-muted-foreground">
									{t("wechatChat.noCommand")}
								</CommandEmpty>
							</CommandGroup>
						</CommandList>
					</ScrollArea>
				</Command>
				<div className="mt-1 border-t px-3 pb-1 pt-2 text-xs text-muted-foreground">
					{t("wechatChat.commandHint")}
				</div>
			</PopoverContent>
		</Popover>
	)
}
