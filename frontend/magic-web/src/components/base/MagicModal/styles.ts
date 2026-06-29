import { createStyles } from "antd-style"

/** Shared layout tokens for MagicModal header and close button alignment */
const MAGIC_MODAL_HEADER_PADDING_BLOCK = "10px"
const MAGIC_MODAL_HEADER_PADDING_INLINE = "20px"
const MAGIC_MODAL_TITLE_LINE_HEIGHT = "22px"
const MAGIC_MODAL_CLOSE_SIZE = "24px"

export const useStyles = createStyles(({ css, prefixCls, token }) => {
	return {
		header: css`
			--${prefixCls}-modal-header-padding: ${MAGIC_MODAL_HEADER_PADDING_BLOCK}
				${MAGIC_MODAL_HEADER_PADDING_INLINE};
			--${prefixCls}-modal-header-margin-bottom: 0;
			--${prefixCls}-modal-header-border-bottom: 1px solid ${token.colorBorder};

			--magic-modal-header-padding-block: ${MAGIC_MODAL_HEADER_PADDING_BLOCK};
			--magic-modal-header-padding-inline: ${MAGIC_MODAL_HEADER_PADDING_INLINE};
			--magic-modal-title-line-height: ${MAGIC_MODAL_TITLE_LINE_HEIGHT};
			--magic-modal-close-size: ${MAGIC_MODAL_CLOSE_SIZE};

			color: ${token.magicColorUsages.text[1]};

			font-size: 16px;
			font-weight: 600;
			line-height: ${MAGIC_MODAL_TITLE_LINE_HEIGHT};
		`,
		content: css`
			padding: 0 !important;

			--magic-modal-header-padding-block: ${MAGIC_MODAL_HEADER_PADDING_BLOCK};
			--magic-modal-header-padding-inline: ${MAGIC_MODAL_HEADER_PADDING_INLINE};
			--magic-modal-title-line-height: ${MAGIC_MODAL_TITLE_LINE_HEIGHT};
			--magic-modal-close-size: ${MAGIC_MODAL_CLOSE_SIZE};

			/* Anchor target: close button vertically centers against actual header height */
			.${prefixCls}-modal-header {
				anchor-name: --magic-modal-header;
			}

			.${prefixCls}-modal-close {
				position: absolute;
				width: var(--magic-modal-close-size);
				height: var(--magic-modal-close-size);
				inset-inline-end: var(--magic-modal-header-padding-inline);
				padding: 0;
			}

			.${prefixCls}-modal-close-x {
				display: inline-flex;
				align-items: center;
				justify-content: center;
				width: 100%;
				height: 100%;
				line-height: 1;
			}

			/* Primary: anchor to header vertical center (supports multi-line titles) */
			@supports (top: anchor(--magic-modal-header center)) {
				.${prefixCls}-modal-close {
					top: anchor(--magic-modal-header center);
					transform: translateY(-50%);
				}
			}

			/* Fallback: single-line header calc when anchor positioning is unavailable */
			@supports not (top: anchor(--magic-modal-header center)) {
				.${prefixCls}-modal-close {
					top: calc(
						(
								var(--magic-modal-header-padding-block) * 2 +
									var(--magic-modal-title-line-height) - var(
										--magic-modal-close-size
									)
							) /
							2
					);
					transform: none;
				}
			}
		`,
		footer: css`
			--${prefixCls}-modal-footer-padding: 8px 20px;
			--${prefixCls}-modal-footer-margin-top: 0;
			--${prefixCls}-modal-footer-border-top: 1px solid ${token.colorBorder};

			button {
				--${prefixCls}-button-padding-inline: 12px !important;
				min-width: 80px;
			}

			button.${prefixCls}-btn-primary {
				--${prefixCls}-color-primary: ${token.magicColorUsages.primary.default};
				--${prefixCls}-color-primary-hover: ${token.magicColorUsages.primary.hover};
			}

			.${prefixCls}-btn-default {
				border: 0;
			}
		`,
		body: css`
			--${prefixCls}-modal-body-padding: 8px 20px;
		`,
	}
})
