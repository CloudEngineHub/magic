import { ArrowDown, ArrowRight, FileText, FolderTree } from "lucide-react"
import { useTranslation } from "react-i18next"
import { cn } from "@/utils/cn"

export interface HelpStep {
	title: string
	description: string
}

export interface HelpIllustrationProps {
	title: string
	steps: HelpStep[]
	variant: "flow" | "tree" | "document"
}

/** 图示只解释关系，不呈现真实文件、连接状态或可点击的操作。 */
export function HelpIllustration({ title, steps, variant }: HelpIllustrationProps) {
	const { t } = useTranslation("interface")
	return (
		<figure className="overflow-hidden rounded-xl border bg-gradient-to-br from-muted/70 via-background to-muted/40">
			<figcaption className="flex flex-wrap items-center justify-between gap-2 border-b px-5 py-3">
				<span className="font-medium">{title}</span>
				<span className="text-xs text-muted-foreground">
					{t("contextHelp.illustration")}
				</span>
			</figcaption>
			<ol
				className={cn(
					"p-5",
					variant === "flow" ? "grid gap-3 sm:grid-cols-3" : "space-y-3",
				)}
			>
				{steps.map((step, index) => (
					<li
						key={step.title}
						className={cn(
							"relative flex min-w-0 flex-col",
							variant === "tree" &&
								index > 0 &&
								"ml-5 border-l-2 border-primary/20 pl-4",
						)}
					>
						{variant === "flow" && index > 0 && (
							<>
								<ArrowDown
									size={16}
									aria-hidden
									className="mx-auto mb-3 text-muted-foreground sm:hidden"
								/>
								<ArrowRight
									size={16}
									aria-hidden
									className="absolute -left-3.5 top-5 z-10 hidden rounded-full bg-background text-muted-foreground sm:block"
								/>
							</>
						)}
						<div className="flex-1 rounded-lg border bg-background p-4 shadow-sm">
							<div className="mb-2 flex items-center gap-2 font-medium">
								<span
									className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-xs text-primary"
									aria-hidden
								>
									{variant === "tree" ? (
										<FolderTree size={16} />
									) : variant === "document" ? (
										<FileText size={16} />
									) : (
										index + 1
									)}
								</span>
								<span className="min-w-0 break-words">{step.title}</span>
							</div>
							<p className="text-xs leading-6 text-muted-foreground">
								{step.description}
							</p>
						</div>
					</li>
				))}
			</ol>
		</figure>
	)
}
