import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { AtSign, Crosshair, Images, UsersRound } from "lucide-react"
import { cn } from "@/lib/utils"

export type BrandFieldIllustrationVariant = "author" | "position" | "audience" | "assets"

const FIELD_ICON: Record<BrandFieldIllustrationVariant, LucideIcon> = {
	author: AtSign,
	position: Crosshair,
	audience: UsersRound,
	assets: Images,
}

interface BrandFieldRowProps {
	illustration: BrandFieldIllustrationVariant
	header: ReactNode
	children: ReactNode
	className?: string
	"data-testid"?: string
	isActive?: boolean
	variant?: "card" | "embedded"
}

export function BrandFieldRow({
	illustration,
	header,
	children,
	className,
	"data-testid": dataTestId,
	isActive = false,
	variant = "card",
}: BrandFieldRowProps) {
	const Icon = FIELD_ICON[illustration]
	const isEmbedded = variant === "embedded"

	return (
		<div
			className={cn(
				"group relative text-card-foreground transition-colors duration-200",
				isEmbedded
					? "rounded-md border-0 bg-transparent px-0 py-0 shadow-none hover:bg-background/45"
					: "overflow-hidden rounded-lg border bg-card px-4 py-4 shadow-xs",
				isEmbedded
					? isActive && "text-foreground"
					: isActive
						? "border-ring"
						: "hover:bg-accent/35",
				className,
			)}
			data-testid={dataTestId}
		>
			<div className={cn("relative flex flex-col gap-2", isEmbedded && "gap-1.5")}>
				<div className={cn("flex min-h-8 min-w-0 items-center", isEmbedded && "gap-2")}>
					<div
						className={cn(
							"flex shrink-0 items-center justify-center transition-all duration-200",
							isEmbedded
								? "size-7 rounded-md bg-background/60 group-hover:-translate-y-0.5 group-hover:bg-[#434c81]/[0.10]"
								: "",
						)}
					>
						<Icon
							size={16}
							strokeWidth={2}
							className={cn(
								"shrink-0 transition-colors duration-200",
								isActive
									? "text-[#38426f]"
									: "text-muted-foreground group-hover:text-foreground",
							)}
						/>
					</div>
					<div
						className={cn(
							"transition-all duration-200",
							isActive && !isEmbedded ? "translate-x-2" : "",
						)}
					>
						{header}
					</div>
				</div>
				<div className="min-w-0">{children}</div>
			</div>
		</div>
	)
}
