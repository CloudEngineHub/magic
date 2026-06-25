/**
 * warm-journal.js
 * Warm Journal — literary journal / lifestyle record helper library
 *
 * This preset focuses on photo-led handwritten layouts and does not depend on ECharts.
 * This JS file provides helper functions for star ratings and layout utilities.
 *
 * Usage:
 *   // Generate star-rating HTML
 *   WarmJournalKit.stars(4, 5)
 *   // → '<span class="wj-stars"><span class="filled">⭐</span>×4 + empty×1</span>'
 *
 * Exposes: window.WarmJournalKit
 *
 * ─────────────────────────────────────────────────────────────
 * warm-journal.css class quick-reference
 *
 * Card shells:
 *   .wj-card              540×720 base
 *   .wj-card.wj-cover     Cover (photo strip + text band)
 *   .wj-card.wj-dark-page Dark cinematic page
 *   .wj-card.wj-khaki-page Khaki scatter page
 *   .wj-card.wj-photo-page Photo-frame showcase page
 *
 * Photo:
 *   .wj-strip             Full-bleed horizontal photo container (flex: 1)
 *   .wj-strip.wj-no-dim   No vignette overlay
 *   .wj-frame             White photo frame (polaroid feel)
 *   .wj-product-photo     Scattered product image (absolute; needs transparent PNG cutout)
 *   .wj-product-photo.wj-blend  Fallback for non-transparent images (mix-blend-mode: multiply)
 *   .wj-rotate-l/r/sl/sr  Rotation helpers
 *
 * Typography:
 *   .wj-hand              Handwritten font base class
 *   .wj-hand-xl/lg/md/sm  Handwritten font sizes (44/34/24/18px)
 *   .wj-body-text         Body text
 *   .wj-page-num          Handwritten page number
 *   .wj-stars             Star-rating container
 *   .wj-num               Number circle
 *
 * Layout:
 *   .wj-text-band         Cream text band for cover
 *   .wj-text-band .wj-sub Text-band subtitle
 *   .wj-product-info      Product review info block
 *   .wj-product-title     Product title
 *   .wj-rating-row        Rating row (.label + .wj-stars)
 *   .wj-product-scene     Suitable scene
 *   .wj-product-exp       Usage experience
 *   .wj-overlay-text      Overlay text area on dark page
 *   .wj-scatter-header    Khaki-page header area (with .wj-intro)
 *   .wj-scatter-item      Scatter-positioned container (absolute)
 *   .wj-frame-caption     Caption below photo frame
 *   .wj-brand-bar         Bottom brand bar
 *   .wj-dark-heading      Dark-page heading position container
 *
 * Utilities:
 *   .wj-abs/.wj-rel       Positioning
 *   .wj-z1/.wj-z5         Stacking level
 *   .wj-flex/.wj-flex-col Flex layout
 *   .wj-flex-1            flex:1
 *   .wj-gap-4/8/12/16     Spacing
 *   .wj-w-full            100% width
 *   .wj-color-light/muted Text color
 */
(function (global) {
    'use strict';

    var Kit = {};

    /**
     * Generate star-rating HTML
     * @param {number} filled - Number of filled stars
     * @param {number} total  - Total stars (default 5)
     * @returns {string} HTML string
     */
    Kit.stars = function (filled, total) {
        total = total || 5;
        var html = '<span class="wj-stars">';
        for (var i = 0; i < total; i++) {
            if (i < filled) {
                html += '<span class="filled">⭐</span>';
            } else {
                html += '<span class="empty">☆</span>';
            }
        }
        html += '</span>';
        return html;
    };

    /**
     * Generate number-circle HTML
     * @param {number|string} n - Number
     * @returns {string} HTML string
     */
    Kit.num = function (n) {
        return '<span class="wj-num">' + n + '</span>';
    };

    /**
     * Generate rating-row HTML
     * @param {string} label - Label text
     * @param {number} score - Star count
     * @param {number} total - Total stars
     * @returns {string} HTML string
     */
    Kit.ratingRow = function (label, score, total) {
        return '<div class="wj-rating-row"><span class="label">' + label + '：</span>' + Kit.stars(score, total) + '</div>';
    };

    global.WarmJournalKit = Kit;

})(typeof window !== 'undefined' ? window : this);
