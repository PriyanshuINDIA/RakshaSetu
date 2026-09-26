import subprocess
import time
import urllib.request
import json
import os
import shutil
import sys

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
URL = "http://localhost:8080/test_phase3_group_b.html"
DEBUG_PORT = 9337

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
        "--enable-logging",
        "--v=1",
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
                if data.get('suite') == 'Phase 3 Group B':
                    print(f"[TestRunner] Received test results: total={data.get('total')}, passed={data.get('passedCount')}, failed={data.get('failedCount')}")
                    print(f"[TestRunner] allPassed={data.get('allPassed')}")
                    if data.get('failedCount', 0) > 0:
                        print("[TestRunner] FAILED TESTS:")
                        for t in data.get('results', []):
                            if not t.get('passed'):
                                details_str = str(t.get('details')).encode('ascii', 'backslashreplace').decode('ascii')
                                print(f"  - [{t.get('name')}]: {details_str}")
                    else:
                        print("[TestRunner] ALL 32 TESTS PASSED!")
                    return data

        print("[TestRunner] Timeout waiting for test_results.json")
        debug_log = os.path.join(user_dir, "chrome_debug.log")
        if os.path.exists(debug_log):
            with open(debug_log, "r", encoding="utf-8", errors="ignore") as f:
                print("[ChromeDebugLog]\n", f.read()[-2000:])
        return None
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()
        if os.path.exists(user_dir):
            try:
                shutil.rmtree(user_dir, ignore_errors=True)
            except Exception:
                pass

if __name__ == "__main__":
    res = run()
    if not res or not res.get("allPassed"):
        sys.exit(1)
    sys.exit(0)
