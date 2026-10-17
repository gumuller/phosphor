<script lang="ts">
  import { highlightParts } from './workspace';
  let { text, query = '' }: { text: string; query?: string } = $props();
</script>
{#each highlightParts(text, query) as part}{#if part.match}<mark>{part.text}</mark>{:else}{part.text}{/if}{/each}
