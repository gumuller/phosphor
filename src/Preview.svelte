<script lang="ts">
  import { renderMarkdown } from './markdown';
  let { body, openLink }: { body: string; openLink: (event: MouseEvent) => void } = $props();
  const html = $derived(renderMarkdown(body));
  function links(node: HTMLElement) {
    node.addEventListener('click', openLink);
    return { destroy() { node.removeEventListener('click', openLink); } };
  }
</script>
<article class="markdown" use:links>{@html html}</article>
