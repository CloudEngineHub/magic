(function () {
  var charts = [];
  var trendInstance = null;
  var trendData = {
    "7d": { x: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], v: [52, 58, 61, 67, 72, 64, 70], r: [138, 142, 151, 166, 181, 162, 176], c: [4.2, 4.4, 4.1, 4.8, 5.0, 4.5, 4.9] },
    "14d": { x: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13", "14"], v: [42, 43, 45, 47, 48, 50, 52, 53, 58, 61, 63, 67, 70, 74], r: [98, 102, 107, 113, 116, 121, 128, 132, 138, 145, 151, 160, 169, 178], c: [3.8, 3.9, 4.0, 3.9, 4.1, 4.2, 4.3, 4.3, 4.4, 4.5, 4.6, 4.8, 4.8, 4.9] },
    "30d": { x: ["1", "3", "5", "7", "9", "11", "13", "15", "17", "19", "21", "23", "25", "27", "29"], v: [28, 30, 31, 33, 35, 38, 39, 42, 45, 47, 51, 54, 58, 61, 65], r: [64, 66, 69, 71, 75, 82, 85, 92, 97, 104, 112, 118, 129, 138, 146], c: [3.2, 3.3, 3.4, 3.4, 3.6, 3.8, 3.9, 4.0, 4.1, 4.2, 4.2, 4.3, 4.5, 4.6, 4.8] }
  };

  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  function init(node) { var c = echarts.init(node, null, { renderer: "svg" }); charts.push(c); return c; }

  function renderSparks() {
    document.querySelectorAll(".spark").forEach(function (node) {
      var series = (node.dataset.series || "").split(",").map(function (v) { return Number(v.trim()); });
      init(node).setOption({
        animation: false,
        grid: { left: 2, right: 2, top: 2, bottom: 2 },
        xAxis: { type: "category", show: false, data: series.map(function (_, i) { return i + 1; }) },
        yAxis: { type: "value", show: false },
        series: [{ type: "line", smooth: true, symbol: "none", data: series, lineStyle: { width: 2.2, color: css("--accent") }, areaStyle: { color: "rgba(59, 130, 246, .12)" } }]
      });
    });
  }

  function renderFunnel() {
    init(document.getElementById("funnelChart")).setOption({
      tooltip: { trigger: "item" },
      series: [{ type: "funnel", left: "8%", width: "84%", gap: 5, label: { color: css("--text"), fontSize: 12 }, itemStyle: { borderColor: css("--panel"), borderWidth: 2 }, data: [{ value: 428000, name: "Visits" }, { value: 54800, name: "Signups" }, { value: 34720, name: "Activation" }, { value: 2670, name: "Paid" }, { value: 1108, name: "Repeat purchase" }], color: ["#a5b4fc", "#6366f1", "#3b82f6", "#10b981", "#f59e0b"] }]
    });
  }

  function renderChannel() {
    init(document.getElementById("channelChart")).setOption({
      tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
      legend: { top: 0, textStyle: { color: css("--sub"), fontSize: 11 } },
      grid: { top: 36, right: 6, bottom: 6, left: 68, containLabel: true },
      xAxis: { type: "value", axisLabel: { color: css("--sub") }, splitLine: { lineStyle: { color: css("--grid") } } },
      yAxis: { type: "category", axisLabel: { color: css("--text"), fontSize: 11 }, data: ["Organic search", "Content seeding", "Private-domain return", "Paid ads", "Channel referrals"] },
      series: [
        { name: "Traffic", type: "bar", stack: "s", data: [24, 31, 18, 17, 10], itemStyle: { color: "#6366f1", borderRadius: [0, 6, 6, 0] } },
        { name: "Revenue", type: "bar", stack: "s", data: [22, 19, 29, 15, 15], itemStyle: { color: "#10b981", borderRadius: [0, 6, 6, 0] } },
        { name: "Cost", type: "bar", stack: "s", data: [8, 12, 4, 16, 6], itemStyle: { color: "#f59e0b", borderRadius: [0, 6, 6, 0] } }
      ]
    });
  }

  function renderTrend(range) {
    var d = trendData[range];
    if (!trendInstance) trendInstance = init(document.getElementById("trendChart"));
    trendInstance.setOption({
      tooltip: { trigger: "axis" },
      legend: { top: 0, textStyle: { color: css("--sub"), fontSize: 11 } },
      grid: { top: 38, right: 12, bottom: 12, left: 44, containLabel: true },
      xAxis: { type: "category", data: d.x, axisLabel: { color: css("--sub") }, axisLine: { lineStyle: { color: css("--grid") } } },
      yAxis: [{ type: "value", axisLabel: { color: css("--sub") }, splitLine: { lineStyle: { color: css("--grid") } } }, { type: "value", axisLabel: { color: css("--sub"), formatter: "{value}%" }, splitLine: { show: false } }],
      series: [
        { name: "Visits", type: "line", smooth: true, symbolSize: 6, data: d.v, lineStyle: { color: css("--accent"), width: 2.5 }, itemStyle: { color: css("--accent") } },
        { name: "Revenue (k CNY)", type: "bar", data: d.r, itemStyle: { color: "rgba(99, 102, 241, .45)", borderRadius: [5, 5, 0, 0] } },
        { name: "Conversion rate", type: "line", yAxisIndex: 1, smooth: true, data: d.c, lineStyle: { color: css("--ok"), width: 2.5, type: "dashed" }, itemStyle: { color: css("--ok") } }
      ]
    }, true);
  }

  function bindTabs() {
    document.querySelectorAll("#trendTabs .tab").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll("#trendTabs .tab").forEach(function (n) { n.classList.remove("active"); });
        btn.classList.add("active");
        renderTrend(btn.dataset.range);
      });
    });
  }

  function bindSourcePreview() {
    var frame = document.getElementById("sourceFrame");
    var close = document.getElementById("sourceClose");
    var wrap = frame ? frame.closest(".source-frame-wrap") : null;
    if (!frame || !wrap) return;

    document.querySelectorAll(".source-preview").forEach(function (btn) {
      btn.addEventListener("click", function () {
        document.querySelectorAll(".source-preview").forEach(function (n) { n.classList.remove("active"); });
        btn.classList.add("active");
        frame.src = btn.dataset.previewUrl;
        wrap.classList.remove("collapsed");
        if (close) close.textContent = "Collapse preview";
      });
    });

    if (close) {
      close.addEventListener("click", function () {
        var collapsed = wrap.classList.toggle("collapsed");
        close.textContent = collapsed ? "Expand preview" : "Collapse preview";
      });
    }

    var initial = document.querySelector(".source-preview.active") || document.querySelector(".source-preview");
    if (initial) frame.src = initial.dataset.previewUrl;
  }

  function gatherContext() {
    return Array.from(document.querySelectorAll(".analysis-source")).slice(0, 8).map(function (n) {
      return n.innerText.replace(/\s+/g, " ").trim();
    }).filter(Boolean).join("\n- ");
  }

  function sendToAgent(prompt) {
    var status = document.getElementById("insightStatus");
    var full = prompt + "\n\nCard context summary:\n- " + gatherContext();
    var agentId = document.getElementById("agentSelect").value;
    var model = document.getElementById("modelSelect").value || "auto";

    if (!window.Magic) {
      status.textContent = "Magic API is not available in the current environment.";
      return;
    }

    // Prefer createTopicAndSend (new topic + selected employee/model)
    if (window.Magic.project && typeof window.Magic.project.createTopicAndSend === "function") {
      var opts = { model: model };
      if (agentId) opts.agentId = agentId;

      status.textContent = "Creating topic...";
      window.Magic.project.createTopicAndSend(full, opts).then(function () {
        status.textContent = "Created a new topic and sent the message.";
      }).catch(function (err) {
        status.textContent = "Send failed: " + (err.message || err);
      });
      return;
    }

    // Fallback: setInputMessage (append message to current topic)
    if (typeof window.Magic.setInputMessage === "function") {
      window.Magic.setInputMessage(full);
      status.textContent = "Sent to the current topic (fallback mode).";
      return;
    }

    status.textContent = "The current environment does not support message sending.";
  }

  function loadSelectors() {
    var agentSel = document.getElementById("agentSelect");
    var modelSel = document.getElementById("modelSelect");

    if (window.Magic && window.Magic.agent && typeof window.Magic.agent.getAgents === "function") {
      window.Magic.agent.getAgents().then(function (agents) {
        agentSel.innerHTML = "";
        agents.forEach(function (a) {
          var opt = document.createElement("option");
          opt.value = a.id;
          opt.textContent = a.name;
          agentSel.appendChild(opt);
        });
        // Select ip-manager by default when available
        var target = agents.find(function (a) { return a.id.indexOf("ip-manager") !== -1 || a.id.indexOf("ip_manager") !== -1; });
        if (target) agentSel.value = target.id;
      }).catch(function () {
        agentSel.innerHTML = "<option value=''>Unable to load</option>";
      });
    } else {
      agentSel.innerHTML = "<option value=''>Unavailable</option>";
    }

    if (window.Magic && window.Magic.llm && typeof window.Magic.llm.getModels === "function") {
      window.Magic.llm.getModels().then(function (models) {
        modelSel.innerHTML = "<option value=\"auto\">Auto select (recommended)</option>";
        models.forEach(function (m) {
          var opt = document.createElement("option");
          opt.value = m.id;
          opt.textContent = m.id;
          modelSel.appendChild(opt);
        });
      }).catch(function () {});
    }
  }

  function setupInsight() {
    document.querySelectorAll(".chip").forEach(function (chip) {
      chip.addEventListener("click", function () { sendToAgent(chip.dataset.prompt); });
    });
    var input = document.getElementById("askInput");
    document.getElementById("askSend").addEventListener("click", function () {
      var q = input.value.trim();
      if (q) { sendToAgent(q); input.value = ""; }
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); document.getElementById("askSend").click(); }
    });
    loadSelectors();
  }

  function rebuild() {
    charts.forEach(function (c) { c.dispose(); });
    charts = [];
    trendInstance = null;
    renderSparks();
    renderFunnel();
    renderChannel();
    renderTrend("7d");
  }

  bindTabs();
  bindSourcePreview();
  setupInsight();
  rebuild();
  window.addEventListener("resize", function () { charts.forEach(function (c) { c.resize(); }); });
  var mq = window.matchMedia("(prefers-color-scheme: dark)");
  if (typeof mq.addEventListener === "function") mq.addEventListener("change", rebuild);
})();
