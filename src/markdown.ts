import { Marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import DOMPurify from 'dompurify';
import hljs from 'highlight.js/lib/core';
import rust from 'highlight.js/lib/languages/rust';
import javascript from 'highlight.js/lib/languages/javascript';
import bash from 'highlight.js/lib/languages/bash';
hljs.registerLanguage('rust', rust);
hljs.registerLanguage('javascript', javascript);
hljs.registerLanguage('bash', bash);
const parser = new Marked(markedHighlight({ langPrefix: 'hljs language-', highlight(code, lang) { return hljs.getLanguage(lang) ? hljs.highlight(code, { language: lang }).value : code.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'); } }));
export function renderMarkdown(body: string) { return DOMPurify.sanitize(parser.parse(body, { async: false }) as string, { FORBID_TAGS: ['img', 'iframe', 'style'], FORBID_ATTR: ['style'] }); }
