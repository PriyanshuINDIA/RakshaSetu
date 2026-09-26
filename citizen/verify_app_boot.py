import subprocess
import time
import urllib.request
import json
import os
import sys

CHROME_PATH = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
URL = "http://localhost:8080/index.html"
DEBUG_PORT = 9444

def verify_boot():
    print("[VerifyApp] Booting citizen index.html in headless Chrome on port", DEBUG_PORT)
    cmd = [
        CHROME_PATH,
        "--headless=new",
        "--disable-gpu",
        f"--remote-debugging-port={DEBUG_PORT}",
        f"--user-data-dir=C:\\Users\\LENOVO\\AppData\\Local\\Temp\\chrome_boot_{DEBUG_PORT}",
        URL
    ]
    proc = subprocess.Popen(cmd)
    
    try:
        time.sleep(3)
        with urllib.request.urlopen(f"http://127.0.0.1:{DEBUG_PORT}/json", timeout=2) as resp:
            tabs = json.loads(resp.read().decode())
            print("[VerifyApp] Open tabs count:", len(tabs))
            page_tabs = [t for t in tabs if t.get("type") == "page" or (t.get("url", "").startswith("http"))]
            print("[VerifyApp] Page tabs found:", len(page_tabs))
            for tab in page_tabs:
                print("[VerifyApp] Tab title:", tab.get("title"))
                print("[VerifyApp] Tab URL:", tab.get("url"))
                if "RakshaSetu" in tab.get("title", ""):
                    print("[VerifyApp] Citizen PWA boot verified successfully!")
                    return True
        return False
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except Exception:
            proc.kill()

if __name__ == "__main__":
    verify_boot()
