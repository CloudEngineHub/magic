export const widgetStyles = `
:host {
	all: initial;
	--magic-widget-z-index: 2147483000;
	--magic-widget-panel-width: min(420px, calc(100vw - 32px));
	--magic-widget-panel-height: min(680px, calc(100vh - 32px));
	font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

:host([data-magic-widget-root]) {
	display: block;
}

* {
	box-sizing: border-box;
}

[hidden] {
	display: none !important;
}

.magic-widget-trigger {
	position: fixed;
	right: 24px;
	bottom: 24px;
	z-index: var(--magic-widget-z-index);
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 56px;
	width: 56px;
	height: 56px;
	padding: 0;
	border: 0;
	border-radius: 50%;
	background: #2f3338;
	color: #ffffff;
	box-shadow: 0 14px 34px rgba(17, 24, 39, 0.24);
	cursor: grab;
	touch-action: none;
	user-select: none;
	transition:
		transform 180ms ease,
		box-shadow 180ms ease,
		background 180ms ease;
}

.magic-widget-trigger:hover {
	background: #23272c;
	box-shadow: 0 16px 38px rgba(17, 24, 39, 0.3);
	transform: translateY(-1px);
}

.magic-widget-trigger:active {
	cursor: grabbing;
	transform: translateY(0);
}

.magic-widget-trigger:focus-visible,
.magic-widget-close:focus-visible {
	outline: 3px solid rgba(20, 184, 166, 0.38);
	outline-offset: 3px;
}

.magic-widget-trigger svg {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	width: 26px;
	height: 26px;
}

.magic-widget-layer {
	position: fixed;
	inset: 0;
	z-index: calc(var(--magic-widget-z-index) + 1);
	pointer-events: none;
}

.magic-widget-mask {
	position: fixed;
	inset: 0;
	z-index: 0;
	display: none;
	background: rgba(15, 23, 42, 0.34);
	opacity: 0;
	pointer-events: none;
	transition: opacity 180ms ease;
}

.magic-widget-panel {
	position: fixed;
	z-index: 1;
	display: flex;
	flex-direction: column;
	width: var(--magic-widget-panel-width);
	height: var(--magic-widget-panel-height);
	max-width: calc(100vw - 32px);
	max-height: calc(100vh - 32px);
	min-height: 420px;
	overflow: hidden;
	border: 1px solid rgba(148, 163, 184, 0.28);
	border-radius: 12px;
	background: #ffffff;
	box-shadow: 0 24px 70px rgba(15, 23, 42, 0.22);
	pointer-events: auto;
	will-change: opacity, transform;
}

.magic-widget-layer[data-state="opening"] .magic-widget-panel {
	animation: magic-widget-panel-enter 180ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.magic-widget-panel[data-dragging="true"] {
	animation: none !important;
}

.magic-widget-layer[data-state="closing"] .magic-widget-panel {
	animation: magic-widget-panel-exit 180ms cubic-bezier(0.4, 0, 1, 1) both;
}

.magic-widget-header {
	display: flex;
	align-items: center;
	justify-content: space-between;
	flex: 0 0 auto;
	min-height: 48px;
	padding: 0 10px 0 16px;
	border-bottom: 1px solid rgba(148, 163, 184, 0.24);
	color: #111827;
	cursor: grab;
	font: 600 14px/1.2 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
	touch-action: none;
	user-select: none;
}

.magic-widget-header:active {
	cursor: grabbing;
}

.magic-widget-title {
	min-width: 0;
	overflow: hidden;
	text-overflow: ellipsis;
	white-space: nowrap;
}

.magic-widget-close {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	flex: 0 0 32px;
	width: 32px;
	height: 32px;
	border: 0;
	border-radius: 6px;
	background: transparent;
	color: #475569;
	cursor: pointer;
	font: 700 16px/1 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}

.magic-widget-close:hover {
	background: #f1f5f9;
	color: #0f172a;
}

.magic-widget-close svg {
	width: 18px;
	height: 18px;
}

.magic-widget-body {
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
}

.magic-widget-iframe {
	flex: 1 1 auto;
	width: 100%;
	height: 100%;
	min-height: 0;
	border: 0;
	background: #ffffff;
}

.magic-widget-layer[data-render-mode="inline"] {
	position: relative;
	inset: auto;
	width: 100%;
	height: 100%;
	pointer-events: auto;
}

.magic-widget-layer[data-render-mode="inline"] .magic-widget-panel {
	position: relative;
	inset: auto;
	width: 100%;
	height: 100%;
	max-width: none;
	max-height: none;
	min-height: 0;
	border: 0;
	border-radius: 0;
	box-shadow: none;
}

@media (max-width: 640px) {
	.magic-widget-trigger {
		right: 16px;
		bottom: 16px;
		flex-basis: 52px;
		width: 52px;
		height: 52px;
	}

	.magic-widget-panel {
		left: 0 !important;
		right: 0 !important;
		top: auto !important;
		bottom: 0 !important;
		width: 100%;
		height: 86vh;
		max-width: 100%;
		max-height: 86vh;
		min-height: 0;
		border-right-width: 0;
		border-bottom-width: 0;
		border-left-width: 0;
		border-radius: 16px 16px 0 0;
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
		border-bottom-left-radius: 0 !important;
		border-bottom-right-radius: 0 !important;
		transform-origin: center bottom !important;
	}

	.magic-widget-mask {
		display: block;
	}

	.magic-widget-layer[data-state="opening"] .magic-widget-mask,
	.magic-widget-layer[data-state="open"] .magic-widget-mask {
		opacity: 1;
		pointer-events: auto;
	}

	.magic-widget-layer[data-state="closing"] .magic-widget-mask {
		opacity: 0;
		pointer-events: auto;
	}

	.magic-widget-layer[data-state="opening"] .magic-widget-panel {
		animation: magic-widget-sheet-enter 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
	}

	.magic-widget-layer[data-state="closing"] .magic-widget-panel {
		animation: magic-widget-sheet-exit 180ms cubic-bezier(0.4, 0, 1, 1) both;
	}

	.magic-widget-header {
		cursor: default;
	}
}

@keyframes magic-widget-panel-enter {
	from {
		opacity: 0;
		transform: scale(0.72);
	}
	to {
		opacity: 1;
		transform: scale(1);
	}
}

@keyframes magic-widget-panel-exit {
	from {
		opacity: 1;
		transform: scale(1);
	}
	to {
		opacity: 0;
		transform: scale(0.72);
	}
}

@keyframes magic-widget-sheet-enter {
	from {
		opacity: 1;
		transform: translateY(100%);
	}
	to {
		opacity: 1;
		transform: translateY(0);
	}
}

@keyframes magic-widget-sheet-exit {
	from {
		opacity: 1;
		transform: translateY(0);
	}
	to {
		opacity: 1;
		transform: translateY(100%);
	}
}
`
