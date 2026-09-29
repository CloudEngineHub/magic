import { appendBodyScript } from "./appendBodyScript"

const HOLD_MESSAGE = "ppt-slide-animation-hold"
const RELEASE_MESSAGE = "ppt-slide-animation-release"
const HELD_MESSAGE = "ppt-slide-animation-held"
const HOLD_ACK_TIMEOUT_MS = 250

/**
 * Preview-only bridge that freezes a slide's running animations at their first frame.
 * A recreated slide starts animating while it is still covered by the previous page; freezing it
 * before the swap and releasing it afterwards makes the entrance play exactly once, in view.
 */
export function injectPPTAnimationHoldBridge(content: string, parentOrigin: string): string {
	const origin = JSON.stringify(parentOrigin).replace(/</g, "\\u003c")
	const script = `<script data-injected="true">
(function () {
	if (window.__magicPptHoldCleanup) window.__magicPptHoldCleanup();
	var held = [];
	var svgs = [];
	var safetyTimer = 0;
	function release() {
		window.clearTimeout(safetyTimer);
		held.forEach(function (animation) { try { animation.play(); } catch (_) {} });
		svgs.forEach(function (svg) { try { svg.unpauseAnimations(); } catch (_) {} });
		held = [];
		svgs = [];
	}
	function hold() {
		release();
		var animations = document.getAnimations ? document.getAnimations() : [];
		animations.forEach(function (animation) {
			if (animation.timeline !== document.timeline) return;
			if (typeof CSSTransition !== 'undefined' && animation instanceof CSSTransition) return;
			if (animation.playState === 'paused') return;
			try {
				animation.pause();
				animation.currentTime = 0;
				held.push(animation);
			} catch (_) {}
		});
		[].slice.call(document.querySelectorAll('svg')).forEach(function (svg) {
			if (typeof svg.pauseAnimations !== 'function') return;
			try {
				svg.pauseAnimations();
				svg.setCurrentTime(0);
				svgs.push(svg);
			} catch (_) {}
		});
		// Never leave a slide frozen if the host disappears before releasing it.
		safetyTimer = window.setTimeout(release, 5000);
		window.parent.postMessage({ type: '${HELD_MESSAGE}' }, ${origin});
	}
	function onMessage(event) {
		if (event.source !== window.parent || !event.data) return;
		if (event.data.type === '${HOLD_MESSAGE}') hold();
		else if (event.data.type === '${RELEASE_MESSAGE}') release();
	}
	window.addEventListener('message', onMessage);
	window.__magicPptHoldCleanup = function () {
		window.removeEventListener('message', onMessage);
		release();
	};
})();
</script>`
	return appendBodyScript(content, script)
}

/** Freeze the slide at its first frame. Resolves once acknowledged, or after a short timeout. */
export function holdIframeAnimations(iframe: HTMLIFrameElement | null): Promise<void> {
	const target = iframe?.contentWindow
	if (!target) return Promise.resolve()

	return new Promise((resolve) => {
		const finish = () => {
			window.clearTimeout(timer)
			window.removeEventListener("message", onMessage)
			resolve()
		}
		const onMessage = (event: MessageEvent) => {
			if (event.source === target && event.data?.type === HELD_MESSAGE) finish()
		}
		const timer = window.setTimeout(finish, HOLD_ACK_TIMEOUT_MS)
		window.addEventListener("message", onMessage)
		target.postMessage({ type: HOLD_MESSAGE }, "*")
	})
}

export function releaseIframeAnimations(iframe: HTMLIFrameElement | null): void {
	iframe?.contentWindow?.postMessage({ type: RELEASE_MESSAGE }, "*")
}
