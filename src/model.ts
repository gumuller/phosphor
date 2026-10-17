export interface Note { id: string; title: string; body: string; notebook: string; tags: string; starred: boolean; trashed: boolean; createdAt: number; updatedAt: number }
export const notebooks = ['Inbox', 'Field notes', 'Projects', 'Personal'];
const searchCache = new WeakMap<Note, { title: string; body: string; tags: string; notebook: string; text: string }>();
function searchableText(note: Note) {
  const cached = searchCache.get(note);
  if (cached && cached.title === note.title && cached.body === note.body && cached.tags === note.tags && cached.notebook === note.notebook) return cached.text;
  const text = `${note.title}\n${note.body}\n${note.tags}\n${note.notebook}`.toLocaleLowerCase();
  searchCache.set(note, { title: note.title, body: note.body, tags: note.tags, notebook: note.notebook, text });
  return text;
}
export function filterNotes(notes: Note[], section: string, query: string) {
  const terms = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
  return notes.filter(n => {
    if (section === 'Trash' ? !n.trashed : n.trashed) return false;
    if (!['All notes', 'Trash'].includes(section) && !(section === 'Favorites' ? n.starred : section.startsWith('#') ? n.tags.split(',').some(t => t.trim() === section.slice(1)) : n.notebook === section)) return false;
    if (!terms.length) return true;
    const text = searchableText(n);
    return terms.every(term => text.includes(term));
  }).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function noteWindow(total: number, scrollTop: number, height: number, rowHeight = 184, overscan = 3) {
  const start = Math.min(Math.max(0, total - 1), Math.max(0, Math.floor(scrollTop / rowHeight) - overscan));
  const end = Math.min(total, start + Math.ceil(height / rowHeight) + overscan * 2);
  return { start, end, before: start * rowHeight, after: Math.max(0, (total - end) * rowHeight) };
}
export class SaveQueue {
  private pending = new Map<string, Note>();
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  constructor(private write: (note: Note) => Promise<unknown>, private status: (state: 'saving' | 'saved' | 'error', error?: unknown) => void, private delay = 200) {}
  enqueue(note: Note) {
    this.pending.set(note.id, { ...note });
    this.status('saving');
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { void this.flush().catch(() => {}); }, this.delay);
  }
  flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.drain().finally(() => { this.running = undefined; });
    return this.running;
  }
  private async drain() {
    try {
      while (this.pending.size) {
        const [id, note] = this.pending.entries().next().value!;
        this.pending.delete(id);
        try { await this.write(note); }
        catch (error) { if (!this.pending.has(id)) this.pending.set(id, note); throw error; }
      }
      this.status('saved');
    } catch (error) { this.status('error', error); throw error; }
  }
}
