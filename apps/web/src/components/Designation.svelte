<script lang="ts">
  // A star designation inside an upper-case label: the Greek letters keep their lower case
  // ("α ORI", not "Α ORI", where the capital alpha reads as a Latin A).
  import { greekRuns } from "../lib/format";
  let { text }: { text: string } = $props();
  const runs = $derived(greekRuns(text));
</script>

{#each runs as run, i (i)}{#if run.greek}<span class="greek">{run.text}</span
    >{:else}{run.text}{/if}{/each}

<style>
  .greek {
    text-transform: none;
  }
</style>
