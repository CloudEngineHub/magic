import { useEffect, useId, useRef, useState } from "react"
import { ChevronDown, ChevronsDown, ChevronsUp, Copy } from "lucide-react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/shadcn-ui/button"
import { clipboard } from "@/utils/clipboard-helpers"
import magicToast from "@/components/base/MagicToaster/utils"
import { cn } from "@/utils/cn"

interface TerminalCommandProps {
	command: string
	action?: string
	remark?: string
}

export function TerminalCommand({ command, action, remark }: TerminalCommandProps) {
	const { t } = useTranslation("super")
	const contentId = useId()
	const commandRef = useRef<HTMLPreElement>(null)
	const [expanded, setExpanded] = useState(false)
	const [overflows, setOverflows] = useState(false)
	useEffect(() => {
		const element = commandRef.current
		if (!element) return
		const measure = () => {
			if (!expanded) setOverflows(element.scrollHeight > element.clientHeight + 1)
		}
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(element)
		return () => observer.disconnect()
	}, [command, expanded])

	async function copyCommand() {
		try {
			await clipboard.writeText(command)
			magicToast.success(t("terminal.copyCommand"))
		} catch {
			magicToast.error(t("common.copyFailed"))
		}
	}

	return (
		<>
			{remark && remark !== command && (
				<details className="group shrink-0 border-b border-border px-[18px] py-2">
					<summary className="flex cursor-pointer list-none items-center gap-2 text-xs [&::-webkit-details-marker]:hidden">
						<span className="shrink-0 text-muted-foreground">
							{action || t("terminal.operation")}
						</span>
						<span className="min-w-0 flex-1 truncate">{remark}</span>
						<ChevronDown
							size={16}
							aria-hidden
							className="shrink-0 -rotate-90 text-muted-foreground group-open:rotate-0"
						/>
					</summary>
					{/* 只展开工具实际返回的说明；不从脚本名猜用途，也不重新生成一段模型解释。 */}
					<p className="mb-0 mt-2 whitespace-pre-wrap break-words text-xs leading-6 text-muted-foreground">
						{remark}
					</p>
				</details>
			)}
			{command && (
				<section
					className="shrink-0 px-[18px] pb-3 pt-2"
					aria-label={t("terminal.command")}
				>
					<div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
						<span>{t("terminal.actualCommand")}</span>
						<div className="flex items-center gap-1">
							<Button
								variant="ghost"
								size="sm"
								className="h-7 gap-1 px-1.5 text-xs font-normal"
								onClick={copyCommand}
							>
								<Copy size={16} aria-hidden />
								{t("terminal.copyCommandAction")}
							</Button>
							{(overflows || expanded) && (
								<Button
									variant="ghost"
									size="sm"
									className="h-7 gap-1 px-1.5 text-xs font-normal"
									aria-expanded={expanded}
									aria-controls={contentId}
									onClick={() => setExpanded((value) => !value)}
								>
									{expanded ? (
										<ChevronsUp size={16} aria-hidden />
									) : (
										<ChevronsDown size={16} aria-hidden />
									)}
									{expanded
										? t("terminal.collapseCommand")
										: t("terminal.expandCommand")}
								</Button>
							)}
						</div>
					</div>
					<div className="mt-1 flex min-w-0 gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 font-mono text-sm leading-[1.65]">
						<span
							className="select-none text-green-700 dark:text-green-400"
							aria-hidden
						>
							$
						</span>
						<pre
							ref={commandRef}
							id={contentId}
							className={cn(
								"m-0 min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-sm leading-[1.65] text-blue-600 dark:text-blue-400",
								expanded
									? "max-h-[16.5em] overflow-auto"
									: "max-h-[4.95em] overflow-hidden",
							)}
						>
							{command}
						</pre>
					</div>
				</section>
			)}
		</>
	)
}
