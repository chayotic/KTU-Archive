import hashlib
import hmac
import json
import os
import random
import re
import secrets
import time
from collections import defaultdict
from http.server import BaseHTTPRequestHandler

import requests
import urllib3
from bs4 import BeautifulSoup

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LOGIN_URL = "https://app.ktu.edu.in/login.htm"
RESULT_PAGE_URL = "https://app.ktu.edu.in/eu/res/semesterGradeCardListing.htm"
MAX_CONTENT_LENGTH = 10 * 1024
TOKEN_TTL = 60
DEFAULT_BUDGET_SECONDS = 280
MAX_BUDGET_SECONDS = 280
LOGIN_POST_MAX_RETRIES = 3
VALID_SEMESTERS = {str(value) for value in range(1, 9)}

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": (
        "text/html,application/xhtml+xml,application/xml;q=0.9,"
        "image/avif,image/webp,*/*;q=0.8"
    ),
}

TOKEN_SECRET = (
    os.environ.get("TOKEN_SECRET")
    or os.environ.get("VERCEL_URL")
    or "ktu-archive-results-token"
)
RATE_LIMIT_HITS = defaultdict(list)


def _budget_seconds():
    try:
        value = int(os.environ.get("RESULTS_FETCH_BUDGET_SECONDS", DEFAULT_BUDGET_SECONDS))
    except (TypeError, ValueError):
        value = DEFAULT_BUDGET_SECONDS
    return max(10, min(MAX_BUDGET_SECONDS, value))


def request_with_retry(
    method,
    url,
    deadline,
    max_retries=50,
    base_delay=2.5,
    max_delay=10,
    status_callback=None,
    **kwargs,
):
    kwargs.setdefault("timeout", 15)

    for attempt in range(1, max_retries + 1):
        remaining = deadline - time.monotonic()
        if remaining <= 1:
            raise TimeoutError("The KTU portal did not respond in time.")

        kwargs["timeout"] = max(1, min(kwargs.get("timeout", 15), remaining))

        try:
            response = method(url, **kwargs)
            if response.status_code == 200:
                return response
            if response.status_code == 429:
                message = (
                    "The KTU portal is rate limiting requests. "
                    "Wait a few minutes before trying again."
                )
                if status_callback:
                    status_callback(message)
                raise RuntimeError(message)
            if 400 <= response.status_code < 500:
                message = f"The KTU portal returned HTTP {response.status_code}."
                if status_callback:
                    status_callback(message)
                raise RuntimeError(message)
            message = f"Attempt {attempt}: portal returned HTTP {response.status_code}"
        except requests.exceptions.RequestException:
            message = f"Attempt {attempt}: connection to the portal failed"

        if status_callback:
            status_callback(message)

        delay = min(max_delay, base_delay * (1.25 ** attempt)) * random.uniform(0.7, 1.3)
        delay = min(delay, max(0, deadline - time.monotonic()))

        if delay <= 0:
            raise TimeoutError("The KTU portal did not respond in time.")

        time.sleep(delay)

    raise RuntimeError("The KTU portal kept failing. Try again later.")


def get_csrf_token(html_text):
    soup = BeautifulSoup(html_text, "html.parser")
    field = soup.find("input", {"name": "CSRF_TOKEN"})
    if not field or not field.get("value"):
        raise ValueError("Could not find the portal security token. Try again later.")
    return field["value"]


def looks_logged_out(html_text):
    lowered = html_text.lower()
    if "session expired" in lowered:
        return True

    has_username = re.search(r'name=["\']username["\']', html_text, re.IGNORECASE)
    has_password = re.search(r'type=["\']password["\']', html_text, re.IGNORECASE)
    return bool(has_username and has_password)


def extract_summary(soup):
    summary = {}
    text = soup.get_text(separator=" ", strip=True)

    patterns = {
        "sgpa": r"SGPA\s*:?\s*([\d.]+)",
        "cgpa": r"CGPA\s*:?\s*([\d.]+)",
        "credits": r"Total Earned Credits\s*:?\s*([\d.]+)",
        "totalCredits": r"Total Credits in the Semester\s*:?\s*([\d.]+)",
    }

    for key, pattern in patterns.items():
        match = re.search(pattern, text, re.IGNORECASE)
        if match:
            summary[key] = match.group(1)

    return summary


