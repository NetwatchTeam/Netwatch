import json
from datetime import datetime
from pathlib import Path

import requests
from apscheduler.schedulers.background import BackgroundScheduler

BASE_URL = "http://127.0.0.1:5000"
ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = ROOT / "output"
OUTPUT_DIR.mkdir(exist_ok=True)


def save_json(name, data):
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = OUTPUT_DIR / f"{name}_{ts}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def get_scan():
    try:
        r = requests.get(f"{BASE_URL}/scan", timeout=30)
        r.raise_for_status()
        save_json("get_scan", r.json())
    except (requests.RequestException, ValueError) as e:
        print("GET /scan erreur :", e)


def post_scan():
    try:
        r = requests.post(
            f"{BASE_URL}/scan",
            json={"target": "192.168.1.0/24"},  # adapte au corps attendu
            timeout=30,
        )
        r.raise_for_status()
        save_json("post_scan", r.json())
    except (requests.RequestException, ValueError) as e:
        print("POST /scan erreur :", e)


def launch_scheduler() -> BackgroundScheduler:
    scheduler = BackgroundScheduler()
    scheduler.add_job(get_scan, "interval", minutes=5, max_instances=1, coalesce=True)
    scheduler.add_job(post_scan, "interval", minutes=5, max_instances=1, coalesce=True)
    scheduler.start()
    return scheduler