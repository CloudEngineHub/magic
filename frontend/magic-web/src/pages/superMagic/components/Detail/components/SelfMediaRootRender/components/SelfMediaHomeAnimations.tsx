const OPEN_POST_FALLBACK_TRANSITION_MS = 110

function SelfMediaHomeAnimations() {
	return (
		<style>{`
			@keyframes self-media-home-stage-in {
				from {
					opacity: 0;
					transform: translate3d(0, 10px, 0) scale(0.992);
				}
				to {
					opacity: 1;
					transform: translate3d(0, 0, 0) scale(1);
				}
			}
			@keyframes self-media-home-item-in {
				from {
					opacity: 0;
					transform: translate3d(0, 14px, 0);
				}
				to {
					opacity: 1;
					transform: translate3d(0, 0, 0);
				}
			}
			@keyframes bubble-jelly-in {
				0% {
					opacity: 0;
					transform: scale(0.08);
				}
				52% {
					opacity: 1;
					transform: scale(1.12);
				}
				68% {
					transform: scale(0.94);
				}
				82% {
					transform: scale(1.035);
				}
				100% {
					opacity: 1;
					transform: scale(1);
				}
			}
			@keyframes bubble-breathe {
				from { transform: translate3d(0, 0, 0) scale(0.985); }
				to { transform: translate3d(0, -7px, 0) scale(1.018); }
			}
			@keyframes self-media-card-focus-open {
				0% {
					opacity: 1;
					transform: translate3d(0, 0, 0) scale(1);
				}
				44% {
					opacity: 1;
					transform: translate3d(0, -2px, 0) scale(0.998);
				}
				100% {
					opacity: 0.98;
					transform: translate3d(0, var(--open-card-lift), 0) scale(var(--open-card-scale));
				}
			}
			@keyframes self-media-home-dim-out {
				0% {
					opacity: 1;
					transform: translate3d(0, 0, 0) scale(1);
					filter: blur(0);
				}
				100% {
					opacity: 0;
					transform: translate3d(0, 6px, 0) scale(0.992);
					filter: blur(0.5px);
				}
			}
			@keyframes self-media-workspace-view-out {
				from {
					opacity: 1;
					transform: translate3d(0, 0, 0) scale(1);
				}
				to {
					opacity: 0;
					transform: translate3d(0, -4px, 0) scale(0.996);
				}
			}
			@keyframes self-media-workspace-view-in {
				from {
					opacity: 0;
					transform: translate3d(0, 6px, 0) scale(0.996);
				}
				to {
					opacity: 1;
					transform: translate3d(0, 0, 0) scale(1);
				}
			}
			.self-media-home-stage {
				animation: self-media-home-stage-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
				contain: layout;
				view-transition-name: self-media-workspace;
			}
			.self-media-home-enter-item {
				opacity: 0;
				animation: self-media-home-item-in 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
			}
			.self-media-home-opening {
				pointer-events: none;
			}
			.self-media-home-bubble {
				animation: bubble-breathe 4.8s ease-in-out infinite alternate;
			}
			.self-media-home-bubble-core {
				opacity: 0;
				animation: bubble-jelly-in 640ms cubic-bezier(0.22, 1.38, 0.36, 1) both;
				transform-origin: center;
			}
			.self-media-post-card-opening {
				z-index: 80;
				pointer-events: none;
				transform-origin: center center;
				will-change: transform, opacity;
				animation: self-media-card-focus-open ${OPEN_POST_FALLBACK_TRANSITION_MS}ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
			}
			.self-media-post-card-opening .self-media-post-card-button {
				box-shadow: 0 18px 46px rgba(24, 24, 27, 0.14), inset 0 1px rgba(255, 255, 255, 0.82);
			}
			.self-media-post-card-opening .self-media-post-card-artifacts,
			.self-media-post-card-opening .self-media-post-card-actions,
			.self-media-post-card-opening .self-media-post-card-engagement {
				opacity: 0;
				transform: translate3d(0, 4px, 0);
				transition: opacity 110ms ease, transform 110ms ease;
			}
			.self-media-home-opening-dim,
			.self-media-post-card-dimmed {
				animation: self-media-home-dim-out 160ms cubic-bezier(0.2, 0.8, 0.2, 1) both !important;
			}
			@supports (view-transition-name: self-media-workspace) {
				::view-transition-old(self-media-workspace) {
					animation: self-media-workspace-view-out 220ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
				}
				::view-transition-new(self-media-workspace) {
					animation: self-media-workspace-view-in 260ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
				}
			}
			@media (prefers-reduced-motion: reduce) {
				.self-media-home-stage,
				.self-media-home-enter-item,
				.self-media-home-bubble,
				.self-media-home-bubble-core,
				.self-media-post-card-opening,
				.self-media-home-opening-dim,
				.self-media-post-card-dimmed {
					animation: none !important;
					opacity: 1 !important;
					transform: none !important;
				}
			}
		`}</style>
	)
}

export { OPEN_POST_FALLBACK_TRANSITION_MS }
export default SelfMediaHomeAnimations
