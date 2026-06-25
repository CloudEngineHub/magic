/**
 * personal-insight.js
 * Personal Insight — ECharts chart preset library
 *
 * Design language: clean white backgrounds, minimal decoration,
 * blue accent (#1A73E8), warm accent (#FF7043), comfortable reading.
 * Suited for knowledge sharing, reading notes, personal reflections.
 *
 * Usage (in card HTML):
 *   <div class="pi-card pi-content"
 *        data-echarts-id="chart-id"
 *        data-preset="pi-comparison-bar"
 *        data-preset-params="URL-encoded JSON params">
 *     ...
 *     <div id="chart-id" style="width:100%;height:200px;"></div>
 *   </div>
 *
 * Add a new preset: PIPresets.add('preset-name', function(params) { return echartsOption; })
 *
 * Exposes: window.PIPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   pi-comparison-bar  Horizontal comparison bar (blue highlight vs gray)
 *   pi-progress-bar    Vertical progress/timeline bars
 *   pi-pie-simple      Simple pie chart (blue palette)
 *   pi-line-simple     Simple line chart (blue line, minimal)
 * ─────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────
 * personal-insight.css class quick-reference
 *
 * §1  Card Shell
 *   .pi-card           Base card shell (540×720)
 *   .pi-cover          Cover type (white bg); .warm → warm tint; .blue → blue tint
 *   .pi-content        Content type (white bg, flex column)
 *
 * §2  Cover Components
 *   .pi-profile        Profile row (avatar + name + date)
 *   .pi-avatar         Avatar circle (gradient bg)
 *   .pi-avatar-info    Name + date container
 *   .pi-author         Author name
 *   .pi-date           Date text
 *   .pi-cover-title    Large cover title; .sm → smaller
 *   .pi-abstract       Cover abstract/summary text
 *   .pi-cover-deco     Bottom decoration container
 *   .pi-cover-deco-line  Gradient line
 *   .pi-cover-deco-text  Decoration text
 *
 * §3  Content Components
 *   .pi-header         Page header; .pi-header-label + .pi-header-page
 *   .pi-num            Large section number; .sm → smaller; .blue → blue color
 *   .pi-heading        Section heading (20px); .lg → larger (24px)
 *   .pi-text           Body paragraph; .sm → smaller; .lg → larger
 *   .pi-keypoint       Key point card; .blue → blue accent; .warm → warm accent
 *   .pi-keypoint-label  Card label text
 *   .pi-keypoint-title  Card title
 *   .pi-keypoint-body   Card body text
 *   .pi-numbered-list   Numbered list container
 *   .pi-numbered-item   List item row
 *   .pi-item-num        Number circle; .blue → blue bg
 *   .pi-item-content    Item right content
 *   .pi-item-title      Item title
 *   .pi-item-desc       Item description
 *   .pi-quote           Quote block; .blue → blue variant
 *   .pi-quote-text      Quote text (italic)
 *   .pi-tip             Tip box; .warn → warning variant
 *   .pi-tip-icon        Tip icon
 *   .pi-tip-text        Tip text
 *   .pi-divider         Divider; .dashed → dashed; .dots → dot style
 *   .pi-footer          Bottom footer
 *   .pi-footer-author   Author text
 *   .pi-footer-page     Page number (blue)
 *   .pi-ending          Centered ending block
 *   .pi-ending-emoji    Large emoji
 *   .pi-ending-title    Ending title
 *   .pi-ending-text     Ending body text
 *   .pi-ending-tags     Tag row
 *   .pi-ending-tag      Single tag (blue rounded)
 *
 * §4  Utilities
 *   .pi-text-blue / .pi-text-warm / .pi-text-muted / .pi-text-dark / .pi-text-green
 *   .pi-bg-blue / .pi-bg-warm / .pi-bg-gray
 *   .pi-hl              Yellow underline highlight
 *   .pi-hl-blue         Blue underline highlight
 *   .pi-bold / .pi-em
 *   .pi-tag             Gray tag; .blue → blue variant
 *
 * §5  Layout Helpers
 *   .pi-grid-2         Two-column grid
 *   .pi-row            Flex row
 *   .pi-col            Flex column
 *   .pi-spacer         Flex spacer
 *   .pi-center         Center align
 *   .pi-mt-auto        Margin top auto
 * ─────────────────────────────────────────────────────────────
 */
