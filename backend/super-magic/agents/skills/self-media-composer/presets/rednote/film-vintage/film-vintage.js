/**
 * film-vintage.js
 * Film Vintage ECharts preset library
 *
 * Design language: warm cream background + brown tones + film texture, simulating polaroid photography
 *
 * Usage (in card HTML):
 *   <div class="fv-card fv-content"
 *        data-echarts-id="chart-id"
 *        data-preset="film-vintage-bar"
 *        data-preset-params="URL-encoded JSON params">
 *     <div id="chart-id" style="width:100%;height:200px;"></div>
 *   </div>
 *
 *   // In card <script>:
 *   var el = document.getElementById('chart-id');
 *   var p  = JSON.parse(decodeURIComponent(el.closest('[data-preset-params]')
 *              .dataset.presetParams || '{}'));
 *   var option = FilmVintagePresets.get('film-vintage-bar', p);
 *   echarts.init(el).setOption(option);
 *
 * Exposes: window.FilmVintagePresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   film-vintage-bar      Vertical/horizontal bar chart
 *   film-vintage-line     Line trend chart
 *   film-vintage-donut    Donut / ratio chart
 * ─────────────────────────────────────────────────────────────
 *
 * CSS quick-reference (see film-vintage.css for full docs)
 *
 * Card shells:
 *   .fv-card          Base 540×720 shell
 *   .fv-cover         Cover card variant (centered, title/subtitle/author)
 *   .fv-content       Content card variant (photo display)
 *
 * Components:
 *   .fv-photo-frame   Polaroid-style photo frame (white border + bottom caption area)
 *   .fv-caption       Photo title bar
 *   .fv-info-footer   Bottom info bar (shooting parameters)
 *   .fv-info-row      Info row (label + value)
 *   .fv-meta-row      Metadata row (icon + text)
 *   .fv-section-label Section label
 *   .fv-divider       Divider
 *
 * Utilities:
 *   .fv-text-accent / .fv-text-muted / .fv-text-primary
 *   .fv-badge / .fv-badge-outline / .fv-tag
 *   .fv-bg-surface / .fv-bg-footer
 *
 * Layout:
 *   .fv-row / .fv-col / .fv-spacer / .fv-center
 *   .fv-gap-xs/sm/md/lg
 *   .fv-mb-sm/md/lg / .fv-mt-sm/md/lg
 */
