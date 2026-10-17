#!/usr/bin/env python3
"""Start an AppImage with disposable data on an existing display (CI uses Xvfb).
This checks extraction, native startup, SQLite initialization and a WebKit content
helper. It does not automate the editor or establish visual/input correctness.
"""
import os
from pathlib import Path
import signal
import sqlite3
import subprocess
import sys
import tempfile
import time

image = Path(sys.argv[1]).resolve()
if not image.is_file():
    raise SystemExit(f'AppImage not found: {image}')


def has_web_process(root):
    parents = {}
    names = {}
    for entry in Path('/proc').glob('[0-9]*'):
        try:
            stat = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            parents[int(entry.name)] = int(stat[1])
            names[int(entry.name)] = (entry / 'comm').read_text().strip()
        except (OSError, ValueError):
            continue
    children = {root}
    while True:
        expanded = children | {pid for pid, parent in parents.items() if parent in children}
        if expanded == children:
            break
        children = expanded
    return any(names.get(pid, '').startswith('WebKitWebProces') for pid in children)


with tempfile.TemporaryDirectory(prefix='phosphor-package-smoke-') as temporary:
    root = Path(temporary)
    extracted = root / 'squashfs-root'
    extraction = subprocess.run([str(image), '--appimage-extract'], cwd=root, capture_output=True, text=True)
    if extraction.returncode:
        raise RuntimeError(f'AppImage extraction failed: {extraction.stderr[-3000:]}')
    desktop_files = list(extracted.glob('*.desktop'))
    if len(desktop_files) != 1 or not (extracted / 'AppRun').exists():
        raise RuntimeError('AppImage is missing its desktop launcher or AppRun')
    subprocess.run(['desktop-file-validate', str(desktop_files[0])], check=True)
    if list(extracted.rglob('*.sqlite3')):
        raise RuntimeError('Unexpected note database bundled in the application')
    print('AppImage extraction and desktop launcher metadata verified.', flush=True)
    env = os.environ.copy()
    env.update({
        'XDG_DATA_HOME': str(root / 'data'),
        'XDG_CONFIG_HOME': str(root / 'config'),
        'XDG_CACHE_HOME': str(root / 'cache'),
        'APPIMAGE_EXTRACT_AND_RUN': '1',
        'GDK_BACKEND': 'x11',
        'LIBGL_ALWAYS_SOFTWARE': '1',
        'WEBKIT_DISABLE_DMABUF_RENDERER': '1',
    })
    log_path = root / 'startup.log'
    with log_path.open('w') as log:
        app = subprocess.Popen([str(image)], env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            deadline = time.monotonic() + 30
            while time.monotonic() < deadline:
                if app.poll() is not None:
                    raise RuntimeError(f'App exited with status {app.returncode}')
                database = root / 'data/com.phosphor.notes/phosphor.sqlite3'
                if database.exists() and has_web_process(app.pid):
                    try:
                        with sqlite3.connect(f'file:{database}?mode=ro', uri=True) as db:
                            assert db.execute('pragma quick_check').fetchone()[0] == 'ok'
                            assert db.execute('select count(*) from notes').fetchone()[0] == 4
                        time.sleep(2)
                        if app.poll() is not None:
                            raise RuntimeError('App exited after initialization')
                        print('AppImage smoke passed: native app, SQLite and WebKit content process started.')
                        break
                    except sqlite3.Error:
                        pass
                time.sleep(.25)
            else:
                raise RuntimeError('App or WebKit failed to initialize within 30 seconds')
        except Exception:
            print(log_path.read_text(), file=sys.stderr)
            raise
        finally:
            if app.poll() is None:
                os.killpg(app.pid, signal.SIGTERM)
                try:
                    app.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    os.killpg(app.pid, signal.SIGKILL)
                    app.wait()
