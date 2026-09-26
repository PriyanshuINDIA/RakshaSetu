import subprocess
import time
import urllib.request
import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
DEBUG_PORT = 9557
BASE_URL = "http://localhost:8080"

def run_suite(name, url, suite_key, timeout_sec=30):
    print(f"\n=======================================================")
    print(f"[TEST SUITE] {name}")
    print(f"  URL: {url}")
    print(f"=======================================================")
    
    user_data = f"C:\\Users\\LENOVO\\AppData\\Local\\Temp\\chrome_test_{DEBUG_PORT}_{suite_key.replace(' ', '_')}"
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir={user_data}",
        url
    ]
    
    proc = subprocess.Popen(cmd)
    try:
        start_t = time.time()
        while time.time() - start_t < timeout_sec:
            time.sleep(1.0)
            try:
                with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json", timeout=2) as resp:
                    tabs = json.loads(resp.read().decode('utf-8', errors='ignore'))
                    for t in tabs:
                        title = t.get("title", "")
                        if "TEST_RESULTS:" in title or "PASSED:" in title or "FAILED:" in title:
                            print(f"  Result Title: {title}")
                            if "44/44 PASS" in title:
                                print(f"  SUCCESS: All 44 tests in Group C passed!")
                                return True
                            elif "/44 PASS" in title:
                                print(f"  INCOMPLETE: Some tests failed in suite: {title}")
                                return False
                            else:
                                print(f"  FAILURE: Test suite reported failures: {title}")
                                return False
            except Exception:
                pass
        print("  [ERROR]: Timeout waiting for test suite execution.")
        return False
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    success = run_suite(
        "Phase 4 — Group C (Citizen Safety Assistant & Safe Route)",
        f"{BASE_URL}/test_phase4_group_c.html",
        "Phase4_GroupC"
    )
    if success:
        print("\n[PHASE 4 GROUP C] Verification COMPLETE: 100% PASS (44/44)")
        sys.exit(0)
    else:
        print("\n[PHASE 4 GROUP C] Verification FAILED")
        sys.exit(1)
