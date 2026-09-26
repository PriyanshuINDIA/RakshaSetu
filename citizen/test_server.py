"""
RakshaSetu Test-Only Server
Provides static file serving and automated test harness reporting (/api/test-results).
Contains NO mock operational endpoints or synthetic disaster data.
Production applications communicate directly with Supabase.
"""

import http.server
import socketserver
import os
import sys
import json
import time

PORT = 8080
DIRECTORY = os.path.dirname(os.path.abspath(__file__))


class TestServerHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_GET(self):
        # Gracefully alias any legacy/alternate asset paths
        alias_map = {
            '/css/tokens.css': '/css/variables.css',
            '/css/layout.css': '/css/app.css',
            '/css/map.css': '/css/app.css',
            '/js/state.js': '/js/store.js',
            '/js/map.js': '/js/safety-map.js',
            '/auth/callback': '/auth/callback.html',
            '/auth-callback.html': '/auth/callback.html',
            '/callback': '/auth/callback.html',
            '/auth/reset-password': '/auth/reset-password.html',
            '/reset-password.html': '/auth/reset-password.html',
        }
        clean_path = self.path.split('?')[0]
        if clean_path in alias_map:
            self.path = alias_map[clean_path]

        # Basic health endpoint for test runners
        if clean_path in ('/health', '/api/health'):
            self.send_json_response(200, {
                "status": "UP",
                "service": "RakshaSetu Test Runner Server",
                "timestamp": int(time.time() * 1000)
            })
            return

        return super().do_GET()

    def do_POST(self):
        clean_path = self.path.split('?')[0]
        content_length = int(self.headers.get('Content-Length', 0))
        body_bytes = self.rfile.read(content_length) if content_length > 0 else b'{}'

        try:
            body = json.loads(body_bytes.decode('utf-8'))
        except Exception:
            body = {}

        # Automated Test Suite Reporting Endpoint ONLY
        if clean_path == '/api/test-results':
            results_file = os.path.join(DIRECTORY, 'test_results.json')
            with open(results_file, 'w', encoding='utf-8') as f:
                json.dump(body, f, indent=2)
            self.send_json_response(200, {"status": "RECORDED", "path": results_file})
            return

        self.send_json_response(404, {"error": "Endpoint not found on test-only server"})

    def send_json_response(self, code, data):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, X-Request-ID, Authorization')
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()

    def log_message(self, format, *args):
        try:
            sys.stdout.write("%s - - [%s] %s\n" % (self.address_string(), self.log_date_time_string(), format % args))
            sys.stdout.flush()
        except Exception:
            pass


class ThreadingHTTPServer(socketserver.ThreadingMixIn, http.server.HTTPServer):
    daemon_threads = True
    allow_reuse_address = True


def run_server(port=PORT):
    with ThreadingHTTPServer(('0.0.0.0', port), TestServerHandler) as httpd:
        print(f"RakshaSetu Test-Only Server live at http://localhost:{port}/ (Press Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    run_server()
