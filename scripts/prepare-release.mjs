import { readFile, readdir, mkdir, copyFile, chmod, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const tag = process.argv[process.argv.indexOf('--tag') + 1];
if (!process.argv.includes('--tag') || !/^v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(tag)) throw Error('Provide a version tag, e.g. --tag v0.1.0');
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const cargo = await readFile('src-tauri/Cargo.toml', 'utf8');
const cargoVersion = cargo.split('[package]')[1]?.split(/\n\[/)[0].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const version = tag.slice(1);
if ([config.version, pkg.version, cargoVersion].some(v => v !== version)) throw Error(`Tag ${tag} must match package.json, tauri.conf.json and src-tauri/Cargo.toml versions`);
if (process.argv.includes('--check-version')) { console.log(`Version verified: ${tag}`); process.exit(0); }

const output = path.resolve('target/release/distribution');
await mkdir(output, { recursive: true });
const formats = [
  ['appimage', '.AppImage', `Phosphor-${version}-linux-x86_64.AppImage`],
  ['deb', '.deb', `phosphor_${version}_amd64.deb`],
];
const names = [];
for (const [directory, extension, name] of formats) {
  const folder = path.join('target/release/bundle', directory);
  const files = (await readdir(folder)).filter(f => f.endsWith(extension));
  if (files.length !== 1) throw Error(`Expected one ${extension} in ${folder}, found ${files.length}; build in a clean checkout`);
  await copyFile(path.join(folder, files[0]), path.join(output, name));
  await chmod(path.join(output, name), extension === '.AppImage' ? 0o755 : 0o644);
  names.push(name);
}
const instructions = `PHOSPHOR ${version} — LINUX x86_64 (PREVIEW)\n\nAPPIMAGE — no application installation required\n1. Download Phosphor-${version}-linux-x86_64.AppImage.\n2. In your file manager, open Properties and allow executing it as a program.\n3. Double-click it.\n\nFrom a terminal:\n  chmod u+x Phosphor-${version}-linux-x86_64.AppImage\n  ./Phosphor-${version}-linux-x86_64.AppImage\n\nIf your system lacks FUSE 2, use:\n  APPIMAGE_EXTRACT_AND_RUN=1 ./Phosphor-${version}-linux-x86_64.AppImage\n\nDEBIAN / UBUNTU INSTALLER (optional)\n  sudo apt install ./phosphor_${version}_amd64.deb\nThis installs the app and menu icon and resolves system dependencies.\n\nNo Node.js, Rust toolchain, development server or account is required to run.\nBuilt on Ubuntu 22.04; intended baseline is glibc 2.35 or newer, Linux x86_64.\nA working graphical desktop and compatible graphics drivers are required.\nOther Linux distributions have not all been tested. ARM is not included.\n\nYour notes are stored separately in the application-data directory. On Linux:\n  ~/.local/share/com.phosphor.notes/phosphor.sqlite3\n(or beneath XDG_DATA_HOME if configured). Your personal notes are not bundled.\n\nVERIFY DOWNLOADS\nDownload SHA256SUMS into this folder and run:\n  sha256sum --check SHA256SUMS\n\nUpdates are manual: download the next AppImage and replace the old app file.\nKeep your application-data directory. Automatic updates and backups are not included.\n\nSource and releases: https://github.com/gumuller/phosphor\nThe repository is private; GitHub downloads require access. You may share the\nAppImage file directly without sharing your notes or build environment.\n`;
await writeFile(path.join(output, 'INSTALL.txt'), instructions);
names.push('INSTALL.txt');
const sums = [];
for (const name of names) {
  const data = await readFile(path.join(output, name));
  sums.push(`${createHash('sha256').update(data).digest('hex')}  ${name}`);
}
await writeFile(path.join(output, 'SHA256SUMS'), sums.join('\n') + '\n');
console.log(`Prepared ${names.length + 1} release files in ${output}`);
