import os
from http.server import ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


def load_env():
    path = Path(__file__).with_name(".env.local")
    if not path.exists():
        return

    for raw_line in path.read_text().splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip().strip('"').strip("'")

        if key:
            os.environ.setdefault(key, value)


load_env()

from api.fetch_results import handler as results_handler
from api.upload import handler as upload_handler


if __name__ == "__main__":
    class RouterHandler(results_handler):
        def do_POST(self):
            if urlparse(self.path).path == "/api/upload":
                upload_handler.do_POST(self)
                return
            super().do_POST()

        def do_OPTIONS(self):
            if urlparse(self.path).path == "/api/upload":
                upload_handler.do_OPTIONS(self)
                return
            super().do_OPTIONS()

    server = ThreadingHTTPServer(("127.0.0.1", 5328), RouterHandler)
    print("Results API running on http://127.0.0.1:5328")
    print("Press Ctrl+C to stop.")

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()
        print("\nServer stopped.")
