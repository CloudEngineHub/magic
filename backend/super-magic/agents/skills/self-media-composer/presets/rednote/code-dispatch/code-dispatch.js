/**
 * code-dispatch.js
 * Code Dispatch — ECharts chart preset library
 *
 * Responsibility: Provide ECharts chart presets matching the Code Dispatch visual style
 *   (black/white/red + monospace fonts + grid texture), callable via window.CDPresets.
 *
 * Usage (inside card <script>):
 *   var option = CDPresets.get('elo-bar', {
 *     models: ['GPT Image 2', 'Midjourney V7', ...],
 *     scores: [1512, 1270, ...],
 *     heroIndex: 0   // highlighted item index
 *   });
 *   echarts.init(el).setOption(option);
 *
 * Add a preset: CDPresets.add('name', function(params) { return echartsOption; })
 *
 * Exposes: window.CDPresets
 *
 * ─────────────────────────────────────────────────────────────
 * Preset index
 *   elo-bar       Horizontal ELO bar chart (solid bars + hero highlight in red)
 *   radar-compare Multi-model radar comparison (red solid hero + gray dashed others)
 * ─────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  /* ── Shared Tokens ── */
  var T = {
    red: '#DD0000',
    black: '#000000',
    white: '#FFFFFF',
    gray1: '#F2F2F2',
    gray2: '#E0E0E0',
    gray3: '#888888',   /* brightened secondary text color */
    muted: '#BBBBBB',   /* brightened lightest gray */
    dark1: '#141414',
    dark2: '#1A1A1A',
    dark3: '#333333',
    fontMono: 'JetBrains Mono, monospace',
    fontSans: 'Inter, Helvetica Neue, sans-serif'
  };

  var _presets = {};

  /* ════════════════════════════════════════
     Preset 1: elo-bar
     Horizontal bar chart, hero item in red, others in dark gray
     params: {
       models:    string[]  Model names (Y-axis)
       scores:    number[]  ELO scores
       heroIndex: number    Highlighted item index (default 0)
       minScore:  number    Y-axis minimum (default scores.min - 60)
     }
     ════════════════════════════════════════ */
  _presets['elo-bar'] = function (params) {
    var models = params.models || [];
    var scores = params.scores || [];
    var heroIdx = params.heroIndex != null ? params.heroIndex : 0;
    var minScore = params.minScore != null ? params.minScore
      : Math.min.apply(null, scores) - 60;

    var data = scores.map(function (v, i) {
      var isHero = (i === heroIdx);
      return {
        value: v,
        itemStyle: {
          color: isHero ? T.red : T.dark3,
          borderColor: isHero ? T.red : T.dark3,
          borderWidth: 0
        },
        label: {
          show: true,
          position: 'right',
          fontFamily: T.fontMono,
          fontSize: 11,
          fontWeight: 700,
          color: isHero ? T.red : T.gray3
        }
      };
    });

    return {
      backgroundColor: 'transparent',
      grid: { top: 8, right: 64, bottom: 8, left: 8, containLabel: true },
      xAxis: {
        type: 'value',
        min: minScore,
        axisLabel: {
          fontFamily: T.fontMono,
          fontSize: 9,
          color: T.gray3
        },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: T.gray2, type: 'solid' } }
      },
      yAxis: {
        type: 'category',
        data: models,
        inverse: false,
        axisLabel: {
          fontFamily: T.fontMono,
          fontSize: 10,
          color: T.gray3,
          fontWeight: 700
        },
        axisLine: { lineStyle: { color: T.black } },
        axisTick: { show: false }
      },
      series: [{
        type: 'bar',
        data: data,
        barMaxWidth: 32
      }]
    };
  };


  /* ════════════════════════════════════════
     Preset 2: radar-compare
     Multi-model radar, hero in red solid, others in gray dashed
     params: {
       indicators: [{name, max}]   Radar axes
       series: [
         { name, values, hero }    hero=true → red solid line
       ]
       radius: number              Radar radius (default 110)
     }
     ════════════════════════════════════════ */
  _presets['radar-compare'] = function (params) {
    var indicators = params.indicators || [];
    var series = params.series || [];
    var radius = params.radius || 110;

    var radarSeries = series.map(function (s) {
      var isHero = !!s.hero;
      return {
        value: s.values,
        name: s.name,
        lineStyle: {
          color: isHero ? T.red : T.gray3,
          width: isHero ? 2 : 1.5,
          type: isHero ? 'solid' : 'dashed'
        },
        areaStyle: {
          color: isHero ? 'rgba(221,0,0,0.12)' : 'rgba(136,136,136,0.06)'
        },
        itemStyle: { color: isHero ? T.red : T.gray3 },
        symbol: 'none'
      };
    });

    return {
      backgroundColor: 'transparent',
      radar: {
        indicator: indicators,
        shape: 'polygon',
        splitNumber: 4,
        axisName: {
          fontFamily: T.fontMono,
          fontSize: 10,
          color: T.gray3,
          fontWeight: 700
        },
        splitLine: { lineStyle: { color: T.gray2 } },
        splitArea: { show: false },
        axisLine: { lineStyle: { color: T.gray2 } },
        center: ['50%', '50%'],
        radius: radius
      },
      series: [{
        type: 'radar',
        data: radarSeries
      }]
    };
  };


  /* ════════════════════════════════════════
     Preset 3: cost-bar
     Vertical cost/quantity bar chart, dual-color support (actual vs comparison)
     params: {
       labels:   string[]   X-axis labels
       values:   number[]   Data values
       heroColor: string    Hero bar color (default red)
       baseColor: string    Normal bar color (default dark gray)
       heroIndexes: number[] Highlighted index array (default all normal)
       unit: string         Y-axis unit suffix (default '')
     }
     ════════════════════════════════════════ */
  _presets['cost-bar'] = function (params) {
    var labels = params.labels || [];
    var values = params.values || [];
    var heroColor = params.heroColor || T.red;
    var baseColor = params.baseColor || T.dark3;
    var heroIndexes = params.heroIndexes || [];
    var unit = params.unit || '';

    var data = values.map(function (v, i) {
      var isHero = heroIndexes.indexOf(i) !== -1;
      return {
        value: v,
        itemStyle: { color: isHero ? heroColor : baseColor }
      };
    });

    return {
      backgroundColor: 'transparent',
      grid: { top: 24, right: 8, bottom: 32, left: 8, containLabel: true },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: {
          fontFamily: T.fontMono,
          fontSize: 10,
          color: T.gray3,
          interval: 0
        },
        axisLine: { lineStyle: { color: T.black } },
        axisTick: { show: false }
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          fontFamily: T.fontMono,
          fontSize: 9,
          color: T.gray3,
          formatter: function (v) { return v + unit; }
        },
        axisLine: { show: false },
        splitLine: { lineStyle: { color: T.gray2 } }
      },
      series: [{
        type: 'bar',
        data: data,
        barMaxWidth: 40,
        label: {
          show: true,
          position: 'top',
          fontFamily: T.fontMono,
          fontSize: 10,
          fontWeight: 700,
          color: T.gray3,
          formatter: function (p) { return p.value + unit; }
        }
      }]
    };
  };


  /* ── Public API ── */
  function add(key, fn) {
    _presets[key] = fn;
  }

  function get(key, params) {
    if (!_presets[key]) {
      console.warn('[CDPresets] preset not found:', key);
      return {};
    }
    return _presets[key](params || {});
  }

  global.CDPresets = {
    tokens: T,
    get: get,
    add: add
  };

})(window);
