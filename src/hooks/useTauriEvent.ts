import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";

/**
 * 安全地订阅 Tauri 事件。
 *
 * 手写 `listen(...).then(fn => unlisten = fn)` 有两个坑：
 *
 * 1. **StrictMode 下监听器泄漏**：React 在开发模式下会「挂载 → 卸载 → 再挂载」，
 *    而 listen 是异步的。第一次挂载的 promise 还没 resolve，cleanup 就已经跑过了，
 *    此时 `unlisten` 还是 undefined，什么都没注销；等 promise 回来，那个监听器就成了野的。
 *    结果是**每个事件被处理两遍**（两条一样的输出、两条退出消息都是这么来的）。
 * 2. **回调闭包过期**：如果 handler 依赖 state，写死在 effect 里就会一直看到初次渲染的值。
 *    这里用 ref 转发，永远调用最新的 handler，又不至于每次渲染都重新订阅。
 *
 * @param event   事件名
 * @param handler 收到 payload 时的处理函数
 */
export function useTauriEvent<T>(event: string, handler: (payload: T) => void) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<T>(event, (e) => handlerRef.current(e.payload)).then((fn) => {
      // 注册回来时组件已经卸载了 → 立刻注销，别留野监听器
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, [event]);
}