(function (global) {
  'use strict';

  /* ── Design Tokens ── */
  var T = {
    bg:        '#1A1A1A',
    surface:   '#FFFFFF',
    footer:    '#F5F5F5',
    accent:    '#D32F2F',
    accentL:   '#E57373',
    text:      '#212121',
    muted:     '#757575',
    border:    '#E0E0E0',
    shadow:    '#BDBDBD',
    fontDisplay: '"Noto Serif SC", Georgia, serif',
    fontBody:    '"Noto Sans SC", -apple-system, sans-serif',
    fontMono:    '"SF Mono", "Courier New", monospace'
  };

  var _presets = {};

  function add(name, fn) { _presets[name] = fn; }
  function get(name, params) {
    if (!_presets[name]) { 
      console.warn('[FilmVintagePresets] unknown preset:', name); 
      return {}; 
    }
    return _presets[name](params || {});
  }

  /* ════════════════════════════════════════
     Preset: film-vintage-bar
     Vertical bar chart — accent highlight bar(s)
     params: { categories, values, highlightIndex, title }
     ════════════════════════════════════════ */
  add('film-vintage-bar', function (p) {
    var cats   = p.categories || [];
    var vals   = p.values     || [];
    var hiIdx  = p.highlightIndex != null ? p.highlightIndex : 0;
    return {
      backgroundColor: 'transparent',
      grid: { 
        top: 40, 
        right: 24, 
        bottom: 32, 
        left: 24, 
        containLabel: true 
      },
      xAxis: {
        type: 'category', 
        data: cats,
        axisLabel: { 
          fontFamily: T.fontBody, 
          fontSize: 11, 
          color: T.muted,
          rotate: cats.length > 5 ? 15 : 0
        },
        axisLine: { lineStyle: { color: T.border, width: 1.5 } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { 
          fontFamily: T.fontMono, 
          fontSize: 10, 
          color: T.muted 
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { 
          lineStyle: { 
            color: T.border, 
            type: 'dashed',
            opacity: 0.5
          } 
        }
      },
      series: [{
        type: 'bar',
        barWidth: '60%',
        data: vals.map(function (v, i) {
          return {
            value: v,
            itemStyle: { 
              color: i === hiIdx ? T.accent : T.accentL,
              borderRadius: [2, 2, 0, 0]
            }
          };
        }),
        label: { 
          show: true, 
          position: 'top', 
          fontFamily: T.fontMono, 
          fontSize: 11, 
          color: T.text,
          fontWeight: 600
        }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: film-vintage-line
     Line trend — accent line + area fill
     params: { xData, yData, smooth, areaOpacity }
     ════════════════════════════════════════ */
  add('film-vintage-line', function (p) {
    var smooth = p.smooth != null ? p.smooth : true;
    var alpha  = p.areaOpacity != null ? p.areaOpacity : 0.12;
    return {
      backgroundColor: 'transparent',
      grid: { 
        top: 32, 
        right: 24, 
        bottom: 32, 
        left: 24, 
        containLabel: true 
      },
      xAxis: {
        type: 'category', 
        data: p.xData || [],
        axisLabel: { 
          fontFamily: T.fontBody, 
          fontSize: 11, 
          color: T.muted 
        },
        axisLine: { lineStyle: { color: T.border, width: 1.5 } },
        axisTick: { show: false },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: { 
          fontFamily: T.fontMono, 
          fontSize: 10, 
          color: T.muted 
        },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { 
          lineStyle: { 
            color: T.border, 
            type: 'dashed',
            opacity: 0.5
          } 
        }
      },
      series: [{
        type: 'line', 
        smooth: smooth, 
        data: p.yData || [],
        lineStyle: { 
          color: T.accent, 
          width: 2.5 
        },
        itemStyle: { 
          color: T.accent,
          borderWidth: 2,
          borderColor: T.surface
        },
        symbol: 'circle',
        symbolSize: 6,
        areaStyle: { 
          color: {
            type: 'linear', 
            x: 0, y: 0, x2: 0, y2: 1,
            colorStops: [
              { offset: 0, color: 'rgba(139, 115, 85, ' + alpha + ')' },
              { offset: 1, color: 'transparent' }
            ]
          }
        }
      }]
    };
  });

  /* ════════════════════════════════════════
     Preset: film-vintage-donut
     Donut ratio — accent arc + muted remainder
     params: { value, total, label, unit }
     ════════════════════════════════════════ */
  add('film-vintage-donut', function (p) {
    var value = p.value || 0;
    var total = p.total || 100;
    var rest  = total - value;
    return {
      backgroundColor: 'transparent',
      series: [{
        type: 'pie', 
        radius: ['50%', '70%'], 
        center: ['50%', '50%'],
        avoidLabelOverlap: false,
        label: { show: false },
        labelLine: { show: false },
        data: [
          { 
            value: value, 
            name: p.label || '',
            itemStyle: { 
              color: T.accent,
              borderColor: T.surface,
              borderWidth: 2
            } 
          },
          { 
            value: rest,  
            name: '',
            itemStyle: { 
              color: T.border,
              borderColor: T.surface,
              borderWidth: 2
            } 
          }
        ]
      }],
      graphic: [{
        type: 'text', 
        left: 'center', 
        top: 'middle',
        style: { 
          text: value + (p.unit || ''), 
          font: '700 32px ' + T.fontDisplay, 
          fill: T.text,
          textAlign: 'center'
        }
      }]
    };
  });

  /* ── Export ── */
  global['FilmVintagePresets'] = { add: add, get: get };

}(window));
