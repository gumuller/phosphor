import { vi } from 'vitest';
class ResizeObserverStub { observe() {} unobserve() {} disconnect() {} }
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
Range.prototype.getBoundingClientRect = () => new DOMRect();
HTMLElement.prototype.scrollIntoView = () => {};

// jsdom has no raster backend; native/browser rendering is reviewed separately.
HTMLCanvasElement.prototype.getContext = (() => null) as typeof HTMLCanvasElement.prototype.getContext;

// ProseMirror's paste helpers construct ClipboardEvent; jsdom omits it.
if (typeof ClipboardEvent === 'undefined') {
  vi.stubGlobal('ClipboardEvent', class extends Event {
    clipboardData: DataTransfer | null;
    constructor(type: string, init: ClipboardEventInit = {}) { super(type, init); this.clipboardData = init.clipboardData ?? null; }
  });
}
