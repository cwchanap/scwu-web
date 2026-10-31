<script lang="ts">
  import { ROSTER } from './fighters';
  import { BASICS, GUIDE_TEXT } from './guides';
</script>

<div class="guide-page">
  <h1>SCWU — How to Play</h1>
  <nav class="guide-nav" aria-label="Fighter guide index">
    <a href="#basics">Basics</a>
    {#each ROSTER as entry (entry.id)}
      <a href={'#' + entry.id}>{entry.name}</a>
    {/each}
  </nav>
  <main>
    <section id="basics">
      <h2>Basics</h2>
      {#each BASICS as paragraph (paragraph)}
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html paragraph}
      {/each}
    </section>
    {#each ROSTER as entry (entry.id)}
      <section id={entry.id}>
        <h2>{entry.name}</h2>
        <!-- eslint-disable-next-line svelte/no-at-html-tags -->
        {@html GUIDE_TEXT[entry.id]}
      </section>
    {/each}
  </main>
  <footer class="guide-footer">Original SCWU art · Web training rules</footer>
</div>
