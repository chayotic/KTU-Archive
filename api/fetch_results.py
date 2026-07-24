import json
import re
import os
import hmac
import hashlib
import secrets
import requests
from bs4 import BeautifulSoup
import urllib3
import time
import random
from collections import defaultdict
from http.server import BaseHTTPRequestHandler

urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

LOGIN_URL = "https://app.ktu.edu.in/login.htm"
RESULT_PAGE_URL = "https://app.ktu.edu.in/eu/res/semesterGradeCardListing.htm"
MAX_CONTENT_LENGTH = 1024 * 10  # 10 KB

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                  "(KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8"
}


def request_with_retry(method, url, max_retries=50, base_delay=3, max_delay=15, status_callback=None, **kwargs):
    kwargs.setdefault("timeout", 15)
    for attempt in range(1, max_retries + 1):
        try:
            resp = method(url, **kwargs)
            if resp.status_code == 200:
                return resp
            msg = f"[Attempt {attempt}/{max_retries}] Got HTTP {resp.status_code}, retrying..."
        except requests.exceptions.Timeout:
            msg = f"[Attempt {attempt}/{max_retries}] Request timed out, retrying..."
        except requests.exceptions.RequestException as e:
            msg = f"[Attempt {attempt}/{max_retries}] Connection error: {e}, retrying..."

        print(msg)
        if status_callback:
            status_callback(msg)

        delay = min(max_delay, base_delay * (1.3 ** attempt))
        delay = delay * random.uniform(0.7, 1.3)
        time.sleep(delay)

    raise RuntimeError(f"Exceeded {max_retries} retries against {url}")


def get_csrf_token(html_text):
    soup = BeautifulSoup(html_text, 'html.parser')
    field = soup.find('input', {'name': 'CSRF_TOKEN'})
    if not field or not field.get('value'):
        raise ValueError("Could not find CSRF token in page")
    return field['value']


def looks_logged_out(html_text):
    lowered = html_text.lower()
    return ("login" in lowered and "password" in lowered) or "session expired" in lowered


def extract_summary(soup):
    summary = {}

    clean = soup.get_text(separator=' ', strip=True)

    m = re.search(r'SGPA\s*:?\s*([\d.]+)', clean, re.IGNORECASE)
    if m:
        summary["sgpa"] = m.group(1)

    m = re.search(r'CGPA\s*:?\s*([\d.]+)', clean, re.IGNORECASE)
    if m:
        summary["cgpa"] = m.group(1)

    m = re.search(r'Total Earned Credits\s*([\d.]+)', clean, re.IGNORECASE)
    if m:
        summary["credits"] = m.group(1)

    m = re.search(r'Total Credits in the Semester\s*([\d.]+)', clean, re.IGNORECASE)
    if m:
        summary["totalCredits"] = m.group(1)

    return summary


def fetch_ktu_results(username, password, semester_id, status_callback=None):
    client = requests.Session()

    if status_callback:
        status_callback("Fetching login page...")
    login_page = request_with_retry(client.get, LOGIN_URL, headers=HEADERS, verify=False,
                                    status_callback=status_callback)
    csrf_token = get_csrf_token(login_page.text)

    login_payload = {
        "username": username,
        "password": password,
        "CSRF_TOKEN": csrf_token
    }

    if status_callback:
        status_callback("Logging in...")
    login_response = request_with_retry(
        client.post, LOGIN_URL, data=login_payload, headers=HEADERS, verify=False,
        status_callback=status_callback
    )

    if "Dashboard" not in login_response.text and "Welcome" not in login_response.text:
        raise ValueError("Login failed — check your credentials")

    if status_callback:
        status_callback("Fetching results page...")
    results_page_get = request_with_retry(
        client.get, RESULT_PAGE_URL, headers=HEADERS, verify=False,
        status_callback=status_callback
    )

    if looks_logged_out(results_page_get.text):
        raise RuntimeError("Session expired before fetching results")

    results_csrf_token = get_csrf_token(results_page_get.text)

    result_payload = {
        "CSRF_TOKEN": results_csrf_token,
        "form_name": "semesterGradeCardListingSearchForm",
        "semesterId": semester_id,
        "stdId": "",
        "search": "Search"
    }

    if status_callback:
        status_callback("Fetching grade card...")
    result_response = request_with_retry(
        client.post, RESULT_PAGE_URL, data=result_payload,
        headers=HEADERS, verify=False, max_retries=100,
        status_callback=status_callback
    )

    if looks_logged_out(result_response.text):
        raise RuntimeError("Session expired during result fetch")

    soup_grades = BeautifulSoup(result_response.text, 'html.parser')

    # Try multiple strategies to find the grades table
    grades_table = soup_grades.find('table', {'class': 'table-bordered'})
    if not grades_table:
        grades_table = soup_grades.find('table', {'class': 'table'})
    if not grades_table:
        # Fallback: find the largest table with more than 1 row
        all_tables = soup_grades.find_all('table')
        for t in all_tables:
            if len(t.find_all('tr')) > 1:
                grades_table = t
                break

    if not grades_table:
        raise ValueError("Could not find grades table — results may not be published yet")

    all_rows = grades_table.find_all('tr')
    if not all_rows:
        raise ValueError("Grades table found but empty")

    th_tags = grades_table.find_all('th')
    if th_tags:
        headers = [th.text.strip() for th in th_tags]
        data_rows = all_rows
    else:
        first_row_cells = all_rows[0].find_all('td')
        headers = [td.text.strip() for td in first_row_cells]
        data_rows = all_rows[1:]

    rows = []
    for row in data_rows:
        cols = row.find_all('td')
        clean_row = [col.text.strip() for col in cols]
        if len(clean_row) == len(headers):
            rows.append(dict(zip(headers, clean_row)))

    summary = extract_summary(soup_grades)
    return {"headers": headers, "rows": rows, "summary": summary}


