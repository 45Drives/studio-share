// registerIpcActionListener.ts
import { IPCRouter } from "@45drives/houston-common-lib";
import type { Router } from "vue-router";

type Options = {
  vueRouter: Router;
};

export function registerIpcActionListener(opts: Options) {
  const {
    vueRouter,
  } = opts;

  const ipc = IPCRouter.getInstance();

  let actionListener: ((data: any) => void | Promise<void>) | null = null;

  const pushRoute = (nameOrPath: { name?: string; path?: string }) => {
    vueRouter.push(nameOrPath).catch((e) => {
      // Ignore NavigationDuplicated or similar benign errors
      if (e && e.name !== "NavigationDuplicated") console.error(e);
    });
  };

  if (!actionListener) {
    actionListener = async (data: any) => {
      try {
        const message = typeof data === "string" ? JSON.parse(data) : data;

        switch (message.type) {
          case "show_route": {
            if (message.route) {
              // Accept either a name or a path from the payload
              if (message.by === "path") pushRoute({ path: String(message.route) });
              else pushRoute({ name: String(message.route) });
            }
            break;
          }

          default:
            break;
        }
      } catch (err) {
        console.error(" IPC action handler error:", err);
      }
    };

    ipc.addEventListener("action", actionListener);
  }

  // Return an unregister to call on unmount for cleanup
  return () => {
    if (actionListener) {
      try {
        ipc.removeEventListener?.("action", actionListener as any);
      } catch {
        // ignore safely
      }
      actionListener = null;
    }
  };
}
