import { useRef } from "react"
import { Info } from "lucide-react"
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "@/components/shadcn-ui/alert-dialog"
import { useTranslation } from "react-i18next"

interface PublishScopeNoticeDialogProps {
	open: boolean
	publishPath: string
	outsidePaths: string[]
	onContinue: () => void | Promise<void>
	onCancel: () => void
}

export default function PublishScopeNoticeDialog({
	open,
	publishPath,
	outsidePaths,
	onContinue,
	onCancel,
}: PublishScopeNoticeDialogProps) {
	const { t } = useTranslation("crew/market")
	const isContinuingRef = useRef(false)

	const handleContinue = () => {
		isContinuingRef.current = true
		void onContinue()
	}

	return (
		<AlertDialog
			open={open}
			onOpenChange={(nextOpen) => {
				if (!nextOpen) {
					if (isContinuingRef.current) {
						isContinuingRef.current = false
						return
					}
					onCancel()
				}
			}}
		>
			<AlertDialogContent
				size="sm"
				className="!max-w-[440px] gap-0 p-0"
				data-testid="publish-scope-notice-dialog"
			>
				<AlertDialogHeader className="place-items-start gap-3 p-6 pb-5 text-left sm:text-left">
					<div className="flex w-full items-start gap-3">
						<div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
							<Info className="size-[18px]" aria-hidden="true" />
						</div>
						<div className="min-w-0 flex-1 space-y-1">
							<AlertDialogTitle className="text-base font-semibold leading-6">
								{t("publishScopeNotice.title")}
							</AlertDialogTitle>
							<AlertDialogDescription className="max-w-none text-left text-sm leading-6 text-muted-foreground">
								<span className="block">{t("publishScopeNotice.intro")}</span>
								<span className="mt-3 block rounded-lg border border-border/70 bg-muted/40 px-3 py-2.5">
									<span className="block text-xs font-medium text-muted-foreground">
										{t("publishScopeNotice.scopeLabel")}
									</span>
									<code className="mt-1 block break-all font-mono text-sm font-medium leading-5 text-foreground">
										{publishPath}
									</code>
								</span>
								<span className="mt-3 block rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2.5">
									<span className="block text-xs font-medium text-amber-700 dark:text-amber-300">
										{t("publishScopeNotice.outsidePathsLabel")}
									</span>
									<span className="mt-1.5 block space-y-1">
										{outsidePaths.slice(0, 3).map((path) => (
											<span
												key={path}
												className="flex min-w-0 items-start gap-2"
											>
												<span
													className="mt-2 size-1.5 shrink-0 rounded-full bg-amber-500"
													aria-hidden="true"
												/>
												<code className="min-w-0 break-all font-mono text-xs leading-5 text-foreground/80">
													{path}
												</code>
											</span>
										))}
									</span>
									{outsidePaths.length > 3 && (
										<span className="mt-1.5 block text-xs leading-5 text-muted-foreground">
											…{" "}
											{t("publishScopeNotice.morePaths", {
												count: outsidePaths.length - 3,
											})}
										</span>
									)}
								</span>
								<span className="mt-3 block">
									{t("publishScopeNotice.confirm")}
								</span>
							</AlertDialogDescription>
						</div>
					</div>
				</AlertDialogHeader>
				<AlertDialogFooter className="mx-0 mb-0 rounded-b-xl border-t bg-muted/30 p-4">
					<AlertDialogCancel className="h-10 w-full rounded-lg text-sm font-medium">
						{t("publishScopeNotice.cancel")}
					</AlertDialogCancel>
					<AlertDialogAction
						className="h-10 w-full rounded-lg text-sm font-medium shadow-sm"
						onClick={handleContinue}
					>
						{t("publishScopeNotice.continue")}
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	)
}