ALLOWED_ORIGINS = frozenset({
    'https://ktu-archive.vercel.app',
    'http://localhost:3000',
    'http://127.0.0.1:3000',
})

TOKEN_SECRET = os.environ.get('TOKEN_SECRET', secrets.token_hex(32))
RATE_LIMIT_HITS = defaultdict(list)  # ip -> [timestamps]


def _client_ip(handler):
    forwarded = handler.headers.get('X-Forwarded-For', '')
    if forwarded:
        return forwarded.split(',')[0].strip()
    return handler.client_address[0]


def _rate_limited(ip, max_requests=10, window=60):
    now = time.time()
    hits = RATE_LIMIT_HITS.get(ip, [])
    hits = [t for t in hits if now - t < window]
    if len(hits) >= max_requests:
        return True
    hits.append(now)
    RATE_LIMIT_HITS[ip] = hits
    return False


def _generate_challenge(ip):
    expiry = int(time.time()) + 60
    payload = f"{ip}|{expiry}".encode()
    sig = hmac.new(TOKEN_SECRET.encode(), payload, hashlib.sha256).hexdigest()
    return f"{expiry}.{sig}"


def _verify_challenge(ip, token):
    try:
        parts = token.split('.')
        expiry = int(parts[0])
        if time.time() > expiry:
            return False
        expected = hmac.new(TOKEN_SECRET.encode(), f"{ip}|{expiry}".encode(), hashlib.sha256).hexdigest()
        return hmac.compare_digest(parts[1], expected)
    except (IndexError, ValueError, TypeError):
        return False


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

    def do_GET(self):
        ip = _client_ip(self)
        if _rate_limited(ip, max_requests=20, window=60):
            self._respond(429, {"success": False, "error": "Too many requests"})
            return
        token = _generate_challenge(ip)
        self._respond(200, {"success": True, "token": token})

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > MAX_CONTENT_LENGTH:
            self._respond(413, {"success": False, "error": "Request too large"})
            return
        body = self.rfile.read(content_length)

        try:
            data = json.loads(body)
            token = data.get('token', '')
            if not _verify_challenge(_client_ip(self), token):
                self._respond(403, {"success": False, "error": "Invalid or expired token"})
                return

            username = data.get('username', '').strip()
            password = data.get('password', '').strip()
            semester_id = data.get('semesterId', '').strip()

            if not username or not password or not semester_id:
                self._respond(400, {"success": False, "error": "Missing required fields"})
                return

            logs = []
            def status_callback(msg):
                logs.append(msg)

            result = fetch_ktu_results(username, password, semester_id, status_callback=status_callback)
            self._respond(200, {"success": True, "data": result, "logs": logs})

        except ValueError as e:
            self._respond(400, {"success": False, "error": str(e)})
        except RuntimeError as e:
            self._respond(502, {"success": False, "error": str(e)})
        except Exception:
            self._respond(500, {"success": False, "error": "Internal server error"})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header('Access-Control-Allow-Origin', self._cors_origin())
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()