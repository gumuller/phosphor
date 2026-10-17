#!/usr/bin/env python3
"""Native WebKit/Tauri E2E. Uses real IPC + SQLite; no browser-storage or command mocks.
Run after `npm run tauri -- build --no-bundle` with tauri-driver and WebKitWebDriver on PATH.
Uses disposable XDG directories, never the user's notes. Requires DISPLAY/Wayland (CI: xvfb-run).
"""
import base64
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / 'target/e2e-artifacts'
ELEMENT = 'element-6066-11e4-a52e-4f735466cecf'


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1', 0))
        return s.getsockname()[1]


class NativeWorkflow(unittest.TestCase):
    def request(self, method, path, body=None):
        request = urllib.request.Request(self.url + path, data=None if body is None else json.dumps(body).encode(), headers={'Content-Type': 'application/json'}, method=method)
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                value = json.load(response).get('value')
        except urllib.error.HTTPError as e:
            message = e.read().decode(); e.close()
            raise AssertionError(message) from e
        if isinstance(value, dict) and 'error' in value:
            raise AssertionError(value)
        return value

    def session_request(self, method, path, body=None):
        return self.request(method, '/session/' + self.session + path, body)

    def js(self, script, *args):
        # WebKitWebDriver can retire a pooled HTTP connection between commands.
        # Only retry read-only evaluation here; mutation helpers handle their own waits.
        attempts = 3 if script.lstrip().startswith('return ') else 1
        for attempt in range(attempts):
            try:
                return self.session_request('POST', '/execute/sync', {'script': script, 'args': list(args)})
            except (OSError, urllib.error.URLError):
                if attempt + 1 == attempts:
                    raise
                time.sleep(.08)

    def wait(self, predicate, description, timeout=15):
        deadline = time.monotonic() + timeout
        last = None
        while time.monotonic() < deadline:
            try:
                result = predicate()
                if result:
                    return result
            except (AssertionError, KeyError, urllib.error.URLError, OSError) as e:
                last = e
            time.sleep(.08)
        raise AssertionError(f'Timed out: {description}. Last error: {last}')

    def element(self, css):
        return self.wait(lambda: self.session_request('POST', '/element', {'using': 'css selector', 'value': css}), css)[ELEMENT]

    def click_locator(self, using, value):
        def attempt():
            element = self.session_request('POST', '/element', {'using': using, 'value': value})[ELEMENT]
            if not self.session_request('GET', f'/element/{element}/enabled'):
                return False
            self.js('arguments[0].scrollIntoView({block:"center"})', {ELEMENT: element})
            self.session_request('POST', f'/element/{element}/click', {})
            return True
        self.wait(attempt, f'click {value}')

    def click(self, css):
        self.click_locator('css selector', css)

    def button(self, text):
        self.click_locator('xpath', f'//button[normalize-space(.)="{text}"]')

    def fill(self, label, text):
        def attempt():
            element = self.session_request('POST', '/element', {'using': 'css selector', 'value': f'[aria-label="{label}"]'})[ELEMENT]
            if not self.session_request('GET', f'/element/{element}/enabled'):
                return False
            self.js('arguments[0].scrollIntoView({block:"center"})', {ELEMENT: element})
            self.session_request('POST', f'/element/{element}/clear', {})
            self.session_request('POST', f'/element/{element}/value', {'text': text})
            return True
        self.wait(attempt, f'fill {label}')

    def select(self, label, value):
        # Native WebDriver doesn't implement Select helpers; use the same DOM events as selection.
        # Selection is idempotent, so a transient transport disconnect can retry safely.
        self.wait(lambda: self.js('const e=document.querySelector(arguments[0]); if (!e || e.disabled) return false; e.value=arguments[1]; e.dispatchEvent(new Event("change",{bubbles:true})); return true;', f'select[aria-label="{label}"]', value), f'select {label}')

    def text(self, css):
        return self.js('return document.querySelector(arguments[0])?.textContent || ""', css)

    def value(self, label):
        return self.js('return document.querySelector(arguments[0])?.value', f'[aria-label="{label}"]')

    def saved(self):
        self.wait(lambda: 'All changes saved' in self.text('.editor-footer'), 'save queue drained')

    def close_tools(self):
        self.wait(lambda: not self.js('return document.querySelector("fieldset")?.disabled'), 'operation complete')
        self.click('[aria-label="Close workspace tools"]')

    def open_tools(self, tab):
        self.click('[aria-label="Workspace tools"]')
        self.click(f'[role="tab"]:nth-child({["Notebooks", "Tags", "Backups"].index(tab)+1})')

    def start_session(self):
        response = self.request('POST', '/session', {'capabilities': {'alwaysMatch': {'browserName': 'wry', 'tauri:options': {'application': str(Path(os.environ.get('PHOSPHOR_E2E_BINARY', ROOT / 'target/release/phosphor')).resolve())}}}})
        self.session = response['sessionId']
        self.wait(lambda: self.value('Note title') is not None, 'native app ready')
        self.wait(lambda: self.database.exists(), 'real database initialized')

    def setUp(self):
        self.directory = tempfile.TemporaryDirectory(prefix='phosphor-native-e2e-')
        self.data = Path(self.directory.name) / 'data'
        self.database = self.data / 'com.phosphor.notes/phosphor.sqlite3'
        self.database.parent.mkdir(parents=True)
        # A genuine v0.1 database verifies upgrade/migration, not just fresh installs.
        with sqlite3.connect(self.database) as db:
            db.executescript('CREATE TABLE notes(id TEXT PRIMARY KEY,data TEXT NOT NULL); CREATE TABLE metadata(key TEXT PRIMARY KEY,value TEXT NOT NULL); INSERT INTO metadata VALUES("initialized","1");')
            for note in json.loads((ROOT / 'src/seeds.json').read_text()):
                db.execute('INSERT INTO notes VALUES(?,?)', (note['id'], json.dumps(note)))
        port, native_port = free_port(), free_port()
        self.url = f'http://127.0.0.1:{port}'
        environment = {**os.environ, 'XDG_DATA_HOME': str(self.data), 'XDG_CONFIG_HOME': str(Path(self.directory.name)/'config'), 'XDG_CACHE_HOME': str(Path(self.directory.name)/'cache'), 'TAURI_WEBVIEW_AUTOMATION': 'true', 'GDK_BACKEND': 'x11', 'GDK_SCALE': '1', 'GDK_DPI_SCALE': '1', 'LIBGL_ALWAYS_SOFTWARE': '1', 'WEBKIT_DISABLE_DMABUF_RENDERER': '1'}
        ARTIFACTS.mkdir(parents=True, exist_ok=True)
        self.log = (ARTIFACTS / 'driver.log').open('w')
        command = [shutil.which('tauri-driver') or str(Path.home()/'.cargo/bin/tauri-driver'), '--port', str(port), '--native-port', str(native_port)]
        if os.environ.get('WEBKIT_WEBDRIVER'):
            command += ['--native-driver', os.environ['WEBKIT_WEBDRIVER']]
        self.driver = subprocess.Popen(command, env=environment, stdout=self.log, stderr=subprocess.STDOUT, start_new_session=True)
        self.session = None
        self.addCleanup(self.shutdown)
        self.wait(lambda: self.request('GET', '/status'), 'WebDriver ready')
        self.start_session()

    def shutdown(self):
        if self.session:
            try:
                screenshot = self.session_request('GET', '/screenshot')
                (ARTIFACTS / 'native-workspace.png').write_bytes(base64.b64decode(screenshot))
                (ARTIFACTS / 'page.html').write_text(self.session_request('GET', '/source'))
                self.session_request('DELETE', '')
            except Exception as e:
                print(f'Cleanup: {e}', flush=True)
        if self.driver.poll() is None:
            os.killpg(self.driver.pid, signal.SIGTERM)
            try: self.driver.wait(timeout=5)
            except subprocess.TimeoutExpired: os.killpg(self.driver.pid, signal.SIGKILL)
        self.log.close()
        self.directory.cleanup()

    def note(self):
        with sqlite3.connect(self.database) as db:
            return next((json.loads(r[0]) for r in db.execute('SELECT data FROM notes') if json.loads(r[0])['title'] == 'E2E launch'), None)

    def test_native_workspace_lifecycle(self):
        print('E2E: upgrade, notebook creation and validation', flush=True)
        self.open_tools('Notebooks')
        self.fill('New notebook name', 'Research')
        self.button('Create notebook')
        self.wait(lambda: 'Notebook created.' in self.text('.tools-success'), 'notebook creation')
        self.fill('New notebook name', 'research')
        self.button('Create notebook')
        self.wait(lambda: 'already exists' in self.text('.tools-error'), 'duplicate rejected')
        self.close_tools()
        self.button('New note⌃ N')
        self.fill('Note title', 'E2E launch')
        self.select('Notebook', 'Research')
        self.fill('Tags, separated by commas', 'alpha, beta')
        editor = self.element('.tiptap[contenteditable="true"]')
        self.session_request('POST', f'/element/{editor}/value', {'text': 'Nebulagraph launch checklist with café and durable local notes.'})
        self.saved()
        self.wait(lambda: self.note() and 'Nebulagraph' in self.note()['body'], 'SQLite persisted formatted editing')
        self.assertEqual(self.note()['notebook'], 'Research')
        print('E2E: SQLite FTS, highlights and filters', flush=True)
        self.fill('Search notes', 'nebulag')
        self.wait(lambda: 'E2E launch' in self.text('.note-cards'), 'body prefix indexed')
        self.assertIn('Nebulag', self.text('.note-card mark'))
        self.assertEqual(self.value('Sort notes'), 'relevance')
        self.select('Filter by notebook', 'Personal')
        self.wait(lambda: 'E2E launch' not in self.text('.note-cards'), 'notebook filter')
        self.select('Filter by notebook', 'Research')
        self.select('Filter by tag', 'beta')
        self.wait(lambda: 'E2E launch' in self.text('.note-cards'), 'combined tag/notebook filters')
        self.select('Sort notes', 'title')
        self.click('[aria-label="Clear search"]')
        self.select('Filter by notebook', '')
        self.select('Filter by tag', '')
        print('E2E: notebook rename, tag merge/removal and empty notebook persistence', flush=True)
        self.open_tools('Notebooks')
        self.select('Manage notebook', 'Research')
        self.fill('Notebook name', 'Writing')
        self.button('Rename notebook')
        self.wait(lambda: self.note()['notebook'] == 'Writing', 'rename updates notes')
        self.fill('New notebook name', 'Empty book')
        self.button('Create notebook')
        self.wait(lambda: 'Notebook created.' in self.text('.tools-success'), 'empty notebook created')
        self.click('[role="tab"]:nth-child(2)')
        self.select('Manage tag', 'alpha')
        self.fill('Tag name', 'beta')
        self.button('Rename tag')
        self.wait(lambda: self.note()['tags'] == 'beta', 'tags merged without duplicates')
        self.button('Remove tag')
        self.button('Confirm remove tag')
        self.wait(lambda: self.note()['tags'] == '', 'tag removed without deleting note')
        self.click('[role="tab"]:nth-child(3)')
        self.button('Create snapshot')
        self.wait(lambda: 'Snapshot created.' in self.text('.tools-success'), 'manual snapshot saved')
        self.wait(lambda: self.js('return !!document.querySelector(arguments[0])', '[aria-label^="Restore manual-"]'), 'snapshot visible')
        snapshot_id = self.js('return document.querySelector(arguments[0]).getAttribute("aria-label").slice(8)', '[aria-label^="Restore manual-"]')
        self.close_tools()
        print('E2E: safe restore, recovery copy and index consistency', flush=True)
        self.fill('Note title', 'Changed after backup')
        self.saved()
        self.open_tools('Backups')
        self.click(f'[aria-label="Restore {snapshot_id}"]')
        self.assertIn('recovery snapshot', self.text('.tools-confirm'))
        self.button('Confirm restore')
        self.wait(lambda: 'Workspace restored.' in self.text('.tools-success'), 'workspace restored')
        self.assertIn('Before restore snapshot', self.text('.backup-list'))
        self.close_tools()
        self.fill('Search notes', 'nebulag')
        self.wait(lambda: 'E2E launch' in self.text('.note-cards'), 'restored FTS index')
        self.click('.note-card')
        self.assertEqual(self.value('Note title'), 'E2E launch')
        self.click('[aria-label="Clear search"]')
        self.open_tools('Notebooks')
        self.select('Manage notebook', 'Writing')
        self.button('Delete notebook')
        self.button('Confirm delete notebook')
        self.wait(lambda: self.note()['notebook'] == 'Inbox', 'deleted notebook notes moved to Inbox')
        self.close_tools()
        self.click('[aria-label="Move to trash"]')
        self.wait(lambda: self.note()['trashed'], 'trash saved')
        self.button('Trash1')
        self.fill('Search notes', 'nebulag')
        self.wait(lambda: 'E2E launch' in self.text('.note-cards'), 'trash searchable only in Trash')
        self.click('.note-card')
        self.click('.note-actions [aria-label="Restore note"]')
        self.wait(lambda: not self.note()['trashed'], 'note restored from Trash')
        print('E2E: reopen native executable with persisted notes, index and empty notebooks', flush=True)
        self.saved()
        self.session_request('DELETE', '')
        self.session = None
        self.start_session()
        self.fill('Search notes', 'nebulag')
        self.wait(lambda: 'E2E launch' in self.text('.note-cards'), 'search survives restart')
        self.assertTrue(self.js('return [...document.querySelectorAll("nav[aria-label=Notebooks] button")].some(e=>e.textContent.includes("Empty book"))'))
        self.assertFalse(self.js('return !!document.querySelector(".error-banner")'))
        print('E2E: portable backup-file validation and recovery', flush=True)
        backup_path = self.database.parent / 'backups' / snapshot_id
        portable = Path(self.directory.name) / 'phosphor-backup.json'
        portable.write_bytes(backup_path.read_bytes())
        self.open_tools('Backups')
        invalid = Path(self.directory.name) / 'invalid-backup.json'
        invalid.write_text('{broken JSON')
        file_input = self.element('[aria-label="Restore backup file"]')
        self.session_request('POST', f'/element/{file_input}/value', {'text': str(invalid)})
        self.wait(lambda: 'Could not read backup' in self.text('.tools-error'), 'invalid file rejected')
        self.assertEqual(self.note()['notebook'], 'Inbox')
        file_input = self.element('[aria-label="Restore backup file"]')
        self.session_request('POST', f'/element/{file_input}/value', {'text': str(portable)})
        self.wait(lambda: 'Restore backup file?' in self.text('.tools-confirm'), 'portable backup preview')
        self.button('Confirm restore file')
        self.wait(lambda: 'Backup file restored.' in self.text('.tools-success'), 'portable backup restored')
        self.close_tools()
        self.assertEqual(self.note()['notebook'], 'Writing')
        self.fill('Search notes', 'nebulag')
        self.wait(lambda: 'E2E launch' in self.text('.note-cards'), 'imported notes indexed')
        self.assertFalse(self.js('return !!document.querySelector(".error-banner")'))
        print('E2E: all native lifecycle assertions passed', flush=True)


if __name__ == '__main__':
    unittest.main(verbosity=2)