def find_grades_table(soup):
    for class_name in ("table-bordered", "table"):
        for table in soup.find_all("table", {"class": class_name}):
            if len(table.find_all("tr")) > 1:
                return table

    tables = [
        candidate
        for candidate in soup.find_all("table")
        if len(candidate.find_all("tr")) > 1
    ]
    if not tables:
        return None

    return max(tables, key=lambda candidate: len(candidate.find_all("tr")))


def parse_grades(html_text):
    soup = BeautifulSoup(html_text, "html.parser")
    table = find_grades_table(soup)

    if not table:
        raise ValueError("Could not find the grade table. Results may not be published yet.")

    all_rows = table.find_all("tr")
    if not all_rows:
        raise ValueError("The grade table is empty.")

    header_row = None
    for row in all_rows:
        cells = row.find_all(["th", "td"])
        if any(cell.name == "th" for cell in cells):
            header_row = row
            break

    if header_row is None:
        header_row = all_rows[0]

    headers = [
        cell.get_text(" ", strip=True)
        for cell in header_row.find_all(["th", "td"])
    ]

    if not headers or all(not header for header in headers):
        raise ValueError("Could not read the grade table headings.")

    data_rows = [row for row in all_rows if row is not header_row]
    rows = []

    for row in data_rows:
        cells = row.find_all(["td", "th"])
        values = [cell.get_text(" ", strip=True) for cell in cells]
        if len(values) == len(headers):
            rows.append(dict(zip(headers, values)))

    if not rows:
        raise ValueError("No grade rows were found. Results may not be published yet.")

    return {
        "headers": headers,
        "rows": rows,
        "summary": extract_summary(soup),
    }


def fetch_ktu_results(username, password, semester_id, status_callback=None, deadline=None):
    if deadline is None:
        deadline = time.monotonic() + _budget_seconds()

    client = requests.Session()

    if status_callback:
        status_callback("Fetching the portal login page")

    login_page = request_with_retry(
        client.get,
        LOGIN_URL,
        deadline,
        headers=HEADERS,
        verify=False,
        status_callback=status_callback,
    )
    csrf_token = get_csrf_token(login_page.text)

    if status_callback:
        status_callback("Portal login page loaded")

    if status_callback:
        status_callback("Signing in to the KTU portal")

    login_response = request_with_retry(
        client.post,
        LOGIN_URL,
        deadline,
        max_retries=LOGIN_POST_MAX_RETRIES,
        data={
            "username": username,
            "password": password,
            "CSRF_TOKEN": csrf_token,
        },
        headers=HEADERS,
        verify=False,
        status_callback=status_callback,
    )

    login_text = login_response.text.lower()
    if "dashboard" not in login_text and "welcome" not in login_text and "logout" not in login_text:
        raise ValueError("Login failed. Check your registration number and password.")

    if status_callback:
        status_callback("Signed in to the KTU portal")

    if status_callback:
        status_callback("Opening the grade card page")

    results_page = request_with_retry(
        client.get,
        RESULT_PAGE_URL,
        deadline,
        headers=HEADERS,
        verify=False,
        status_callback=status_callback,
    )

    if looks_logged_out(results_page.text):
        raise RuntimeError("The portal session expired before the results were fetched.")

    results_token = get_csrf_token(results_page.text)

    if status_callback:
        status_callback("Grade card page loaded")

    if status_callback:
        status_callback("Fetching the grade card")

    result_response = request_with_retry(
        client.post,
        RESULT_PAGE_URL,
        deadline,
        data={
            "CSRF_TOKEN": results_token,
            "form_name": "semesterGradeCardListingSearchForm",
            "semesterId": semester_id,
            "stdId": "",
            "search": "Search",
        },
        headers=HEADERS,
        verify=False,
        max_retries=50,
        status_callback=status_callback,
    )

    if looks_logged_out(result_response.text):
        raise RuntimeError("The portal session expired while fetching the results.")

    if status_callback:
        status_callback("Reading the grade card")

    return parse_grades(result_response.text)


def _client_ip(handler):
    forwarded = handler.headers.get("x-forwarded-for", "")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return handler.client_address[0]


