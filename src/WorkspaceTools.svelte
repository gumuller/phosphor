<script lang="ts">
  import { onMount } from 'svelte';
  import { X } from '@lucide/svelte';
  import { listBackups } from './storage';
  import { validateWorkspace, type Backup, type BackupInfo } from './workspace';
  let { notebooks, tags, tab = 'Notebooks', oncreate, onnotebook, ontag, onbackup, onrestore, onrestorefile, onexport, onclose }: {
    notebooks: string[]; tags: string[]; tab?: string;
    oncreate: (name: string) => Promise<void>;
    onnotebook: (old: string, name: string | null) => Promise<void>;
    ontag: (old: string, name: string | null) => Promise<void>;
    onrestorefile: (backup: Backup) => Promise<void>; onbackup: () => Promise<void>; onrestore: (id: string) => Promise<void>; onexport: () => Promise<boolean>; onclose: () => void;
  } = $props();
  let busy = $state(false);
  let problem = $state('');
  let message = $state('');
  let newName = $state('');
  let notebook = $state('');
  let notebookName = $state('');
  let tag = $state('');
  let tagName = $state('');
  let backups: BackupInfo[] = $state([]);
  let restore: BackupInfo | undefined = $state();
  let deleting = $state('');
  let fileBackup: Backup | undefined = $state();
  let panel: HTMLElement;
  let closeButton: HTMLButtonElement;
  onMount(() => { const previous = document.activeElement as HTMLElement; closeButton.focus(); void refresh(); return () => previous?.focus(); });
  async function refresh() { try { backups = await listBackups(); } catch (e) { problem = String(e); } }
  async function run(action: () => Promise<unknown>, success: string) {
    if (busy) return;
    busy = true; problem = ''; message = '';
    try { const result = await action(); await refresh(); if (result !== false) message = success; deleting = ''; restore = undefined; fileBackup = undefined; }
    catch (e) { problem = String(e); }
    finally { busy = false; }
  }
  async function readFile(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    problem = ''; message = '';
    try {
      const backup = JSON.parse(await file.text()) as Backup;
      if (backup.version !== 1) throw Error('Unsupported backup version');
      validateWorkspace(backup.workspace); fileBackup = backup; restore = undefined;
    } catch (e) { fileBackup = undefined; problem = `Could not read backup: ${String(e)}`; }
    input.value = '';
  }
  function keyboard(event: KeyboardEvent) {
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); if (!busy) onclose(); }
    if (event.key !== 'Tab') return;
    const controls = [...panel.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),a[href]')];
    const first = controls[0], last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
  }
