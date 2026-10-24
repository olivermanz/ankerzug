"""Optional X11 desktop adapter. JSON input via stdin; no shell commands."""
import ctypes as c
import ctypes.util
import json
import re
import subprocess
import sys
import time


def main():
    args = json.load(sys.stdin)
    library = ctypes.util.find_library("xdo")
    if not library:
        raise RuntimeError("Install system libxdo for native X11 interaction")
    lib = c.CDLL(library)
    lib.xdo_new.argtypes = [c.c_char_p]
    lib.xdo_new.restype = c.c_void_p
    lib.xdo_free.argtypes = [c.c_void_p]
    lib.xdo_get_active_window.argtypes = [c.c_void_p, c.POINTER(c.c_ulong)]
    lib.xdo_get_pid_window.argtypes = [c.c_void_p, c.c_ulong]
    lib.xdo_activate_window.argtypes = [c.c_void_p, c.c_ulong]
    lib.xdo_quit_window.argtypes = [c.c_void_p, c.c_ulong]
    for name in ["xdo_send_keysequence_window", "xdo_enter_text_window"]:
        getattr(lib, name).argtypes = [c.c_void_p, c.c_ulong, c.c_char_p, c.c_uint]
    context = lib.xdo_new(None)
    if not context:
        raise RuntimeError("Cannot open DISPLAY; use an X11 or XWayland desktop")
    try:
        expected_pid = int(args["pid"])
        action = args["action"]
        raw = subprocess.check_output(["xprop", "-root", "_NET_CLIENT_LIST"], text=True)
        windows = []
        for value in re.findall(r"0x[0-9a-fA-F]+", raw):
            window = int(value, 16)
            if lib.xdo_get_pid_window(context, window) == expected_pid:
                title = subprocess.check_output(["xprop", "-id", value, "_NET_WM_NAME"], text=True).strip()
                windows.append({"id": value, "title": title})
        if action == "windows":
            return {"windows": windows}
        target = args.get("window")
        if action == "focus" and target is None and len(windows) == 1:
            target = windows[0]["id"]
        if action == "focus" or target:
            if target not in [w["id"] for w in windows]:
                raise RuntimeError("Choose an app-owned window from native windows")
            # Window-manager activation is asynchronous, especially after a modal
            # dialog closes. Observe the actual target rather than using a fixed delay.
            deadline = time.monotonic() + 3
            while time.monotonic() < deadline:
                if lib.xdo_activate_window(context, int(target, 16)):
                    raise RuntimeError("Window activation failed")
                time.sleep(0.1)
                current = c.c_ulong()
                if not lib.xdo_get_active_window(context, c.byref(current)) and current.value == int(target, 16):
                    break
            else:
                raise RuntimeError("Window manager did not activate the requested app window")
            if action == "focus":
                return {"focused": target}
        active = c.c_ulong()
        if lib.xdo_get_active_window(context, c.byref(active)):
            raise RuntimeError("Cannot identify active native window")
        if lib.xdo_get_pid_window(context, active.value) != expected_pid:
            raise RuntimeError("Active window is not owned by the isolated app; use native focus")
        if action == "screenshot":
            subprocess.run(["import", "-window", hex(active.value), args["artifact"]], check=True, timeout=15)
            return {"artifact": args["artifact"], "window": hex(active.value)}
        if action == "keys":
            code = lib.xdo_send_keysequence_window(context, 0, args["keys"].encode(), 12000)
        elif action == "type":
            code = lib.xdo_enter_text_window(context, 0, args["text"].encode(), 12000)
        elif action == "close":
            # WM_DELETE_WINDOW exercises the real application's close/flush handling.
            code = lib.xdo_quit_window(context, active.value)
        else:
            raise RuntimeError("Use native windows, focus, screenshot, keys, type or close")
        if code:
            raise RuntimeError("Native desktop operation failed")
        return {"performed": action, "window": hex(active.value)}
    finally:
        lib.xdo_free(context)


try:
    print(json.dumps(main()))
except Exception as error:
    print(str(error), file=sys.stderr)
    sys.exit(1)
