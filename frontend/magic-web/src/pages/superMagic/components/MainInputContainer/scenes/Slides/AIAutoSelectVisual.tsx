export default function AIAutoSelectVisual() {
	return (
		<div
			className="pointer-events-none absolute inset-0 isolate overflow-hidden rounded-lg bg-[#fafbff] ring-1 ring-inset ring-violet-200/35"
			data-testid="slides-template-ai-visual"
			aria-hidden="true"
		>
			<div className="absolute -bottom-24 -left-12 -top-24 w-64 animate-[spin_14s_linear_infinite] bg-[conic-gradient(from_40deg,#d8fff4,#ccecff,#d9d2ff,#f3d4ff,#ffdce9,#fff0c9,#d8fff4)] opacity-70 blur-2xl will-change-transform motion-reduce:animate-none" />
			<div className="absolute -inset-x-12 inset-y-0 animate-pulse bg-[linear-gradient(112deg,transparent_8%,rgba(255,255,255,0.88)_34%,rgba(219,234,254,0.32)_52%,transparent_76%)] blur-lg motion-reduce:animate-none" />
			<div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.1)_0%,rgba(255,255,255,0.38)_58%,rgba(255,255,255,0.92)_100%)]" />
		</div>
	)
}
