import { RefreshCw } from "lucide-react"
import { Button } from "@/components/shadcn-ui/button"
import { MicroAppRetryIllustration } from "@/pages/superMagic/components/MicroAppStateIllustration"

interface MicroAppLoadErrorStateProps {
	title: string
	description: string
	actionLabel: string
	onRetry: () => void
	mobile?: boolean
}

export default function MicroAppLoadErrorState({
	title,
	description,
	actionLabel,
	onRetry,
	mobile = false,
}: MicroAppLoadErrorStateProps) {
	return (
		<div
			className={`relative overflow-hidden rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(248,248,245,0.28),rgba(255,255,255,0))] text-center ${
				mobile ? "min-h-[300px] px-5 py-8" : "min-h-[340px] px-8 py-10"
			}`}
			data-testid="micro-apps-load-error"
			data-mobile={mobile}
		>
			<div className="relative z-10 mx-auto flex h-full max-w-sm flex-col items-center justify-center">
				<MicroAppRetryIllustration
					size={mobile ? "sm" : "md"}
					testId="micro-app-load-error-illustration"
				/>
				<div className={mobile ? "mt-4 space-y-1.5" : "mt-5 space-y-2"}>
					<p className={mobile ? "text-base font-semibold" : "text-[16px] font-semibold"}>
						{title}
					</p>
					<p className="text-sm leading-6 text-muted-foreground">{description}</p>
				</div>
				<Button
					type="button"
					className="mt-5 h-10 gap-2 rounded-xl bg-[#172037] px-5 text-white shadow-[0_10px_28px_rgba(23,32,55,0.16)] hover:bg-[#202b48] dark:bg-white dark:text-[#172037] dark:hover:bg-white/90"
					onClick={onRetry}
				>
					<RefreshCw className="size-4" aria-hidden />
					{actionLabel}
				</Button>
			</div>
		</div>
	)
}
