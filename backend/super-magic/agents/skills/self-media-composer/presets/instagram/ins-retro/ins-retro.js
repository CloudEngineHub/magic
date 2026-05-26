/**
 * ins-retro.js
 * Instagram Retro / Vintage ECharts chart preset library
 */
(function (global) {
    'use strict';

    var _presets = {};

    _presets['vintage-bar'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];

        return {
            grid: { left: 0, right: 0, top: 10, bottom: 0, containLabel: true },
            xAxis: {
                type: 'category', data: labels,
                axisLabel: { fontSize: 11, color: '#6b3a2a', fontFamily: 'Georgia, serif' },
                axisLine: { lineStyle: { color: '#2c1810', width: 2 } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { fontSize: 10, color: '#8b6f5e' },
                splitLine: { lineStyle: { color: '#d4c4a8', type: 'dashed' } }
            },
            series: [{
                type: 'bar', data: values,
                itemStyle: { color: '#c0392b', borderColor: '#2c1810', borderWidth: 2 },
                barCategoryGap: '40%'
            }]
        };
    };

    var INSRetroPresets = {
        get: function (name, params) {
            if (!_presets[name]) throw new Error('[INSRetroPresets] Unknown preset: ' + name);
            return _presets[name](params || {});
        },
        add: function (name, fn) { _presets[name] = fn; }
    };

    global.INSRetroPresets = INSRetroPresets;
})(window);
