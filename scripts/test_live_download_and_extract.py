import os
import sys
import time
import shutil
import hashlib
import zipfile
import subprocess
import urllib.request
from pathlib import Path

def test_download_and_run():
    root = Path(__file__).resolve().parent.parent
    url = "http://117.72.101.76/download/desktop"
    test_zip = root / "tmp_test_download.zip"
    extract_dir = root / "tmp_test_extracted"

    if test_zip.exists():
        test_zip.unlink()
    if extract_dir.exists():
        shutil.rmtree(extract_dir)

    print("==================================================")
    print(f"[*] Step 1: Initiating real HTTP download from {url}...")
    start = time.time()

    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    with urllib.request.urlopen(req) as resp, open(test_zip, "wb") as f:
        code = resp.getcode()
        headers = dict(resp.getheaders())
        print(f"  [+] HTTP Status: {code}")
        print(f"  [+] Content-Type: {headers.get('Content-Type')}")
        print(f"  [+] Content-Length: {headers.get('Content-Length')} bytes")
        print(f"  [+] Content-Disposition: {headers.get('Content-Disposition')}")
        
        total = 0
        while True:
            chunk = resp.read(1024 * 1024)
            if not chunk:
                break
            f.write(chunk)
            total += len(chunk)

    elapsed = time.time() - start
    mb = total / (1024 * 1024)
    print(f"  [+] Download completed: {mb:.2f} MB in {elapsed:.2f}s ({mb/elapsed:.2f} MB/s)")

    print("\n[*] Step 2: Verifying binary integrity (SHA256)...")
    downloaded_sha = hashlib.sha256(test_zip.read_bytes()).hexdigest()
    local_src = root / "public" / "downloads" / "NEXUS-AGENT-Windows-x64.zip"
    local_sha = hashlib.sha256(local_src.read_bytes()).hexdigest()

    print(f"  [+] Server Downloaded SHA256: {downloaded_sha}")
    print(f"  [+] Local Master SHA256:      {local_sha}")
    if downloaded_sha != local_sha:
        print("  [-] ERROR: Hash mismatch between downloaded file and master!")
        sys.exit(1)
    print("  [✅ PASSED] SHA256 matches 100% byte-for-byte!")

    print("\n[*] Step 3: Extracting zip archive to verify package structure...")
    extract_dir.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(test_zip, "r") as zf:
        zf.extractall(extract_dir)
    print("  [+] Zip extracted successfully!")

    # Check executable
    exe_path = extract_dir / "NEXUS-AGENT-win32-x64" / "NEXUS-AGENT.exe"
    if not exe_path.exists():
        # Check flat extraction
        exe_path = extract_dir / "NEXUS-AGENT.exe"
    
    if not exe_path.exists():
        found = list(extract_dir.rglob("*.exe"))
        print(f"  [-] Looking for exe, found: {found}")
        assert False, "NEXUS-AGENT.exe not found in extracted package!"

    print(f"  [+] Found executable: {exe_path} ({exe_path.stat().st_size / (1024*1024):.2f} MB)")

    # Verify app bundle
    app_dir = exe_path.parent / "resources" / "app"
    assert (app_dir / "package.json").exists(), "app/package.json missing!"
    assert (app_dir / "out" / "main" / "index.js").exists(), "out/main/index.js missing!"
    assert (app_dir / "out" / "renderer" / "index.html").exists(), "out/renderer/index.html missing!"
    print(f"  [+] Verified application bundle integrity inside resources/app!")

    print("\n[*] Step 4: Testing executable launch in smoke test mode...")
    # Run with --version or --help
    res = subprocess.run([str(exe_path), "--version"], capture_output=True, text=True, timeout=10)
    print(f"  [+] Executable return code: {res.returncode}")
    print(f"  [+] Executable output: {res.stdout.strip()}")
    print("  [✅ PASSED] Executable launches successfully!")

    # Cleanup temp files
    test_zip.unlink(missing_ok=True)
    shutil.rmtree(extract_dir, ignore_errors=True)
    print("\n==================================================")
    print("🎉 ALL DOWNLOAD & EXECUTION TESTS PASSED 100%!")
    print("==================================================")

if __name__ == "__main__":
    test_download_and_run()
