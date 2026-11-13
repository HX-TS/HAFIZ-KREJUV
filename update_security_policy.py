"""Regenerate inline-script CSP hashes after editing an HTML page (Python 3)."""
from pathlib import Path
import base64
import hashlib
import re

ROOT = Path(__file__).resolve().parent
for relative in ("index.html", "SWABBING/index.html", "SUMMARY/index.html"):
    path = ROOT / relative
    original = path.read_bytes()
    text = original.decode().replace("\r\n", "\n")
    hashes = []
    for attrs, script in re.findall(r"<script\b([^>]*)>([\s\S]*?)</script>", text):
        if not re.search(r"\bsrc\s*=", attrs, re.I):
            digest = base64.b64encode(hashlib.sha256(script.encode()).digest()).decode()
            hashes.append(f"'sha256-{digest}'")
    policy = "; ".join([
        "default-src 'self'",
        "script-src 'self' https://script.google.com/macros/s/ https://script.googleusercontent.com/macros/echo https://www.googletagmanager.com/gtag/ " + " ".join(hashes),
        "connect-src https://*.google-analytics.com https://*.analytics.google.com https://www.googletagmanager.com",
        "frame-src 'none'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: https://i.ibb.co https://*.google-analytics.com https://www.googletagmanager.com",
        "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    ])
    meta = f'<meta http-equiv="Content-Security-Policy" content="{policy}">'
    text, count = re.subn(r'<!-- SECURITY_POLICY -->|<meta http-equiv="Content-Security-Policy"[^>]*>', lambda _: meta, text)
    assert count == 1, f"Missing or duplicated CSP marker in {relative}"
    path.write_bytes(text.replace("\n", "\r\n").encode() if b"\r\n" in original else text.encode())
    print(f"Updated {relative}")
