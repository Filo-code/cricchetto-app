"""
Clicchetto — Instagram demo recorder (1080x1920 vertical).

Flusso: cruscotto -> digita targa -> clic Cerca -> risultati ->
apri scheda veicolo -> apri scheda lavoro (Ricambi e manodopera / preventivo)
-> scroll per mostrare i dati -> torna su.

Cursore finto gold (#c9a96a), movimenti/digitazione a velocita' umana.
Output: clicchetto_video/clicchetto_demo.mp4 (H.264 via ffmpeg).

Per riutilizzare lo script: modifica SOLO la CONFIG qui sotto e la funzione run_demo().
Gli helper type_slow(), click_demo(), beat() restano invariati.
"""

import os
import sys
import time
import json
import hmac
import base64
import hashlib
import shutil
import subprocess
from pathlib import Path

from playwright.sync_api import sync_playwright, Page, Locator

# ============================ CONFIG ============================
CONFIG = {
    "base_url": "http://localhost:3000",
    "viewport": {"width": 1080, "height": 1920},
    "plate": "BS908NP",                       # targa demo (esiste in officina 1111...)
    "out_dir": "clicchetto_video",
    "out_name": "clicchetto_demo.mp4",
    "raw_dir": "clicchetto_video/_raw",        # webm grezzo di Playwright

    # Auth: cookie di sessione firmato (sub="env" salta il check DB).
    # Letti da .env -> qui passati via variabili d'ambiente per non hardcodare segreti.
    "cookie_name": "cricchetto_dashboard_session",
    "session_secret": os.environ.get("Cricchetto_DASHBOARD_SESSION_SECRET", ""),
    "email": os.environ.get("Cricchetto_DASHBOARD_USERNAME", ""),
    "workshop_id": os.environ.get("Cricchetto_DASHBOARD_WORKSHOP_ID",
                                  "11111111-1111-1111-1111-111111111111"),

    # ffmpeg: auto-detect (PATH o WinGet). Override con env FFMPEG_BIN.
    "ffmpeg": os.environ.get("FFMPEG_BIN", ""),

    "cursor_color": "#c9a96a",
    "fps": 30,
}
# ================================================================


