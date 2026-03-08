<script lang="ts">
  import ContextPane from '../Context/ContextPane.svelte';
</script>

<div class="context-tab">
  <ContextPane onExit={() => {}} />
</div>

<style>
  .context-tab {
    height: 100%;
    overflow: hidden;
    min-width: 22em;
  }
</style>
