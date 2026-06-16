export const selfMediaOverlayStyles = {
	dialogSurface:
		"overflow-hidden border-0 bg-[#f8f8f9] p-0 shadow-[0_24px_72px_rgba(24,24,27,0.18)]",
	alertSurface: "border-0 bg-[#f8f8f9] p-6 shadow-[0_24px_72px_rgba(24,24,27,0.18)]",
	dialogHeader: "gap-1 border-b border-[#18181b]/[0.06] px-6 py-5",
	dialogTitle: "text-2xl font-[780] leading-tight tracking-tight text-[#18181b]",
	dialogDescription: "text-xs leading-relaxed text-[#71717a]",
	dialogBody: "min-h-0 overflow-y-auto px-4 py-4 sm:px-6",
	dialogFooter: "border-t border-[#18181b]/[0.06] px-6 py-4",
	loadingPanel:
		"flex items-center justify-center gap-2 rounded-[24px] bg-white/90 text-sm font-medium text-[#71717a] shadow-[inset_0_1px_rgba(255,255,255,0.82)]",
	contentPanel: "rounded-[24px] bg-white/90 shadow-[inset_0_1px_rgba(255,255,255,0.82)]",
	sectionPanel: "rounded-[18px] border-0 bg-[#f8f8f9]",
	floatingPanel:
		"rounded-[20px] border-0 bg-white/95 shadow-[0_18px_44px_rgba(24,24,27,0.14),inset_0_1px_rgba(255,255,255,0.82)]",
	manualOverlay: "bg-[#111827]/45 p-4 backdrop-blur-md duration-200 animate-in fade-in",
	manualPanel:
		"relative w-full max-w-sm overflow-hidden rounded-[24px] bg-[#f8f8f9] p-6 shadow-[0_24px_72px_rgba(24,24,27,0.18)] duration-200 animate-in zoom-in-95 slide-in-from-bottom-2",
	primaryButton:
		"rounded-[25px] bg-[#18181b] px-6 font-[800] text-white shadow-[0_18px_34px_rgba(24,24,27,0.18)] transition-transform hover:-translate-y-0.5 hover:bg-[#18181b] disabled:hover:translate-y-0",
	secondaryButton:
		"rounded-[25px] border-0 bg-white px-5 text-[#18181b] shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)] hover:bg-white/85",
	primaryButtonCompact:
		"rounded-full bg-[#18181b] px-3 font-[700] text-white shadow-[0_10px_22px_rgba(24,24,27,0.14)] hover:bg-[#18181b]",
	secondaryButtonCompact:
		"rounded-full border-0 bg-white px-3 text-[#18181b] shadow-[inset_0_0_0_1px_rgba(24,24,27,0.08)] hover:bg-white/85",
	floatingButton:
		"rounded-full bg-[#18181b] text-white shadow-[0_18px_34px_rgba(24,24,27,0.18)] transition hover:-translate-y-0.5 hover:bg-[#18181b] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#18181b]/15 active:scale-[0.98]",
}
