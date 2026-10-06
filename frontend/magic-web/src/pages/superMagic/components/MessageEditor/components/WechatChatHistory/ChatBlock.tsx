import { useMemo } from "react"
import {
	NodeViewContent,
	NodeViewWrapper,
	type ReactNodeViewProps,
} from "@/infrastructure/editors/tiptap/react"
import { Expand, MessageSquareText, MoreHorizontal, Plus, Trash2 } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/shadcn-ui/dropdown-menu"
import { cn } from "@/utils/cn"
import { parseWechatChat } from "../../extensions/wechat-chat-history/parser"
import { useWechatChatActions } from "./context"
import { useWechatChatTitle } from "./useWechatChatTitle"

export default function ChatBlock({ node, deleteNode, editor }: ReactNodeViewProps) {
	const { t } = useTranslation("super")
	const actions = useWechatChatActions()
	const id = node.attrs.id as string
	const expanded = actions?.activeId === id
	const snapshot = useMemo(() => parseWechatChat(node.toJSON().content ?? []), [node])
	const title = useWechatChatTitle(snapshot.participants)
	const last = snapshot.messages.at(-1)
	return (
		<NodeViewWrapper
			as="section"
			data-chat-id={id}
			data-chat-expanded={expanded ? "true" : "false"}
			className={cn(
				"my-3 rounded-xl border border-border bg-background",
				expanded ? "w-full" : "w-[calc(100%-24px)] max-w-[560px]",
			)}
			style={actions?.activeId && !expanded ? { display: "none" } : undefined}
		>
			<div
				contentEditable={false}
				className="flex items-start justify-between gap-2 px-4 pt-3"
			>
				<div className="flex min-w-0 items-start gap-2.5">
					<span className="grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground/70">
						<MessageSquareText className="size-4" />
					</span>
					<div className="min-w-0">
						<strong className="block truncate text-sm font-medium">{title}</strong>
						<span className="mt-1 block text-xs text-muted-foreground">
							{t("wechatChat.messageCount", { count: snapshot.messages.length })}
							{last ? ` · ${last.date} ${last.time}` : ""}
						</span>
					</div>
				</div>
				{editor.isEditable && actions && (
					<div className="flex shrink-0 items-center gap-1">
						{!expanded && (
							<Button
								type="button"
								variant="ghost"
								size="sm"
								className="h-7 gap-1 px-2 text-xs"
								onClick={() => actions.preview(id)}
							>
								<Expand className="size-4" />
								{t("wechatChat.preview")}
							</Button>
						)}
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<Button
									type="button"
									variant="ghost"
									size="icon"
									className="size-7"
									aria-label={t("wechatChat.actions")}
								>
									<MoreHorizontal className="size-4" />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => actions.append(id)}>
									<Plus className="size-4" />
									{t("wechatChat.append")}
								</DropdownMenuItem>
								<DropdownMenuItem
									onSelect={deleteNode}
									className="text-destructive"
								>
									<Trash2 className="size-4" />
									{t("wechatChat.delete")}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				)}
			</div>
			{!expanded && last && (
				<div
					contentEditable={false}
					className="mx-4 mt-3 truncate border-l-2 border-border pl-3 text-xs leading-6 text-muted-foreground"
				>
					{last.sender}
					{" · "}
					{last.text || t("wechatChat.attachment")}
				</div>
			)}
			{/* 收起时仅隐藏来源段落，末尾原生 super-placeholder 仍能编辑；不另存处理要求。 */}
			<NodeViewContent
				className={cn(
					"px-4 pb-3 pt-2 [&_p]:m-0 [&_p]:min-h-6",
					!expanded &&
						"[&>div>p:last-child]:mt-2 [&>div>p:last-child]:border-t [&>div>p:last-child]:border-border [&>div>p:last-child]:pt-3 [&_p:not([data-wechat-instruction='true']):not(:has([data-type='super-placeholder']))]:hidden",
					"[&_.super-placeholder]:!block [&_.super-placeholder]:!min-h-9 [&_.super-placeholder]:!w-full [&_.super-placeholder]:!rounded-lg [&_.super-placeholder]:!border [&_.super-placeholder]:!border-border [&_.super-placeholder]:!bg-muted/30 [&_.super-placeholder]:!p-2 [&_.super-placeholder]:!text-sm [&_[data-type='super-placeholder']]:!m-0 [&_[data-type='super-placeholder']]:!block",
				)}
			/>
		</NodeViewWrapper>
	)
}
