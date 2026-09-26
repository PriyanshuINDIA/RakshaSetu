import subprocess
import time
import urllib.request
import json
import os
import shutil
import sys

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
URL = "http://localhost:8080/test_phase1_core.html"
DEBUG_PORT = 9335

def run():
    results_file = os.path.join(os.path.dirname(__file__), "test_results.json")
    if os.path.exists(results_file):
        try:
            os.remove(results_file)
        except Exception:
            pass

    user_dir = f"C:\\Users\\LENOVO\\AppData\\Local\\Temp\\chrome_cdp_{DEBUG_PORT}_{int(time.time())}"
    print("[TestRunner] Starting Chrome with remote debugging on port", DEBUG_PORT)
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={user_dir}",
        URL
    ]
    proc = subprocess.Popen(cmd)
    
    try:
        # Wait up to 15 seconds for test_results.json
        for i in range(30):
            time.sleep(0.5)
            if os.path.exists(results_file):
                with open(results_file, "r", encoding="utf-8") as f:
                    data = json.load(f)
                print("[TestRunner] Received test results:", data)
                return data

            # Check CDP json
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json", timeout=1) as resp:
                    tabs = json.loads(resp.read().decode())
            except Exception:
                pass

        print("[TestRunner] Timeout waiting for test_results.json")
        return None
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()
        try:
            shutil.rmtree(user_dir, ignore_errors=True)
        except Exception:
            pass

if __name__ == "__main__":
    run()
