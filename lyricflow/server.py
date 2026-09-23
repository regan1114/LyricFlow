"""Single-process local Flask server lifecycle and browser launcher."""

import argparse
import json
import signal
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path
from urllib.request import urlopen

from werkzeug.serving import WSGIRequestHandler, make_server

from .config import Settings
from .factory import create_app


class LocalRequestHandler(WSGIRequestHandler):
    timeout = 60

    def log_request(self, code="-", size="-"):
        pass


def open_interface(url):
    try:
        if sys.platform == "darwin":
            result = subprocess.run(
                ["/usr/bin/open", url], capture_output=True, text=True, timeout=10
            )
            opened = result.returncode == 0
        else:
            opened = webbrowser.open(url)
    except (OSError, subprocess.TimeoutExpired, webbrowser.Error):
        opened = False
    if not opened:
        print(f"無法自動開啟瀏覽器。請將以下網址貼到 Safari 或 Chrome：\n{url}", flush=True)
    return opened


def is_running(url):
    try:
        with urlopen(url + "/api/health", timeout=2) as response:
            return json.load(response).get("app") == "lyric-flow"
    except (OSError, ValueError):
        return False


def stop_server(signum, frame):
    raise KeyboardInterrupt


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8080)
    parser.add_argument("--open", action="store_true")
    parser.add_argument("--jobs-dir", type=Path, help="工作資料夾，預設為 .cache/interface")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("--port 必須介於 1 與 65535 之間")
    url = f"http://127.0.0.1:{args.port}"
    if is_running(url):
        if args.open:
            open_interface(url)
        print(f"LyricFlow 已在執行：{url}", flush=True)
        return
    app = create_app(Settings(port=args.port, jobs_directory=args.jobs_dir))
    try:
        server = make_server(
            "127.0.0.1", args.port, app, threaded=True, request_handler=LocalRequestHandler
        )
    except (OSError, SystemExit) as error:
        raise SystemExit("這個連接埠目前無法使用，請關閉其他程式或指定 --port。") from error
    print(f"LyricFlow：{url}\n保留這個視窗即可使用；按 Control+C 關閉。", flush=True)
    signal.signal(signal.SIGTERM, stop_server)
    if hasattr(signal, "SIGHUP"):
        signal.signal(signal.SIGHUP, stop_server)
    if args.open:
        threading.Timer(0.4, lambda: open_interface(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.extensions["alignment_service"].close()
        server.server_close()
