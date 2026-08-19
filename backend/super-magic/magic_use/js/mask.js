// 抹平 CDP 调试通道给页面带来的可观测行为差异。
(() => {
  const target = globalThis.console;
  if (!target || target.__magicUseMasked) return;
  const log = target.log;
  if (typeof log !== "function") return;
  target.table = function table(...args) {
    return log.apply(target, args);
  };
  Object.defineProperty(target, "__magicUseMasked", { value: true });
})();
