#!/usr/bin/env python3
"""Liest Dev-Daten des Rücken-Coach mit einem befristeten Lese-Schlüssel.

Aufruf:
  python3 fetch_dev.py <url> <key> <token> [--limit 5] [--images DIR] [--history]
"""
import argparse, base64, json, os, sys, urllib.request


def rpc(url, key, fn, payload):
    req = urllib.request.Request(
        f"{url.rstrip('/')}/rest/v1/rpc/{fn}",
        data=json.dumps(payload).encode(),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read() or b"null")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("url"); ap.add_argument("key"); ap.add_argument("token")
    ap.add_argument("--limit", type=int, default=5)
    ap.add_argument("--images", help="Ordner für Snapshot-Bilder")
    ap.add_argument("--history", action="store_true", help="alle Einheiten (ohne Rohwerte)")
    a = ap.parse_args()
    if a.history:
        print(json.dumps(rpc(a.url, a.key, "history_export", {"p_token": a.token, "p_limit": 2000}), ensure_ascii=False, indent=1))
        return
    b = rpc(a.url, a.key, "dev_bundle", {"p_token": a.token, "p_limit": a.limit})
    print(json.dumps(b, ensure_ascii=False, indent=1))
    if a.images:
        os.makedirs(a.images, exist_ok=True)
        for s in b.get("sessions", []):
            for snap in s.get("snapshots", []):
                img = rpc(a.url, a.key, "dev_image", {"p_token": a.token, "p_id": snap["id"]})
                if img and "," in img:
                    p = os.path.join(a.images, f"{s['started_at'][:16].replace(':', '')}_{snap['id']}_{snap['reason']}_{snap['exercise_id']}.jpg")
                    open(p, "wb").write(base64.b64decode(img.split(",", 1)[1]))
                    print("Bild:", p, file=sys.stderr)


if __name__ == "__main__":
    main()
