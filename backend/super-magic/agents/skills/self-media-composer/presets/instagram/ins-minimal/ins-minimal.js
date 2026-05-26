/**
 * ins-minimal.js
 * Instagram Minimal Clean ECharts chart preset library
 */
(function (global) {
    'use strict';

    var _presets = {};

    _presets['simple-bar'] = function (params) {
        var labels = params.labels || [];
        var values = params.values || [];
        var accentColor = params.color || '#0071e3';

        return {
            grid: { left: 0, right: 0, top: 10, bottom: 0, containLabel: true },
            xAxis: {
                type: 'category', data: labels,
                axisLabel: { fontSize: 10, color: '#6e6e73' },
                axisLine: { lineStyle: { color: '#e5e5e7' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                axisLabel: { fontSize: 10, color: '#aeaeb2' },
                splitLine: { lineStyle: { color: '#f0f0f0' } }
            },
            series: [{
                type: 'bar',
                data: values,
                itemStyle: { color: accentColor, borderRadius: [6, 6, 0, 0] },
                barCategoryGap: '40%'
            }]
        };
    };

    var INSMinimalPresets = {
        get: function (name, params) {
            if (!_presets[name]) throw new Error('[INSMinimalPresets] Unknown preset: ' + name);
            return _presets[name](params || {});
        },
        add: function (name, fn) { _presets[name] = fn; }
    };

    global.INSMinimalPresets = INSMinimalPresets;
})(window);
