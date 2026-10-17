import { it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const script=path.resolve('scripts/prepare-release.mjs');
function fixture() {
  const root=mkdtempSync(path.join(tmpdir(),'phosphor-release-test-'));
  mkdirSync(path.join(root,'src-tauri'));
  writeFileSync(path.join(root,'src-tauri/tauri.conf.json'),JSON.stringify({version:'0.1.0'}));
  writeFileSync(path.join(root,'package.json'),JSON.stringify({version:'0.1.0'}));
  writeFileSync(path.join(root,'src-tauri/Cargo.toml'),'[package]\nname = "phosphor"\nversion = "0.1.0"\n');
  return root;
}
it('stages versioned downloads and hashes the exact distributed bytes',()=>{
  const root=fixture();
  try {
    for(const [directory,file,body] of [['appimage','Phosphor_0.1.0_amd64.AppImage','appimage fixture'],['deb','phosphor_0.1.0_amd64.deb','deb fixture']]){
      const folder=path.join(root,'target/release/bundle',directory);mkdirSync(folder,{recursive:true});writeFileSync(path.join(folder,file),body);
    }
    const result=spawnSync(process.execPath,[script,'--tag','v0.1.0'],{cwd:root,encoding:'utf8'});
    expect(result.status,result.stderr).toBe(0);
    const folder=path.join(root,'target/release/distribution');
    const entries=readFileSync(path.join(folder,'SHA256SUMS'),'utf8').trim().split('\n');
    expect(entries).toHaveLength(3);
    for(const entry of entries){const [hash,name]=entry.split('  ');expect(createHash('sha256').update(readFileSync(path.join(folder,name))).digest('hex')).toBe(hash);}
    expect(statSync(path.join(folder,'Phosphor-0.1.0-linux-x86_64.AppImage')).mode & 0o111).toBe(0o111);
    expect(readFileSync(path.join(folder,'INSTALL.txt'),'utf8')).toContain('APPIMAGE_EXTRACT_AND_RUN=1');
  } finally {rmSync(root,{recursive:true,force:true});}
});
it('rejects mismatched release tags before publication',()=>{
  const root=fixture();
  try {const result=spawnSync(process.execPath,[script,'--tag','v0.2.0','--check-version'],{cwd:root,encoding:'utf8'});expect(result.status).not.toBe(0);expect(result.stderr).toContain('must match');}
  finally {rmSync(root,{recursive:true,force:true});}
});
