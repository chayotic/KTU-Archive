import sys
import os
import re
import json
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(__file__))

env_path = os.path.join(os.path.dirname(__file__), '.env.local')
if os.path.exists(env_path):
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith('#'):
                continue
            m = re.match(r'^([\w]+)="?(.*?)"?$', line)
            if m:
                os.environ.setdefault(m.group(1), m.group(2).strip('"'))

from api.fetch_results import handler as fetch_handler
from api.upload import handler as upload_handler


class RouterHandler(BaseHTTPRequestHandler):
    def _cors_origin(self):
        origin = self.headers.get('Origin', '')
        if origin in ('https://ktu-archive.vercel.app', 'http://localhost:3000', 'http://127.0.0.1:3000'):
            return origin
        return 'https://ktu-archive.vercel.app'

    def _respond(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def _route(self):
        path = urlparse(self.path).path
        if path == '/api/upload':
            h = upload_handler
        else:
            h = fetch_handler
        getattr(h, f'do_{self.command}')(self)

    def do_GET(self):
        self._route()

    def do_POST(self):
        self._route()

    def do_OPTIONS(self):
        self._route()


if __name__ == '__main__':
    server = HTTPServer(('127.0.0.1', 5328), RouterHandler)
    print('Dev server running on http://127.0.0.1:5328')
    print('Press Ctrl+C to stop.')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.shutdown()
        print('\nServer stopped.')