</script>
<div class="tools-backdrop">
  <div class="workspace-tools" role="dialog" aria-modal="true" aria-labelledby="tools-title" tabindex="-1" bind:this={panel} onkeydown={keyboard}>
    <div class="tools-top"><div class="tools-heading"><h2 id="tools-title">Your workspace</h2><button bind:this={closeButton} class="icon-button" aria-label="Close workspace tools" onclick={onclose} disabled={busy}><X size={18}/></button></div>
    <div class="tools-tabs" role="tablist" aria-label="Workspace tools">{#each ['Notebooks', 'Tags', 'Backups'] as name}<button role="tab" aria-selected={tab === name} onclick={() => { tab = name; problem = ''; message = ''; }} disabled={busy}>{name}</button>{/each}</div>
    </div>
    {#if problem}<p class="tools-error" role="alert">{problem}</p>{/if}
    {#if message}<p class="tools-success" role="status">{message}</p>{/if}
    <fieldset disabled={busy}>
      {#if tab === 'Notebooks'}
        <p>A home for every thought. Deleting a notebook moves its notes to Inbox, including notes in Trash.</p>
        <form onsubmit={e => { e.preventDefault(); void run(async () => { await oncreate(newName); newName = ''; }, 'Notebook created.'); }}>
          <label>New notebook<input aria-label="New notebook name" bind:value={newName} maxlength="80" placeholder="e.g. Research" required/></label><button class="quiet-button" type="submit">Create notebook</button>
        </form>
        <div class="tools-divider"></div>
        <label>Manage notebook<select aria-label="Manage notebook" bind:value={notebook} onchange={e => { notebookName = e.currentTarget.value; deleting = ''; }}><option value="">Choose a notebook…</option>{#each notebooks as name}<option value={name}>{name}</option>{/each}</select></label>
        {#if notebook === 'Inbox'}<p>Inbox is the permanent default notebook.</p>{:else if notebook && notebooks.includes(notebook)}
          <label>Notebook name<input aria-label="Notebook name" bind:value={notebookName} maxlength="80"/></label>
          <div class="tools-actions"><button class="quiet-button" onclick={() => void run(async () => { await onnotebook(notebook, notebookName); notebook = notebookName.trim(); }, 'Notebook renamed.')}>Rename notebook</button><button class="quiet-button" onclick={() => deleting = 'notebook'}>Delete notebook</button></div>
          {#if deleting === 'notebook'}<div class="tools-confirm"><p>Move every note in “{notebook}” to Inbox and delete this notebook?</p><button class="quiet-button" onclick={() => void run(async () => { await onnotebook(notebook, null); notebook = ''; }, 'Notebook deleted. Notes moved to Inbox.')}>Confirm delete notebook</button><button onclick={() => deleting = ''}>Cancel</button></div>{/if}
        {/if}
      {:else if tab === 'Tags'}
        <p>Tags are created on notes. Renaming to an existing tag merges them. Removing a tag keeps every note.</p>
        <label>Manage tag<select aria-label="Manage tag" bind:value={tag} onchange={e => { tagName = e.currentTarget.value; deleting = ''; }}><option value="">Choose a tag…</option>{#each tags as name}<option value={name}>{name}</option>{/each}</select></label>
        {#if tag && tags.includes(tag)}
          <label>Tag name<input aria-label="Tag name" bind:value={tagName} maxlength="80"/></label>
          <div class="tools-actions"><button class="quiet-button" onclick={() => void run(async () => { await ontag(tag, tagName); tag = tagName.trim(); }, 'Tag renamed / merged.')}>Rename tag</button><button class="quiet-button" onclick={() => deleting = 'tag'}>Remove tag</button></div>
          {#if deleting === 'tag'}<div class="tools-confirm"><p>Remove “{tag}” from all notes, including Trash?</p><button class="quiet-button" onclick={() => void run(async () => { await ontag(tag, null); tag = ''; }, 'Tag removed. Notes kept.')}>Confirm remove tag</button><button onclick={() => deleting = ''}>Cancel</button></div>{/if}
        {/if}
      {:else}
        <p>Automatic snapshots run on opening and every 15 minutes while Phosphor is open and has changes. The latest 20 automatic snapshots are kept. Manual and recovery snapshots are retained.</p>
        <p>Snapshots live beside your database on this device. Export a copy elsewhere to protect against disk failure.</p>
        <div class="tools-actions"><button class="quiet-button" onclick={() => void run(onbackup, 'Snapshot created.')}>Create snapshot</button><button class="quiet-button" onclick={() => void run(onexport, 'Workspace exported.')}>Export all Markdown</button></div>
        <label>Restore an exported backup<input type="file" accept=".json,application/json" aria-label="Restore backup file" onchange={readFile}/><small>Select phosphor-backup.json from your extracted Markdown archive.</small></label>
        {#if fileBackup}<div class="tools-confirm"><h3>Restore backup file?</h3><p>{fileBackup.workspace.notes.length} notes and {fileBackup.workspace.notebooks.length} notebooks. This replaces the current workspace. A recovery snapshot will be saved first.</p><button class="quiet-button" onclick={() => void run(() => onrestorefile(fileBackup!), 'Backup file restored. A recovery snapshot contains your previous notes.')}>Confirm restore file</button><button onclick={() => fileBackup = undefined}>Cancel restore</button></div>{/if}
        {#if restore}<div class="tools-confirm"><h3>Restore snapshot?</h3><p>{new Date(restore.createdAt).toLocaleString()} · {restore.notes} notes. This replaces the current workspace. A recovery snapshot of your current notes will be saved first.</p><button class="quiet-button" onclick={() => void run(() => onrestore(restore!.id), 'Workspace restored. A recovery snapshot contains your previous notes.')}>Confirm restore</button><button onclick={() => restore = undefined}>Cancel restore</button></div>{/if}
        <ul class="backup-list" aria-label="Snapshots">{#each backups as b}<li><div><strong>{b.kind === 'auto' ? 'Automatic' : b.kind === 'recovery' ? 'Before restore' : 'Manual'} snapshot</strong><small>{new Date(b.createdAt).toLocaleString()} · {b.notes} notes</small></div><button class="quiet-button" aria-label={`Restore ${b.id}`} onclick={() => restore = b}>Restore</button></li>{:else}<li>No snapshots yet. Create your first snapshot above.</li>{/each}</ul>
      {/if}
    </fieldset>
    {#if busy}<p role="status">Working…</p>{/if}
  </div>
</div>
