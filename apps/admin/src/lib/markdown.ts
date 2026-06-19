import { marked } from 'marked';
import DOMPurify from 'dompurify';

// GFM markdown -> HTML. Used by the broadcast composer (live preview + emailed
// HTML) and the post/program body preview pane.
marked.use({ gfm: true, breaks: true });

export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked(md ?? '') as string);
}
