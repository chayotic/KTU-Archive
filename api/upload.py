import os
import json
import re
import uuid
import time
from collections import defaultdict
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from urllib.error import URLError

SUPABASE_URL = os.environ.get('SUPABASE_URL', 'https://jotiuetuvhikqvqinfxa.supabase.co')
SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY', '')

MAX_SIZE = {'pyq': 3 * 1024 * 1024, 'notes': 10 * 1024 * 1024}
MAX_FILES_PER_HOUR = 20

_upload_counts = defaultdict(list)

ALLOWED_ORIGINS = frozenset({
    'https://ktu-archive.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
})


class handler(BaseHTTPRequestHandler):
    def _cors_origin(self):
        origin = self.headers.get('Origin', '')
        if origin in ALLOWED_ORIGINS:
            return origin
        return 'https://ktu-archive.vercel.app'

    def _respond(self, status, payload):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def _client_ip(self):
        forwarded = self.headers.get('X-Forwarded-For', '')
        if forwarded:
            return forwarded.split(',')[0].strip()
        return self.client_address[0]

    def do_POST(self):
        upload_type = self.headers.get('X-Upload-Type', '')
        filename = self.headers.get('X-Filename', '').strip()
        semester = self.headers.get('X-Semester', '').strip()

        if upload_type not in ('pyq', 'notes'):
            self._respond(400, {'error': 'Type must be pyq or notes'})
            return
        if not filename.lower().endswith('.pdf'):
            self._respond(400, {'error': 'Only PDF files allowed'})
            return

        max_size = MAX_SIZE.get(upload_type, 10 * 1024 * 1024)
        size_label = '3MB' if upload_type == 'pyq' else '10MB'

        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > max_size:
            self._respond(413, {'error': f'File too large — max {size_label}'})
            return

        ip = self._client_ip()
        now = time.time()
        _upload_counts[ip] = [t for t in _upload_counts[ip] if now - t < 3600]
        if len(_upload_counts[ip]) >= MAX_FILES_PER_HOUR:
            self._respond(429, {'error': 'Upload limit reached — try again later'})
            return
        _upload_counts[ip].append(now)

        file_data = self.rfile.read(content_length)

        folder = f"{upload_type}s"
        if upload_type == 'notes' and semester:
            folder = f"{folder}/semester_{semester}"
        unique_id = uuid.uuid4().hex[:8]
        safe_name = re.sub(r'[^a-zA-Z0-9_\-\.]', '_', filename)
        file_path = f"pending/{folder}/{unique_id}_{safe_name}"

        bucket_url = f'{SUPABASE_URL}/storage/v1/object/uploads/{file_path}'
        headers = {
            'Authorization': f'Bearer {SERVICE_KEY}',
            'Content-Type': 'application/pdf',
        }
        req = Request(bucket_url, data=file_data, method='PUT', headers=headers)
        try:
            urlopen(req)
        except URLError as e:
            try:
                err = json.loads(e.read().decode())
            except Exception:
                err = {'error': f'Storage upload failed: {e.code if hasattr(e, "code") else str(e)}'}
            self._respond(e.code if hasattr(e, 'code') else 500, err)
            return

        self._respond(200, {'success': True})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Upload-Type, X-Filename, X-Semester')
        self.end_headers()
