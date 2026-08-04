import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { AppWindow, ExternalLink, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { motion, useReducedMotion } from "framer-motion"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@/components/shadcn-ui/context-menu"
import { Sheet, SheetContent, SheetTitle } from "@/components/shadcn-ui/sheet"

const coverThemes = [
	{
		background: "bg-[linear-gradient(145deg,#101218_0%,#25283a_58%,#675f86_100%)]",
		accent: "bg-[#8b7cf6]",
		chart: "stroke-[#7567dc]",
	},
	{
		background: "bg-[linear-gradient(145deg,#0b1319_0%,#18303d_58%,#2d7180_100%)]",
		accent: "bg-[#4c9bab]",
		chart: "stroke-[#37899b]",
	},
	{
		background: "bg-[linear-gradient(145deg,#111513_0%,#24322d_58%,#557668_100%)]",
		accent: "bg-[#6e9b88]",
		chart: "stroke-[#50816d]",
	},
	{
		background: "bg-[linear-gradient(145deg,#171411_0%,#352a22_58%,#8b6846_100%)]",
		accent: "bg-[#b68755]",
		chart: "stroke-[#9b7046]",
	},
	{
		background: "bg-[linear-gradient(145deg,#10131b_0%,#24293b_58%,#56678f_100%)]",
		accent: "bg-[#7187bd]",
		chart: "stroke-[#6078ad]",
	},
] as const

function resolveThemeIndex(seed: string): number {
	let hash = 0
	for (let index = 0; index < seed.length; index += 1) {
		hash = (hash * 31 + seed.charCodeAt(index)) >>> 0
	}
	return hash % coverThemes.length
}

interface MicroAppCardProps {
	id: string
	title: string
	description?: string
	meta: string
	coverUrl?: string
	statusLabel?: string
	onClick: () => void
	testId: string
	external?: boolean
	variant?: "desktop" | "mobile"
	onOpenInNewWindow: () => void
	onRename: () => void
	onDelete: () => void
}

export default function MicroAppCard({
	id,
	title,
	description,
	meta,
	coverUrl,
	statusLabel,
	onClick,
	testId,
	external = false,
	variant = "desktop",
	onOpenInNewWindow,
	onRename,
	onDelete,
}: MicroAppCardProps) {
	const { t } = useTranslation("super")
	const theme = coverThemes[resolveThemeIndex(id)]
	const reduceMotion = Boolean(useReducedMotion())
	const [coverFailed, setCoverFailed] = useState(false)
	const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
	const showRemoteCover = Boolean(coverUrl && !coverFailed)

	useEffect(() => {
		setCoverFailed(false)
	}, [coverUrl])

	const card = (
		<motion.div
			className="group relative min-w-0 overflow-hidden rounded-2xl border border-border/70 bg-card text-left shadow-[0_12px_36px_rgba(24,24,35,0.06)] transition-[border-color,box-shadow] duration-300 focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 hover:border-foreground/15 hover:shadow-[0_28px_72px_rgba(24,24,35,0.15)]"
			initial={reduceMotion ? false : { opacity: 0, y: 22, scale: 0.985 }}
			whileInView={{ opacity: 1, y: 0, scale: 1 }}
			viewport={{ once: true, amount: 0.18 }}
			whileHover={reduceMotion ? undefined : { y: -7, rotateX: 1.4, rotateY: -1.4 }}
			whileTap={reduceMotion ? undefined : { scale: 0.985 }}
			transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
			style={{ transformPerspective: 1000 }}
		>
			<button
				type="button"
				className="block w-full text-left focus-visible:outline-none"
				onClick={onClick}
				data-testid={testId}
			>
				<div className={`relative aspect-[16/10] overflow-hidden ${theme.background}`}>
					{showRemoteCover ? (
						<img
							src={coverUrl}
							alt=""
							className="absolute inset-0 size-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.035]"
							onError={(event) => {
								event.currentTarget.style.display = "none"
								setCoverFailed(true)
							}}
						/>
					) : null}
					<div className="absolute inset-y-0 -left-1/2 w-1/2 skew-x-[-18deg] bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.13),transparent)] opacity-0 transition-[transform,opacity] duration-700 ease-out group-hover:translate-x-[320%] group-hover:opacity-100" />
					<div className="absolute inset-0 opacity-30 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:28px_28px] [mask-image:linear-gradient(to_bottom,black,transparent_75%)]" />

					{!showRemoteCover ? (
						<div className="absolute inset-x-4 bottom-3 top-4 overflow-hidden rounded-[14px] border border-white/[0.16] bg-[#f7f8fb] shadow-[0_20px_50px_rgba(0,0,0,0.32)] transition-transform duration-500 ease-out group-hover:-translate-y-1 group-hover:rotate-[0.3deg] group-hover:scale-[1.022]">
							<div className="flex h-5 items-center border-b border-slate-200/80 bg-white px-2.5">
								<div className="flex gap-1">
									<span className="size-1.5 rounded-full bg-slate-300" />
									<span className="size-1.5 rounded-full bg-slate-300" />
									<span className="size-1.5 rounded-full bg-slate-300" />
								</div>
								<div className="mx-auto h-1.5 w-16 rounded-full bg-slate-100" />
							</div>

							<div className="grid h-[calc(100%-20px)] grid-cols-[42px_1fr]">
								<div className="border-r border-slate-200/80 bg-[#f1f2f5] px-2 py-2.5">
									<div
										className={`mb-3 flex size-5 items-center justify-center rounded-md ${theme.accent} text-white shadow-sm`}
									>
										<AppWindow
											className="size-4"
											strokeWidth={1.6}
											aria-hidden
										/>
									</div>
									<div className="space-y-2">
										<div className="h-1.5 rounded-full bg-slate-400/55" />
										<div className="h-1.5 rounded-full bg-slate-300/75" />
										<div className="h-1.5 rounded-full bg-slate-300/75" />
										<div className="h-1.5 rounded-full bg-slate-300/75" />
									</div>
								</div>

								<div className="p-2.5">
									<div className="mb-2 flex items-center justify-between">
										<div>
											<div className="h-1.5 w-14 rounded-full bg-slate-800/80" />
											<div className="mt-1 h-1 w-9 rounded-full bg-slate-300" />
										</div>
										<div
											className={`h-4 w-10 rounded-md ${theme.accent} opacity-90`}
										/>
									</div>

									<div className="grid grid-cols-3 gap-1.5">
										{[1, 2, 3].map((item) => (
											<div
												key={item}
												className="rounded-md border border-slate-200/80 bg-white p-1.5"
											>
												<div className="h-1 w-6 rounded-full bg-slate-300" />
												<div className="mt-1.5 h-2 w-9 rounded-full bg-slate-700/75" />
											</div>
										))}
									</div>

									<div className="mt-1.5 grid grid-cols-[1.35fr_0.65fr] gap-1.5">
										<div className="rounded-md border border-slate-200/80 bg-white p-1.5">
											<svg
												viewBox="0 0 120 42"
												className="h-8 w-full"
												aria-hidden
											>
												<path
													d="M2 34 C18 32 20 16 36 20 S58 30 70 17 S92 8 118 12"
													fill="none"
													className={theme.chart}
													strokeWidth="2.5"
													strokeLinecap="round"
												/>
												<path
													d="M2 37 H118"
													className="stroke-slate-200"
													strokeWidth="1"
												/>
											</svg>
										</div>
										<div className="space-y-1.5 rounded-md border border-slate-200/80 bg-white p-1.5">
											<div className="h-1.5 rounded-full bg-slate-200" />
											<div className="h-1.5 rounded-full bg-slate-200" />
											<div className="h-1.5 w-2/3 rounded-full bg-slate-200" />
										</div>
									</div>
								</div>
							</div>
						</div>
					) : null}
				</div>

				<div className="flex items-center gap-3 px-4 py-3.5">
					<div className="min-w-0 flex-1">
						<p className="truncate text-[15px] font-semibold tracking-[-0.01em] text-foreground">
							{title}
						</p>
						{description ? (
							<p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
								{description}
							</p>
						) : null}
						<p className="mt-1 truncate text-xs text-muted-foreground">{meta}</p>
					</div>
					{statusLabel ? (
						<span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
							{statusLabel}
						</span>
					) : null}
					{external ? (
						<ExternalLink className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground" />
					) : null}
				</div>
			</button>

			{variant === "mobile" ? (
				<button
					type="button"
					className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full border border-white/20 bg-black/35 text-white shadow-sm backdrop-blur-md active:bg-black/50"
					aria-label={t("microAppsPage.actions.more")}
					onClick={(event) => {
						event.stopPropagation()
						setMobileMenuOpen(true)
					}}
					data-testid={`${testId}-more`}
				>
					<MoreHorizontal className="size-4" />
				</button>
			) : null}
		</motion.div>
	)

	if (variant === "desktop") {
		return (
			<ContextMenu>
				<ContextMenuTrigger asChild>{card}</ContextMenuTrigger>
				<ContextMenuContent className="w-44">
					<ContextMenuItem onSelect={onOpenInNewWindow}>
						<ExternalLink className="size-4" />
						{t("microAppsPage.actions.openInNewWindow")}
					</ContextMenuItem>
					<ContextMenuItem onSelect={onRename}>
						<Pencil className="size-4" />
						{t("microAppsPage.actions.rename")}
					</ContextMenuItem>
					<ContextMenuItem variant="destructive" onSelect={onDelete}>
						<Trash2 className="size-4" />
						{t("microAppsPage.actions.deleteApp")}
					</ContextMenuItem>
				</ContextMenuContent>
			</ContextMenu>
		)
	}

	return (
		<>
			{card}
			<Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
				<SheetContent
					side="bottom"
					showClose={false}
					aria-describedby={undefined}
					className="gap-0 rounded-t-[20px] border-0 bg-muted p-3"
				>
					<SheetTitle className="px-2 pb-3 pt-1 text-left text-base">{title}</SheetTitle>
					<div className="overflow-hidden rounded-2xl bg-card">
						<button
							type="button"
							className="flex h-14 w-full items-center gap-3 px-4 text-left text-base active:bg-muted/60"
							onClick={() => {
								setMobileMenuOpen(false)
								onRename()
							}}
						>
							<Pencil className="size-4" />
							{t("microAppsPage.actions.rename")}
						</button>
						<div className="ml-12 h-px bg-border/60" />
						<button
							type="button"
							className="flex h-14 w-full items-center gap-3 px-4 text-left text-base text-destructive active:bg-destructive/10"
							onClick={() => {
								setMobileMenuOpen(false)
								onDelete()
							}}
						>
							<Trash2 className="size-4" />
							{t("microAppsPage.actions.deleteApp")}
						</button>
					</div>
				</SheetContent>
			</Sheet>
		</>
	)
}