# ---------- auth cookie ----------
def _b64url(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def mint_session_cookie() -> str:
    secret = CONFIG["session_secret"]
    if not secret:
        sys.exit("ERRORE: Cricchetto_DASHBOARD_SESSION_SECRET non impostato nell'ambiente.")
    payload = {
        "sub": "env",
        "email": CONFIG["email"],
        "role": "owner",
        "workshopId": CONFIG["workshop_id"],
        "expiresAt": int(time.time()) + 7 * 24 * 3600,
        "sessionVersion": 0,
    }
    enc = _b64url(json.dumps(payload, separators=(",", ":")).encode())
    sig = _b64url(hmac.new(secret.encode(), enc.encode(), hashlib.sha256).digest())
    return f"{enc}.{sig}"


# ---------- ffmpeg discovery ----------
def find_ffmpeg() -> str:
    if CONFIG["ffmpeg"] and Path(CONFIG["ffmpeg"]).exists():
        return CONFIG["ffmpeg"]
    on_path = shutil.which("ffmpeg")
    if on_path:
        return on_path
    # WinGet Gyan.FFmpeg fallback
    local = os.environ.get("LOCALAPPDATA", "")
    if local:
        root = Path(local) / "Microsoft" / "WinGet" / "Packages"
        hits = list(root.glob("Gyan.FFmpeg*/**/bin/ffmpeg.exe"))
        if hits:
            return str(hits[0])
    sys.exit("ERRORE: ffmpeg non trovato. Installa o imposta FFMPEG_BIN.")


# ---------- fake gold cursor ----------
# Iniettato a ogni navigazione tramite add_init_script: sopravvive ai cambi pagina.
_CURSOR_JS = """
(() => {
  const mk = () => {
    // ricrea il cursore se manca o se e' stato staccato da una navigazione hard
    if (window.__cur && document.contains(window.__cur)) return;
    const c = document.createElement('div');
    c.id = '__demo_cursor';
    c.style.cssText = [
      'position:fixed','left:0','top:0','width:26px','height:26px',
      'margin:-13px 0 0 -13px','z-index:2147483647','pointer-events:none',
      'border-radius:50%','transition:transform .08s ease-out, width .08s ease, height .08s ease',
      'background:radial-gradient(circle at 35% 35%, %COLOR% 0%, %COLOR% 38%, rgba(201,169,106,.25) 60%, rgba(201,169,106,0) 72%)',
      'box-shadow:0 0 14px 3px rgba(201,169,106,.55), 0 2px 6px rgba(0,0,0,.4)',
      'transform:translate(-100px,-100px)'
    ].join(';');
    (document.body || document.documentElement).appendChild(c);
    window.__cur = c;
    window.__curMove = (x,y) => { c.style.transform = `translate(${x}px,${y}px)`; };
    window.__curPress = (down) => {
      c.style.width = down ? '18px' : '26px';
      c.style.height = down ? '18px' : '26px';
    };
  };
  if (document.body) mk();
  else document.addEventListener('DOMContentLoaded', mk);
})();
""".replace("%COLOR%", CONFIG["cursor_color"])


class Demo:
    def __init__(self, page: Page):
        self.page = page
        self.x = CONFIG["viewport"]["width"] / 2
        self.y = CONFIG["viewport"]["height"] * 0.18
        self._place()

    def _place(self):
        # riposiziona il cursore (utile dopo una navigazione che ricrea il DOM)
        try:
            self.page.evaluate("([x,y]) => window.__curMove && window.__curMove(x,y)",
                               [self.x, self.y])
        except Exception:
            pass
        self.page.mouse.move(self.x, self.y)

    def _ease(self, t: float) -> float:
        return 1 - pow(1 - t, 3)  # easeOutCubic

    def move_to(self, tx: float, ty: float, steps: int = 28):
        sx, sy = self.x, self.y
        for i in range(1, steps + 1):
            t = self._ease(i / steps)
            cx = sx + (tx - sx) * t
            cy = sy + (ty - sy) * t
            self.page.mouse.move(cx, cy)
            self.page.evaluate("([x,y]) => window.__curMove && window.__curMove(x,y)", [cx, cy])
            time.sleep(0.012)
        self.x, self.y = tx, ty

    def move_to_locator(self, loc: Locator, steps: int = 28):
        loc.scroll_into_view_if_needed()
        time.sleep(0.15)
        box = loc.bounding_box()
        if not box:
            raise RuntimeError("elemento senza bounding box")
        self.move_to(box["x"] + box["width"] / 2, box["y"] + box["height"] / 2, steps)

    # ----------------- HELPER PUBBLICI -----------------
    def beat(self, seconds: float = 0.8):
        """Pausa naturale (lascia respirare l'azione)."""
        time.sleep(seconds)

    def type_slow(self, selector: str, text: str, per_char: float = 0.11):
        """Sposta il cursore sul campo, clicca e digita a velocita' umana."""
        loc = self.page.locator(selector).first
        self.move_to_locator(loc)
        self.page.evaluate("() => window.__curPress && window.__curPress(true)")
        loc.click()
        self.page.evaluate("() => window.__curPress && window.__curPress(false)")
        self.beat(0.25)
        for ch in text:
            loc.type(ch, delay=0)
            time.sleep(per_char)

    def click_demo(self, target, settle: float = 0.9):
        """Sposta il cursore sull'elemento (selettore o Locator), pulsa e clicca."""
        loc = self.page.locator(target).first if isinstance(target, str) else target
        self.move_to_locator(loc)
        self.beat(0.2)
        self.page.evaluate("() => window.__curPress && window.__curPress(true)")
        time.sleep(0.12)
        loc.click()
        self.page.evaluate("() => window.__curPress && window.__curPress(false)")
        self.beat(settle)

    def smooth_scroll(self, to_y: int, duration: float = 1.2):
        cur = self.page.evaluate("() => window.scrollY")
        steps = max(int(duration * CONFIG["fps"]), 20)
        for i in range(1, steps + 1):
            t = self._ease(i / steps)
            self.page.evaluate("(y) => window.scrollTo(0, y)", cur + (to_y - cur) * t)
            time.sleep(duration / steps)

    def scroll_to_text(self, text: str, duration: float = 1.2):
        y = self.page.evaluate(
            """(t) => {
                const el = [...document.querySelectorAll('*')]
                  .find(e => e.children.length === 0 && e.textContent.trim() === t);
                if (!el) return null;
                const r = el.getBoundingClientRect();
                return window.scrollY + r.top - 220;
            }""", text)
        if y is not None:
            self.smooth_scroll(int(y), duration)

    def scroll_top(self, duration: float = 1.0):
        self.smooth_scroll(0, duration)

    def wait_nav(self, url_glob: str, timeout: int = 12000):
        self.page.wait_for_url(url_glob, timeout=timeout)
        self.page.wait_for_load_state("networkidle")
        time.sleep(1.0)   # settle: lascia completare il rendering
        self._place()


# ============================ DEMO SCRIPT ============================
def run_demo(d: Demo):
    base = CONFIG["base_url"]
    plate = CONFIG["plate"]
    pg = d.page

    # 1) Cruscotto
    pg.goto(f"{base}/dashboard", wait_until="networkidle")
    time.sleep(1.2)
    d._place()
    d.beat(1.0)

    # 2) Digita la targa nel campo di ricerca
    d.type_slow("#plate-search", plate)
    d.beat(0.6)

    # 3) Clic su "Cerca"
    d.click_demo('form button[type="submit"]:has-text("Cerca")', settle=0.3)
    d.wait_nav("**/dashboard/search**")
    d.beat(1.0)

    # 4) Apri la scheda veicolo dai risultati
    d.click_demo(f'a[href="/dashboard/vehicles/{plate}"]', settle=0.3)
    d.wait_nav(f"**/dashboard/vehicles/{plate}")
    d.beat(1.2)

    # 5) Apri la scheda lavoro attiva (interventi / preventivo)
    d.click_demo('a[href^="/dashboard/work-orders/"]', settle=0.3)
    d.wait_nav("**/dashboard/work-orders/**")
    d.beat(1.2)

    # 6) Scroll per mostrare "Ricambi e manodopera" (il preventivo)
    d.scroll_to_text("Ricambi e manodopera", duration=1.3)
    d.beat(1.8)

    # 7) Scroll un po' piu' giu' per note/allegati, poi torna su
    d.smooth_scroll(d.page.evaluate("() => window.scrollY") + 520, duration=1.1)
    d.beat(1.4)
    d.scroll_top(duration=1.1)
    d.beat(1.2)
# ====================================================================


def main():
    out_dir = Path(CONFIG["out_dir"]); out_dir.mkdir(parents=True, exist_ok=True)
    raw_dir = Path(CONFIG["raw_dir"]); raw_dir.mkdir(parents=True, exist_ok=True)
    ffmpeg = find_ffmpeg()
    cookie = mint_session_cookie()
    vp = CONFIG["viewport"]

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--force-color-profile=srgb"])
        ctx = browser.new_context(
            viewport=vp,
            device_scale_factor=2,
            reduced_motion="reduce",            # evita entrance-animations a opacity:0
            record_video_dir=str(raw_dir),
            record_video_size=vp,
        )
        ctx.add_init_script(_CURSOR_JS)
        ctx.add_cookies([{"name": CONFIG["cookie_name"], "value": cookie, "url": CONFIG["base_url"]}])
        page = ctx.new_page()

        d = Demo(page)
        run_demo(d)

        page.wait_for_timeout(400)
        video = page.video
        ctx.close()          # finalizza il file video
        browser.close()
        raw_path = Path(video.path())

    out_path = out_dir / CONFIG["out_name"]
    print(f"[ffmpeg] {raw_path.name} -> {out_path}")
    subprocess.run([
        ffmpeg, "-y", "-i", str(raw_path),
        "-r", str(CONFIG["fps"]),
        "-c:v", "libx264", "-preset", "slow", "-crf", "20",
        "-pix_fmt", "yuv420p",
        "-vf", f"scale={vp['width']}:{vp['height']}:flags=lanczos",
        "-movflags", "+faststart",
        str(out_path),
    ], check=True)
    print(f"\nOK -> {out_path.resolve()}")


if __name__ == "__main__":
    main()