def _rate_limited(ip, bucket, max_requests, window):
    key = f"{bucket}:{ip}"
    now = time.time()
    hits = [hit for hit in RATE_LIMIT_HITS[key] if now - hit < window]

    if len(hits) >= max_requests:
        return True

    hits.append(now)
    RATE_LIMIT_HITS[key] = hits
    return False


def _generate_challenge(ip):
    expiry = int(time.time()) + TOKEN_TTL
    nonce = secrets.token_hex(8)
    payload = f"{ip}|{expiry}|{nonce}".encode()
    signature = hmac.new(TOKEN_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return f"{expiry}.{nonce}.{signature}"


def _verify_challenge(ip, token):
    try:
        expiry_text, nonce, signature = token.split(".")
        expiry = int(expiry_text)
        if time.time() > expiry:
            return False
        payload = f"{ip}|{expiry}|{nonce}".encode()
        expected = hmac.new(TOKEN_SECRET.encode(), payload, hashlib.sha256).hexdigest()
        return hmac.compare_digest(signature, expected)
    except (AttributeError, TypeError, ValueError):
        return False


class handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def log_message(self, format, *args):
        return

    def _respond(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _start_stream(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/x-ndjson; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Transfer-Encoding", "chunked")
        self.end_headers()

    def _write_event(self, payload):
        line = f"{json.dumps(payload)}\n".encode("utf-8")
        chunk = f"{len(line):X}\r\n".encode("ascii") + line + b"\r\n"
        try:
            self.wfile.write(chunk)
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def _end_stream(self):
        try:
            self.wfile.write(b"0\r\n\r\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Allow", "GET, POST, OPTIONS")
        self.end_headers()

    def do_GET(self):
        ip = _client_ip(self)
        if _rate_limited(ip, "token", max_requests=20, window=60):
            self._respond(429, {"success": False, "error": "Too many requests"})
            return

        self._respond(200, {"success": True, "token": _generate_challenge(ip)})

    def do_POST(self):
        ip = _client_ip(self)

        if _rate_limited(ip, "results", max_requests=8, window=60):
            self._respond(429, {"success": False, "error": "Too many requests"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", 0))
        except (TypeError, ValueError):
            content_length = 0

        if content_length > MAX_CONTENT_LENGTH:
            self._respond(413, {"success": False, "error": "Request too large"})
            return

        if content_length <= 0:
            self._respond(400, {"success": False, "error": "Missing request body"})
            return

        try:
            payload = json.loads(self.rfile.read(content_length))
        except (UnicodeDecodeError, json.JSONDecodeError):
            self._respond(400, {"success": False, "error": "Invalid request body"})
            return

        if not isinstance(payload, dict):
            self._respond(400, {"success": False, "error": "Invalid request body"})
            return

        if not _verify_challenge(ip, payload.get("token", "")):
            self._respond(403, {"success": False, "error": "Invalid or expired token"})
            return

        username = payload.get("username")
        password = payload.get("password")
        semester_id = payload.get("semesterId")

        username = username.strip() if isinstance(username, str) else ""
        password = password if isinstance(password, str) else ""
        semester_id = semester_id.strip() if isinstance(semester_id, str) else ""

        if not username or not password or semester_id not in VALID_SEMESTERS:
            self._respond(400, {"success": False, "error": "Missing required fields"})
            return

        logs = []
        self._start_stream()

        def status_callback(message):
            if len(logs) < 100:
                logs.append(message)
            self._write_event({"type": "log", "message": message})

        try:
            data = fetch_ktu_results(
                username,
                password,
                semester_id,
                status_callback=status_callback,
                deadline=time.monotonic() + _budget_seconds(),
            )
            self._write_event(
                {"type": "result", "success": True, "data": data, "logs": logs}
            )
        except TimeoutError as error:
            self._write_event(
                {
                    "type": "error",
                    "success": False,
                    "error": str(error) or "The KTU portal did not respond in time.",
                }
            )
        except ValueError as error:
            self._write_event(
                {"type": "error", "success": False, "error": str(error)}
            )
        except RuntimeError as error:
            self._write_event(
                {"type": "error", "success": False, "error": str(error)}
            )
        except Exception:
            self._write_event(
                {
                    "type": "error",
                    "success": False,
                    "error": "Internal server error",
                }
            )

        self._end_stream()
