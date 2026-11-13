// Bridge to the Rust side. Every call goes through here so the window keeps
// working (with nothing happening) when opened in a plain browser.
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * `invoke()` that always returns a promise.
 *
 * Outside a Tauri runtime — `npm run dev` in a plain browser — the injected
 * internals object is missing and `invoke` throws *synchronously*, before it
 * ever returns a promise. A trailing `.catch()` cannot see that, so the error
 * escaped out of the `useEffect` callbacks that called it. Normalising here
 * keeps every call site to a single error path.
 */
export function call(command, args) {
    try {
        return Promise.resolve(invoke(command, args));
    } catch (err) {
        return Promise.reject(err);
    }
}

/**
 * Listen for a backend event; returns a function that stops listening.
 *
 * Safe to call outside Tauri (it then never fires), and safe to unsubscribe
 * before the asynchronous registration has finished — React effects clean up
 * immediately in StrictMode, which would otherwise leak the listener.
 */
export function subscribe(event, handler) {
    let unlisten = null;
    let stopped = false;
    try {
        Promise.resolve(listen(event, (e) => handler(e.payload)))
            .then((fn) => {
                if (stopped) fn();
                else unlisten = fn;
            })
            .catch(() => {});
    } catch {
        // Not running inside Tauri.
    }
    return () => {
        stopped = true;
        if (unlisten) unlisten();
    };
}

/**
 * Close, minimize or zoom the window from the traffic lights. Closing goes
 * through the normal close request, so "keep running in the tray" still applies.
 */
export async function windowAction(action) {
    try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        const win = getCurrentWindow();
        if (action === "close") await win.close();
        else if (action === "minimize") await win.minimize();
        else if (action === "zoom") await win.toggleMaximize();
    } catch {
        // Not running inside Tauri.
    }
}