(function (global) {
    'use strict';

    /* ── Shared Tokens ── */
    var T = {
        blue: '#1A73E8',
        blueLight: '#4A9AF5',
        blueMuted: '#B3D4FC',
        warm: '#FF7043',
        green: '#43A047',
        black: '#1A1A1A',
        gray: '#999999',
        grayLight: '#EEEEEE',
        white: '#FFFFFF',
        fontSans: 'Noto Sans SC, PingFang SC, sans-serif'
    };

    var _presets = {};

    /* ════════════════════════════════════════
       Preset: pi-comparison-bar
       Horizontal comparison bar chart
       params: {
         labels:    string[]  Item names (Y-axis)
         values:    number[]  Values
         heroIndex: number    Highlighted item (default 0)
         unit:      string    Optional unit suffix
       }
       ════════════════════════════════════════ */
    _presets['pi-comparison-bar'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];
        var heroIdx = params.heroIndex != null ? params.heroIndex : 0;
        var unit = params.unit || '';

        var data = values.map(function (v, i) {
            var isHero = (i === heroIdx);
            return {
                value: v,
                itemStyle: {
                    color: isHero ? T.blue : T.grayLight,
                    borderRadius: [0, 4, 4, 0]
                },
                label: {
                    show: true,
                    position: 'right',
                    fontFamily: T.fontSans,
                    fontSize: 12,
                    fontWeight: 600,
                    color: isHero ? T.blue : T.gray,
                    formatter: '{c}' + unit
                }
            };
        });

        return {
            backgroundColor: 'transparent',
            grid: { top: 8, right: 56, bottom: 8, left: 8, containLabel: true },
            xAxis: {
                type: 'value',
                axisLabel: { show: false },
                axisLine: { show: false },
                splitLine: { show: false }
            },
            yAxis: {
                type: 'category',
                data: labels,
                axisLine: { show: false },
                axisTick: { show: false },
                axisLabel: {
                    fontFamily: T.fontSans,
                    fontSize: 12,
                    color: T.black
                }
            },
            series: [{
                type: 'bar',
                data: data,
                barWidth: 18
            }]
        };
    };

    /* ════════════════════════════════════════
       Preset: pi-progress-bar
       Vertical bar chart showing progress/comparison
       params: {
         labels:  string[]  X-axis labels
         values:  number[]  Values
         colors:  string[]  Optional per-bar colors
       }
       ════════════════════════════════════════ */
    _presets['pi-progress-bar'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];
        var colors = params.colors || [];

        var data = values.map(function (v, i) {
            return {
                value: v,
                itemStyle: {
                    color: colors[i] || (i === 0 ? T.blue : T.grayLight),
                    borderRadius: [4, 4, 0, 0]
                }
            };
        });

        return {
            backgroundColor: 'transparent',
            grid: { top: 16, right: 16, bottom: 24, left: 16, containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: { lineStyle: { color: T.grayLight } },
                axisTick: { show: false },
                axisLabel: { fontFamily: T.fontSans, fontSize: 11, color: T.gray }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: T.grayLight, type: 'dashed' } },
                axisLabel: { fontFamily: T.fontSans, fontSize: 10, color: T.gray }
            },
            series: [{
                type: 'bar',
                data: data,
                barWidth: 28,
                label: {
                    show: true,
                    position: 'top',
                    fontFamily: T.fontSans,
                    fontSize: 11,
                    fontWeight: 600,
                    color: T.black
                }
            }]
        };
    };

    /* ════════════════════════════════════════
       Preset: pi-pie-simple
       Clean pie chart with blue palette
       params: {
         segments: [{name, value}]  Segment data
       }
       ════════════════════════════════════════ */
    _presets['pi-pie-simple'] = function (params) {
        var segments = params.segments || [];
        var colors = [T.blue, T.blueLight, T.blueMuted, '#FFD93D', T.warm, T.green];

        var data = segments.map(function (s, i) {
            return {
                name: s.name,
                value: s.value,
                itemStyle: { color: colors[i % colors.length] }
            };
        });

        return {
            backgroundColor: 'transparent',
            series: [{
                type: 'pie',
                radius: ['40%', '70%'],
                center: ['50%', '50%'],
                data: data,
                label: {
                    show: true,
                    fontSize: 11,
                    fontFamily: T.fontSans,
                    color: T.black,
                    formatter: '{b}\n{d}%'
                },
                labelLine: { lineStyle: { color: T.grayLight } },
                itemStyle: { borderColor: '#fff', borderWidth: 2 }
            }]
        };
    };

    /* ════════════════════════════════════════
       Preset: pi-line-simple
       Minimal line chart
       params: {
         labels:  string[]  X-axis labels
         values:  number[]  Y values
         title:   string    Optional series name
       }
       ════════════════════════════════════════ */
    _presets['pi-line-simple'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];
        var title = params.title || '';

        return {
            backgroundColor: 'transparent',
            grid: { top: 20, right: 16, bottom: 24, left: 16, containLabel: true },
            xAxis: {
                type: 'category',
                data: labels,
                axisLine: { lineStyle: { color: T.grayLight } },
                axisTick: { show: false },
                axisLabel: { fontFamily: T.fontSans, fontSize: 10, color: T.gray }
            },
            yAxis: {
                type: 'value',
                axisLine: { show: false },
                axisTick: { show: false },
                splitLine: { lineStyle: { color: T.grayLight, type: 'dashed' } },
                axisLabel: { fontFamily: T.fontSans, fontSize: 10, color: T.gray }
            },
            series: [{
                name: title,
                type: 'line',
                data: values,
                smooth: false,
                symbol: 'circle',
                symbolSize: 6,
                lineStyle: { color: T.blue, width: 2 },
                itemStyle: { color: T.blue, borderColor: '#fff', borderWidth: 2 },
                areaStyle: {
                    color: {
                        type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
                        colorStops: [
                            { offset: 0, color: 'rgba(26, 115, 232, 0.15)' },
                            { offset: 1, color: 'rgba(26, 115, 232, 0.01)' }
                        ]
                    }
                }
            }]
        };
    };

    /* ── Public API ── */
    var PIPresets = {
        get: function (name, params) {
            if (!_presets[name]) {
                console.warn('[PIPresets] Unknown preset: ' + name);
                return {};
            }
            return _presets[name](params || {});
        },
        add: function (name, fn) {
            _presets[name] = fn;
        },
        list: function () {
            return Object.keys(_presets);
        }
    };

    global.PIPresets = PIPresets;
})(window);
