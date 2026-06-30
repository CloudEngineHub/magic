/**
 * dark-tech.js
 * Dark-Tech ECharts chart preset library
 *
 * Design language: deep black background (#080808), gold accent (#c8a96e),
 * thin 1px borders, gradient fills, no hard shadows.
 * Inspired by DJI Pocket review card series.
 *
 * Usage (in card HTML):
 *   <div class="dt-card dt-content"
 *        data-echarts-id="chart-id"
 *        data-preset="dark-tech-compare-bar"
 *        data-preset-params="URL-encoded JSON params">
 *     ...
 *     <div id="chart-id" style="width:100%;height:200px;"></div>
 *   </div>
 *
 * Add a new preset: DTPresets.add('preset-name', function(params) { return echartsOption; })
 *
 * Exposes: window.DTPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   dark-tech-compare-bar  Side-by-side horizontal comparison bar (muted A vs gold B)
 *   dark-tech-radar        Radar capability chart (muted A vs gold B)
 *   dark-tech-line         Line trend chart (gold line + glow area, optional muted reference)
 *   dark-tech-donut        Donut ratio chart (gold main arc, dark remainder)
 *   dark-tech-column       Vertical column chart (gold highlight for new/winner bars)
 * ─────────────────────────────────────────────────────────────
 *
 * ─────────────────────────────────────────────────────────────
 * dark-tech.css class quick-reference
 *
 * CSS Variables (override in :root to theme)
 *   --dt-bg        #080808   Deep black background
 *   --dt-surface   #111111   Card surface
 *   --dt-surface2  #1a1a1a   Elevated surface
 *   --dt-gold      #c8a96e   Gold accent (primary)
 *   --dt-gold-l    #e2c98a   Gold light (highlight text)
 *   --dt-white     #f0f0f0   Primary text
 *   --dt-muted     #888888   Secondary text
 *   --dt-border    #222222   Default border
 *   --dt-border2   #2e2e2e   Elevated border
 *   --dt-green     #4caf80   Upgrade / positive
 *   --dt-red       #e05252   Downgrade / negative
 *
 * §1  Card Shell
 *   .dt-card             Base card shell (540×720)
 *   .dt-cover            Cover type (full-bleed image bg)
 *   .dt-content          Content type (dark bg, flex column)
 *
 * §1.1  Cover components
 *   .dt-cover-bg         Background image layer (set background-image inline)
 *   .dt-cover-gradient   Gradient overlay (transparent top → black bottom)
 *   .dt-top-bar          Top brand bar container
 *   .dt-brand-tag        Brand label (gold, uppercase, letter-spaced)
 *   .dt-issue-tag        Issue / date label (muted)
 *   .dt-cover-content    Bottom content area
 *   .dt-label-row        Label + extending gold line row
 *   .dt-label-badge      Gold solid badge
 *   .dt-label-line       Extending gradient line
 *   .dt-product-vs       Product VS row container
 *   .dt-product-name     Product name (white); .is-new → gold-light
 *   .dt-vs-badge         Circular VS badge (gold border)
 *   .dt-cover-title      Cover main title (44px); .highlight → gold
 *   .dt-cover-sub        Cover subtitle (light weight, muted, letter-spaced)
 *   .dt-tag-row          Keyword tag row
 *   .dt-tag              Keyword tag; .active → gold border + text
 *
 * §2  Content Components
 *   .dt-header           Page header container
 *   .dt-page-title       Page title (36px); .sub → light subtitle block
 *   .dt-page-title-sm    Page title smaller (32px)
 *   .dt-divider          Thin 1px horizontal divider
 *   .dt-section-label    Gold dot + uppercase section label
 *
 *   .dt-compare-grid     Two-column product comparison grid
 *   .dt-device-card      Device card; .is-new → gold border + gradient bg + NEW badge
 *   .dt-device-model     Device model name; .is-new parent → gold-light
 *   .dt-device-year      Release year (muted, small)
 *   .dt-device-img       Image area (aspect 3:4)
 *   .dt-spec-list        Spec key-value list
 *   .dt-spec-item        Single spec row
 *   .dt-spec-key         Spec key (muted, small)
 *   .dt-spec-val         Spec value; .upgraded → gold; .tag-new → inline mini badge
 *
 *   .dt-data-cards       2-column data card grid
 *   .dt-data-card        Metric card; .highlight → gold border + gradient bg
 *   .dt-data-card .label  Metric label (muted, uppercase)
 *   .dt-data-card .value  Large number; .highlight parent → gold-light
 *   .dt-data-card .unit   Unit text (muted)
 *   .dt-data-card .badge  Top-right upgrade badge (gold)
 *
 *   .dt-compare-section  Compare rows container (flex, fills space)
 *   .dt-compare-row      3-col compare row: val-a | spec-name | val-b
 *   .dt-compare-row .val-a   Left value (muted)
 *   .dt-compare-row .spec-name  Center spec label
 *   .dt-compare-row .val-b   Right value; .win → gold
 *   .dt-win-icon         Inline win star icon (gold)
 *
 *   .dt-table-header     Spec table header row
 *   .dt-th               Table header cell; .spec-col / .col-a / .col-b
 *   .dt-table-body       Table body container
 *   .dt-table-row        Table data row; .price-row → emphasis
 *   .dt-td               Table data cell; .spec-name / .val-a / .val-b / .win
 *   .dt-win-mark         Inline win arrow/star (gold)
 *
 *   .dt-vote-options     Vote button list container
 *   .dt-vote-btn         Vote button; .active / :hover → gold border; .is-new → gold-light label
 *   .dt-vote-btn .btn-label  Button main label
 *   .dt-vote-btn .btn-sub    Button sub-label (muted)
 *   .dt-vote-btn .btn-icon   Right-side emoji/icon
 *   .dt-row-divider      Centered divider with text (.line + .text)
 *
 *   .dt-note             Gold left-border note block (small)
 *   .dt-note-lg          Gold left-border note block (larger)
 *   .dt-note strong      Gold emphasized text inside note
 *
 * §2.11  Decorative elements
 *   .dt-deco-line-left   Vertical gold line from top-left
 *   .dt-deco-line-top    Vertical gold line from top-center
 *   .dt-deco-line-bottom Vertical gold line from bottom-center
 *   .dt-bg-glow          Radial gold glow background decoration
 *   .dt-page-num         Bottom-right page number
 *   .dt-eyebrow          Uppercase gold eyebrow label
 *   .dt-question         Large centered question (40px); em → gold
 *
 * §3  Utility Classes (dt-*)
 *   .dt-badge-gold       Gold solid badge
 *   .dt-badge-outline    Gold outline badge
 *   .dt-tag-surface      Dark surface tag (muted)
 *   .dt-tag-up           Green upgrade indicator
 *   .dt-tag-down         Red downgrade indicator
 *
 *   .dt-hl-gold          Gold text highlight
 *   .dt-hl-gold-l        Gold-light text
 *   .dt-bg-gold          Gold background inline highlight
 *   .dt-hl-green         Green positive text
 *   .dt-hl-red           Red negative text
 *
 *   .dt-text-gold / .dt-text-gold-l / .dt-text-white
 *   .dt-text-muted / .dt-text-green / .dt-text-red
 *
 *   .dt-divider-sm       1px dark divider
 *   .dt-divider-gold     Short gold accent divider (32px)
 *   .dt-divider-gold-full  Full-width gold gradient divider
 *
 * §4  Layout Helpers
 *   .dt-grid-2           Two-column equal grid
 *   .dt-grid-3           Three-column equal grid
 *   .dt-grid-spec        Three-column spec table grid (2:1.6:1.6)
 *   .dt-row              Flex row, space-between
 *   .dt-col-fill         Flex column, fills remaining space
 *   .dt-stat             Stat number + unit container
 *   .dt-stat-num         Large stat number (40px, gold-light)
 *   .dt-stat-unit        Stat unit (muted)
 *   .dt-stat-label       Stat label (muted, small)
 *   .dt-engage-text      Centered interaction text (light weight)
 *   .dt-hashtags         Centered hashtag row
 *   .dt-hashtag          Single hashtag (muted)
 * ─────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // Shared Dark-Tech color tokens
  var DT = {
    bg: '#080808',
    surface: '#111111',
    surface2: '#1a1a1a',
    gold: '#c8a96e',
    goldL: '#e2c98a',
    white: '#f0f0f0',
    muted: '#888888',
    muted2: '#555555',
    border: '#222222',
    border2: '#2e2e2e',
    green: '#4caf80',
    red: '#e05252'
  };

  var _presets = {};

  // ─────────────────────────────────────────
  // dark-tech-compare-bar
  // Horizontal side-by-side bar chart for two products.
  // Product A: muted/gray  |  Product B: gold gradient (the "winner")
  // params: {
  //   specs:   string[]   Spec names (Y-axis, top-to-bottom order)
  //   valA:    number[]   Values for product A
  //   valB:    number[]   Values for product B
  //   nameA:   string     Product A label (default 'A')
  //   nameB:   string     Product B label (default 'B')
  //   unit:    string     Value unit (default '')
  //   maxVal:  number     Optional fixed X-axis max
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-compare-bar'] = function (params) {
    var specs = (params.specs || []).slice().reverse();
    var valA = (params.valA || []).slice().reverse();
    var valB = (params.valB || []).slice().reverse();
    var nameA = params.nameA || 'A';
    var nameB = params.nameB || 'B';
    var unit = params.unit || '';
    var maxVal = params.maxVal || null;

    return {
      backgroundColor: DT.bg,
      grid: { left: 0, right: 56, top: 32, bottom: 0, containLabel: true },
      legend: {
        data: [
          { name: nameA, icon: 'rect', itemStyle: { color: DT.muted } },
          { name: nameB, icon: 'rect', itemStyle: { color: DT.gold } }
        ],
        top: 4, right: 0,
        textStyle: { fontSize: 10, color: DT.muted },
        itemWidth: 10, itemHeight: 6
      },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'none' },
        backgroundColor: DT.surface,
        borderColor: DT.border2,
        textStyle: { color: DT.white, fontSize: 11 },
        formatter: function (p) {
          return p[0].name + '<br/>'
            + nameA + ': ' + p[0].value + unit + '<br/>'
            + nameB + ': ' + p[1].value + unit;
        }
      },
      xAxis: {
        type: 'value',
        max: maxVal || null,
        axisLabel: { show: false },
        splitLine: { lineStyle: { color: DT.border2, type: 'dashed' } },
        axisLine: { show: false },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'category', data: specs,
        axisLabel: { fontSize: 10, color: DT.muted },
        axisLine: { lineStyle: { color: DT.border2 } },
        axisTick: { show: false }
      },
      series: [
        {
          name: nameA, type: 'bar',
          barGap: '20%', barCategoryGap: '35%',
          data: valA,
          itemStyle: { color: DT.muted2, opacity: 0.7 },
          label: {
            show: true, position: 'right',
            fontSize: 10, color: DT.muted,
            formatter: function (p) { return p.value + unit; }
          }
        },
        {
          name: nameB, type: 'bar',
          data: valB,
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 1, y2: 0,
              colorStops: [
                { offset: 0, color: DT.gold + '88' },
                { offset: 1, color: DT.goldL }
              ]
            }
          },
          label: {
            show: true, position: 'right',
            fontSize: 10, fontWeight: 'bold', color: DT.goldL,
            formatter: function (p) { return p.value + unit; }
          }
        }
      ]
    };
  };

  // ─────────────────────────────────────────
  // dark-tech-radar
  // Radar capability chart — muted A vs gold B.
  // params: {
  //   indicators: [{name, max}]   Radar axes
  //   valA:       number[]        Values for product A
  //   valB:       number[]        Values for product B
  //   nameA:      string          Product A name
  //   nameB:      string          Product B name
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-radar'] = function (params) {
    var indicators = params.indicators || [];
    var valA = params.valA || [];
    var valB = params.valB || [];
    var nameA = params.nameA || 'A';
    var nameB = params.nameB || 'B';

    return {
      backgroundColor: DT.bg,
      legend: {
        data: [nameA, nameB],
        bottom: 4, left: 'center',
        textStyle: { fontSize: 10, color: DT.muted },
        itemWidth: 10, itemHeight: 6
      },
      tooltip: {
        backgroundColor: DT.surface,
        borderColor: DT.border2,
        textStyle: { color: DT.white, fontSize: 11 }
      },
      radar: {
        indicator: indicators,
        center: ['50%', '48%'],
        radius: '62%',
        axisName: { color: DT.muted, fontSize: 10 },
        splitLine: { lineStyle: { color: DT.border2 } },
        splitArea: { areaStyle: { color: ['rgba(255,255,255,0.01)', 'rgba(255,255,255,0.02)'] } },
        axisLine: { lineStyle: { color: DT.border2 } }
      },
      series: [{
        type: 'radar',
        data: [
          {
            name: nameA, value: valA,
            lineStyle: { color: DT.muted2, width: 1.5 },
            areaStyle: { color: DT.muted2 + '22' },
            itemStyle: { color: DT.muted2 }
          },
          {
            name: nameB, value: valB,
            lineStyle: { color: DT.gold, width: 2 },
            areaStyle: { color: DT.gold + '33' },
            itemStyle: { color: DT.goldL },
            symbol: 'circle', symbolSize: 5
          }
        ]
      }]
    };
  };

  // ─────────────────────────────────────────
  // dark-tech-line
  // Line trend chart — gold line with glow area fill.
  // Optional muted reference series (valA).
  // params: {
  //   labels:   string[]   X-axis labels
  //   valA:     number[]   Reference series values (muted, optional)
  //   valB:     number[]   Main series values (gold)
  //   nameA:    string     Reference series name
  //   nameB:    string     Main series name
  //   unit:     string     Value unit
  //   smooth:   boolean    Smooth curve (default true)
  //   markMax:  boolean    Annotate max point (default true)
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-line'] = function (params) {
    var labels = params.labels || [];
    var valA = params.valA || [];
    var valB = params.valB || [];
    var nameA = params.nameA || 'A';
    var nameB = params.nameB || 'B';
    var unit = params.unit || '';
    var smooth = params.smooth != null ? params.smooth : true;
    var markMax = params.markMax != null ? params.markMax : true;

    var series = [];

    if (valA.length) {
      series.push({
        name: nameA, type: 'line',
        data: valA, smooth: smooth,
        symbol: 'circle', symbolSize: 4,
        lineStyle: { color: DT.muted2, width: 1.5 },
        itemStyle: { color: DT.muted2 },
        areaStyle: { color: DT.muted2 + '18' },
        label: { show: false }
      });
    }

    series.push({
      name: nameB, type: 'line',
      data: valB, smooth: smooth,
      symbol: 'circle', symbolSize: 6,
      lineStyle: { color: DT.gold, width: 2.5 },
      itemStyle: { color: DT.goldL },
      areaStyle: {
        color: {
          type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
          colorStops: [
            { offset: 0, color: DT.gold + '44' },
            { offset: 1, color: DT.gold + '05' }
          ]
        }
      },
      label: {
        show: true, position: 'top',
        fontSize: 9, fontWeight: 'bold', color: DT.goldL,
        formatter: function (p) { return p.value + unit; }
      },
      markPoint: markMax ? {
        symbol: 'circle', symbolSize: 10,
        data: [{ type: 'max', itemStyle: { color: DT.gold } }],
        label: { fontSize: 9, color: '#000', fontWeight: 'bold' }
      } : undefined
    });

    return {
      backgroundColor: DT.bg,
      grid: { left: 0, right: 8, top: 28, bottom: 0, containLabel: true },
      legend: valA.length ? {
        data: [nameA, nameB],
        top: 4, right: 0,
        textStyle: { fontSize: 10, color: DT.muted },
        itemWidth: 10, itemHeight: 6
      } : { show: false },
      tooltip: {
        trigger: 'axis',
        backgroundColor: DT.surface,
        borderColor: DT.border2,
        textStyle: { color: DT.white, fontSize: 11 },
        formatter: function (p) {
          var s = p[0].name + '<br/>';
          p.forEach(function (item) { s += item.seriesName + ': ' + item.value + unit + '<br/>'; });
          return s;
        }
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 9, color: DT.muted, interval: 0 },
        axisLine: { lineStyle: { color: DT.border2 } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 9, color: DT.muted,
          formatter: function (v) { return v + unit; }
        },
        splitLine: { lineStyle: { color: DT.border2, type: 'dashed' } }
      },
      series: series
    };
  };

  // ─────────────────────────────────────────
  // dark-tech-donut
  // Donut ratio chart — gold main arc, dark remainder, center text.
  // params: {
  //   value:      number    Main ratio (0~100)
  //   centerText: string    Center display text (default: value%)
  //   label:      string    Main arc tooltip label
  //   colorMain:  string    Main arc color (default: gold)
  //   colorRest:  string    Remainder arc color (default: surface2)
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-donut'] = function (params) {
    var val = params.value != null ? params.value : 75;
    var centerTxt = params.centerText || (val + '%');
    var label = params.label || '';
    var colorMain = params.colorMain || DT.gold;
    var colorRest = params.colorRest || DT.surface2;

    return {
      backgroundColor: DT.bg,
      graphic: [{
        type: 'text',
        left: 'center', top: 'middle',
        style: {
          text: centerTxt,
          fontSize: 30, fontWeight: 'bold',
          fill: DT.goldL,
          textAlign: 'center'
        }
      }],
      tooltip: { show: false },
      series: [{
        type: 'pie',
        radius: ['52%', '76%'],
        center: ['50%', '50%'],
        startAngle: 90,
        itemStyle: { borderColor: DT.bg, borderWidth: 2 },
        label: { show: false },
        data: [
          { value: val, name: label, itemStyle: { color: colorMain } },
          { value: 100 - val, name: '', itemStyle: { color: colorRest } }
        ]
      }]
    };
  };

  // ─────────────────────────────────────────
  // dark-tech-column
  // Vertical column chart — highlight winner bars in gold.
  // params: {
  //   labels:    string[]   X-axis category labels
  //   values:    number[]   Data values
  //   unit:      string     Value unit
  //   winners:   boolean[]  true = gold bar, false = muted bar
  //   markLine:  number     Optional horizontal reference line value
  // }
  // ─────────────────────────────────────────
  _presets['dark-tech-column'] = function (params) {
    var labels = params.labels || [];
    var values = params.values || [];
    var unit = params.unit || '';
    var winners = params.winners || [];
    var markLine = params.markLine != null ? params.markLine : null;

    var seriesData = values.map(function (v, i) {
      var isWin = winners[i] || false;
      return {
        value: v,
        itemStyle: isWin
          ? {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: DT.goldL },
                { offset: 1, color: DT.gold + 'aa' }
              ]
            }
          }
          : { color: DT.muted2, opacity: 0.7 }
      };
    });

    var markLineOpt = markLine != null ? {
      silent: true,
      data: [{ yAxis: markLine }],
      lineStyle: { color: DT.gold, type: 'dashed', width: 1 },
      label: {
        formatter: markLine + unit,
        color: DT.gold, fontSize: 9, position: 'end'
      }
    } : undefined;

    return {
      backgroundColor: DT.bg,
      grid: { left: 0, right: 8, top: 24, bottom: 0, containLabel: true },
      tooltip: {
        trigger: 'axis', axisPointer: { type: 'none' },
        backgroundColor: DT.surface,
        borderColor: DT.border2,
        textStyle: { color: DT.white, fontSize: 11 },
        formatter: function (p) { return p[0].name + ': ' + p[0].value + unit; }
      },
      xAxis: {
        type: 'category', data: labels,
        axisLabel: { fontSize: 9, color: DT.muted, interval: 0 },
        axisLine: { lineStyle: { color: DT.border2 } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontSize: 9, color: DT.muted,
          formatter: function (v) { return v + unit; }
        },
        splitLine: { lineStyle: { color: DT.border2, type: 'dashed' } }
      },
      series: [{
        type: 'bar', barCategoryGap: '35%',
        data: seriesData,
        label: {
          show: true, position: 'top',
          fontSize: 9, fontWeight: 'bold', color: DT.muted,
          formatter: function (p) { return String(p.value) + unit; }
        },
        markLine: markLineOpt
      }]
    };
  };

  // ─────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────

  function add(key, fn) {
    _presets[key] = fn;
  }

  function get(key, params) {
    if (!_presets[key]) {
      console.warn('[DTPresets] preset not found:', key);
      return {};
    }
    return _presets[key](params || {});
  }

  global.DTPresets = {
    get: get,
    add: add
  };

})(window);
