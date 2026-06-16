# JS File Skeleton

Full skeleton for `<preset-name>.js`. Copy and fill in all `<placeholder>` values derived from Step G2.

```js
/**
 * <preset-name>.js
 * <Preset Display Name> ECharts preset library
 *
 * Design language: <one-sentence palette/style summary>
 *
 * Usage (in card HTML):
 *   <div class="<prefix>-card <prefix>-content"
 *        data-echarts-id="chart-id"
 *        data-preset="<preset-name>-bar"
 *        data-preset-params="URL-encoded JSON params">
 *     <div id="chart-id" style="width:100%;height:200px;"></div>
 *   </div>
 *
 *   // In card <script>:
 *   var el = document.getElementById('chart-id');
 *   var p  = JSON.parse(decodeURIComponent(el.closest('[data-preset-params]')
 *              .dataset.presetParams || '{}'));
 *   var option = <PascalCase>Presets.get('<preset-name>-bar', p);
 *   echarts.init(el).setOption(option);
 *
 * Exposes: window.<PascalCase>Presets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   <preset-name>-bar      Vertical/horizontal bar chart
 *   <preset-name>-line     Line trend chart
 *   <preset-name>-donut    Donut / ratio chart
 * ─────────────────────────────────────────────────────────────
 *
 * CSS quick-reference (see <preset-name>.css for full docs)
 * <Copy the §1–§4 class quick-reference here, condensed>
 */
(function (global) {
  'use strict';

  /* ── Design Tokens ── */
  var T = {
    bg:        '<bg-primary>',
    surface:   '<bg-surface>',
    accent:    '<accent>',
    accentL:   '<accent-light>',
    text:      '<text-primary>',
    muted:     '<text-muted>',
    border:    '<border>',
    positive:  '<positive>',
    negative:  '<negative>',
    fontDisplay: '<font-display>',
    fontBody:    '<font-body>'
  };

  var _presets = {};

  function add(name, fn) { _presets[name] = fn; }
  function get(name, params) {
    if (!_presets[name]) { console.warn('[<PascalCase>Presets] unknown preset:', name); return {}; }
    return _presets[name](params || {});
  }

  /* ════════════════════════════════════════
     Preset: <preset-name>-bar
     Vertical bar chart — accent highlight bar(s)
     params: { categories, values, highlightIndex, title }
     ════════════════════════════════════════ */
  add('<preset-name>-bar', function (p) {
    var cats   = p.categories || [];
    var vals   = p.values     || [];
    var hiIdx  = p.highlightIndex != null ? p.highlightIndex : 0;
    return {
      backgroundColor: 'transparent',
      grid: { top: 32, right: 16, bottom: 24, left: 16, containLabel: true },
      xAxis: {
        type: 'category', data: cats,
        axisLabel: { fontFamily: T.fontBody, fontSize: 11, color: T.muted },
        axisLine: { lineStyle: { color: T.border } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontFamily: T.fontBody, fontSize: 10, color: T.muted },
        splitLine: { lineStyle: { color: T.border, type: 'dashed' } }
      },
      series: [{
        type: 'bar',
        data: vals.map(function (v, i) {
          return {
            value: v,
            itemStyle: { color: i === hiIdx ? T.accent : T.surface }
          };
        }),
        label: { show: true, position: 'top', fontFamily: T.fontBody, fontSize: 11, color: T.text }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: <preset-name>-line
     Line trend — accent line + area fill
     params: { xData, yData, smooth, areaOpacity }
     ════════════════════════════════════════ */
  add('<preset-name>-line', function (p) {
    var smooth = p.smooth != null ? p.smooth : true;
    var alpha  = p.areaOpacity != null ? p.areaOpacity : 0.15;
    return {
      backgroundColor: 'transparent',
      grid: { top: 24, right: 16, bottom: 24, left: 16, containLabel: true },
      xAxis: {
        type: 'category', data: p.xData || [],
        axisLabel: { fontFamily: T.fontBody, fontSize: 11, color: T.muted },
        axisLine: { lineStyle: { color: T.border } },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { fontFamily: T.fontBody, fontSize: 10, color: T.muted },
        splitLine: { lineStyle: { color: T.border, type: 'dashed' } }
      },
      series: [{
        type: 'line', smooth: smooth, data: p.yData || [],
        lineStyle: { color: T.accent, width: 2.5 },
        itemStyle: { color: T.accent },
        areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: T.accent.replace(')', ',' + alpha + ')').replace('rgb', 'rgba') },
            { offset: 1, color: 'transparent' }
          ]
        }}
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: <preset-name>-donut
     Donut ratio — accent arc + muted remainder
     params: { value, total, label, unit }
     ════════════════════════════════════════ */
  add('<preset-name>-donut', function (p) {
    var value = p.value || 0;
    var total = p.total || 100;
    var rest  = total - value;
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', radius: ['52%', '72%'], center: ['50%', '50%'],
        label: { show: false },
        data: [
          { value: value, name: p.label || '',
            itemStyle: { color: T.accent } },
          { value: rest,  name: '',
            itemStyle: { color: T.border } }
        ]
      }],
      graphic: [{
        type: 'text', left: 'center', top: 'middle',
        style: { text: value + (p.unit || ''), font: '700 28px ' + T.fontDisplay, fill: T.text }
      }]
    };
  });

  /* ── Export ── */
  global['<PascalCase>Presets'] = { add: add, get: get };

}(window));
```

## Rules for the JS File

- Keep design tokens in `T` object — same hex values as in the CSS `:root` block.
- Include **at least 3 preset chart types** from: bar, line, donut, radar, column, scatter.
- Avoid heavy dependencies. Only use ECharts (assumed present on page). No `fetch`, no DOM manipulation outside of ECharts.
- The IIFE must be wrapped exactly as shown: `(function(global){ ... }(window));`
- Expose only one global: `window.<PascalCase>Presets`.
- Include the full CSS class quick-reference as a JSDoc comment block (condense §1–§4 into a reference list).
