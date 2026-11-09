import json
import os
import re
import time
import uuid
from collections import defaultdict
from http.server import BaseHTTPRequestHandler
from urllib.error import URLError
from urllib.request import Request, urlopen

SUPABASE_URL = os.environ.get(
    "SUPABASE_URL", "https://jotiuetuvhikqvqinfxa.supabase.co"
)
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

MAX_SIZE = {"pyq": 3 * 1024 * 1024, "notes": 10 * 1024 * 1024}
MAX_FILES_PER_HOUR = 20
LOCAL_IPS = frozenset({"127.0.0.1", "::1", "::ffff:127.0.0.1"})

_upload_counts = defaultdict(list)


def _client_ip(handler):
    forwarded = handler.headers.get("X-Forwarded-For", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return handler.client_address[0]


class handler(BaseHTTPRequestHandler):
    def _respond(self, status, payload):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(json.dumps(payload).encode())

    def do_POST(self):
        upload_type = self.headers.get("X-Upload-Type", "")
        filename = self.headers.get("X-Filename", "").strip()
        semester = self.headers.get("X-Semester", "").strip()

        if upload_type not in ("pyq", "notes"):
            self._respond(400, {"error": "Type must be pyq or notes"})
            return
        if not filename.lower().endswith(".pdf"):
            self._respond(400, {"error": "Only PDF files allowed"})
            return

        max_size = MAX_SIZE.get(upload_type, 10 * 1024 * 1024)
        size_label = "3MB" if upload_type == "pyq" else "10MB"

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            self._respond(400, {"error": "Invalid content length"})
            return

        if content_length <= 0:
            self._respond(400, {"error": "Empty upload"})
            return
        if content_length > max_size:
            self._respond(413, {"error": f"File too large (max {size_label})"})
            return

        if upload_type == "notes" and not semester:
            self._respond(400, {"error": "Semester is required for notes"})
            return

        ip = _client_ip(self)
        if ip not in LOCAL_IPS:
            now = time.time()
            _upload_counts[ip] = [
                value for value in _upload_counts[ip] if now - value < 3600
            ]
            if len(_upload_counts[ip]) >= MAX_FILES_PER_HOUR:
                self._respond(429, {"error": "Upload limit reached, try again later"})
                return
            _upload_counts[ip].append(now)

        file_data = self.rfile.read(content_length)

        folder = f"{upload_type}s"
        if upload_type == "notes" and semester:
            folder = f"{folder}/semester_{semester}"

        unique_id = uuid.uuid4().hex[:8]
        safe_name = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", filename)
        file_path = f"pending/{folder}/{unique_id}_{safe_name}"

        bucket_url = f"{SUPABASE_URL}/storage/v1/object/uploads/{file_path}"
        request = Request(
            bucket_url,
            data=file_data,
            method="PUT",
            headers={
                "Authorization": f"Bearer {SERVICE_KEY}",
                "Content-Type": "application/pdf",
            },
        )

        try:
            urlopen(request)
        except URLError as error:
            try:
                payload = json.loads(error.read().decode())
            except Exception:
                payload = {
                    "error": f"Storage upload failed: {getattr(error, 'code', error)}"
                }
            status = getattr(error, "code", 500)
            self._respond(status if isinstance(status, int) else 500, payload)
            return

        self._respond(200, {"success": True})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header(
            "Access-Control-Allow-Headers",
            "Content-Type, X-Upload-Type, X-Filename, X-Semester",
        )
        self.end_headers()
