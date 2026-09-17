import os
import shutil
import zipfile
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ELECTRON_DIST = ROOT / "node_modules" / "electron" / "dist"
RELEASE_DIR = ROOT / "release" / "NEXUS-AGENT-win32-x64"
PUBLIC_DOWNLOADS = ROOT / "public" / "downloads"

def package_electron():
    print("[*] Step 1: Building electron-vite bundles (out/main, out/renderer)...")
    subprocess.run(["npm.cmd", "run", "build"], cwd=ROOT, check=True)

    print("[*] Step 2: Preparing release directory...")
    if RELEASE_DIR.exists():
        shutil.rmtree(RELEASE_DIR)
    RELEASE_DIR.mkdir(parents=True, exist_ok=True)

    print(f"[*] Step 3: Copying prebuilt Electron runtime from {ELECTRON_DIST}...")
    # Copy all files and subdirs from electron/dist
    for item in ELECTRON_DIST.iterdir():
        dest = RELEASE_DIR / item.name
        if item.is_dir():
            shutil.copytree(item, dest)
        else:
            shutil.copy2(item, dest)

    # Rename electron.exe -> NEXUS-AGENT.exe
    src_exe = RELEASE_DIR / "electron.exe"
    target_exe = RELEASE_DIR / "NEXUS-AGENT.exe"
    if src_exe.exists():
        src_exe.rename(target_exe)
        print(f"[+] Renamed executable to {target_exe.name}")

    print("[*] Step 4: Injecting application bundle into resources/app...")
    app_dir = RELEASE_DIR / "resources" / "app"
    app_dir.mkdir(parents=True, exist_ok=True)

    # Copy package.json
    shutil.copy2(ROOT / "package.json", app_dir / "package.json")

    # Copy out/ directory
    shutil.copytree(ROOT / "out", app_dir / "out", dirs_exist_ok=True)

    # Copy production node_modules dependencies
    prod_modules = [
        "@modelcontextprotocol", "@xterm", "clsx", "diff",
        "lucide-react", "tailwind-merge", "zod"
    ]
    target_node_modules = app_dir / "node_modules"
    target_node_modules.mkdir(exist_ok=True)
    for mod in prod_modules:
        mod_src = ROOT / "node_modules" / mod
        if mod_src.exists():
            shutil.copytree(mod_src, target_node_modules / mod, dirs_exist_ok=True)

    print(f"[+] Application assembled successfully in {RELEASE_DIR}!")

    print("[*] Step 5: Compressing into release zip for web download...")
    PUBLIC_DOWNLOADS.mkdir(parents=True, exist_ok=True)
    zip_path = PUBLIC_DOWNLOADS / "NEXUS-AGENT-Windows-x64.zip"

    # Zip with standard compression
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        for file_path in RELEASE_DIR.rglob("*"):
            if file_path.is_file():
                rel_path = file_path.relative_to(RELEASE_DIR.parent)
                zf.write(file_path, rel_path)

    size_mb = zip_path.stat().st_size / (1024 * 1024)
    print(f"[+] Successfully generated desktop package: {zip_path} ({size_mb:.2f} MB)")

if __name__ == "__main__":
    package_electron()
