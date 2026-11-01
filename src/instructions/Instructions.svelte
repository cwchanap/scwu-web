<script lang="ts">
  import { ASSET_BASE } from '../game/assetBase';
  import type { Who } from '../game/characters';
  import { ROSTER } from './fighters';
  import { GRID, GUIDES_DATA, SHARED, STOCKS, XS, YS } from './moves';

  const byId = new Map(ROSTER.map((entry) => [entry.id, entry]));
  const nameOf = (id: Who) => byId.get(id)?.name ?? id;

  // CSS url()s cannot read ASSET_BASE, so the stylesheet takes them as properties.
  const root = document.documentElement.style;
  root.setProperty('--select-bg', `url(${ASSET_BASE}select/15.png)`);
  root.setProperty('--face-sheet', `url(${ASSET_BASE}select/13.png)`);
  root.setProperty('--gauge-art', `url(${ASSET_BASE}ui/27.png)`);

  // Roster: the select grid's own faces, positioned on its sheet.
  const faces = GRID.flatMap((id, i) => {
    const entry = id && byId.get(id);
    if (!entry) return [];
    return [
      {
        id: entry.id,
        name: entry.name,
        x: XS[i % 8],
        y: YS[Math.floor(i / 8)] + (i % 2 ? 7 : 0),
      },
    ];
  });

  // Hash routing: #<id> picks the fighter; only that page renders.
  let picked = $state(location.hash.slice(1));
  const guideIds = new Set(Object.keys(GUIDES_DATA));
  const current = $derived(guideIds.has(picked) ? (picked as Who) : 'ryuko');
  const guide = $derived(GUIDES_DATA[current]);
  $effect(() => {
    const onHash = () => {
      picked = location.hash.slice(1);
      // On narrow screens the pick leaves the folded roster open over the page.
      if (!wide.matches) open = false;
      scrollTo(0, 0);
    };
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  });

  // Hover name under the grid; back to the current fighter on leave.
  let hovered = $state<string | null>(null);
  const pick = $derived(hovered ?? nameOf(current));
  const show = (e: Event) => {
    const a = e.type === 'focusout' ? null : (e.target as Element).closest('a');
    hovered = a ? a.getAttribute('aria-label') : null;
  };

  // Folded on narrow screens, open beside the content on wide ones.
  const wide = matchMedia('(min-width: 900px)');
  let open = $state(wide.matches);
  $effect(() => {
    const widen = () => {
      if (wide.matches) open = true;
    };
    wide.addEventListener('change', widen);
    return () => wide.removeEventListener('change', widen);
  });

  // Stocks on the fighter's power gauge (moves.ts STOCKS; three for most).
  const cap = $derived(STOCKS[current] ?? 3);
  const slots = $derived([...Array(cap).keys()]);
  const pipText = (cost: number) =>
    cost === 0.5 ? '½ stock' : `${cost} stock${cost > 1 ? 's' : ''}`;
  const pipLabel = (cost: number) =>
    cost === 0.5 ? 'Half a stock' : `${cost} of ${cap} stocks`;
  const halfStock = (cost: number) => cost !== Math.floor(cost);
  // At 18 px a pip, six fill the cost column.
  const pipWidth = $derived(
    Math.min(18, Math.floor((104 - 3 * (cap - 1)) / cap)),
  );

  // The guide opens in a new tab, so Back closes it when the browser allows;
  // a tab it can't close (typed-in, or history grown past hash picks) goes to
  // the game itself.
  const back = (event: MouseEvent) => {
    event.preventDefault();
    window.close();
    setTimeout(() => {
      location.href = import.meta.env.BASE_URL;
    }, 150);
  };
</script>

<div class="topbar">
  <a class="back" href={import.meta.env.BASE_URL} onclick={back}
    >◂ Back to game</a
  >
</div>

<div class="shell">
  <details class="roster" bind:open>
    <summary>Fighter: {nameOf(current)}</summary>
    <img
      class="title"
      src="{ASSET_BASE}select/2.png"
      alt="Cosplayer select"
      width="256"
      height="37"
    />
    <nav
      class="faces"
      aria-label="Fighters"
      onpointerover={show}
      onfocusin={show}
      onpointerleave={show}
      onfocusout={show}
    >
      <div class="faces-scale">
        {#each faces as face (face.id)}
          <a
            href={'#' + face.id}
            aria-label={face.name}
            aria-current={face.id === current ? 'page' : null}
            style="--x: {face.x}; --y: {face.y}"
          ></a>
        {/each}
      </div>
    </nav>
    <p class="pick" aria-hidden="true">{pick}</p>
  </details>

  <main>
    <header class="hero">
      <img class="hero-art" src={ASSET_BASE + guide.art} alt="" />
      <div class="hero-body">
        <div class="name-row">
          <h1>
            {#if guide.nameplate}
              <img
                src={ASSET_BASE + guide.nameplate}
                width="85"
                height="26"
                alt={nameOf(current)}
              />
            {:else}
              <span class="name-text">{nameOf(current)}</span>
            {/if}
          </h1>
          {#if guide.ex}<span class="ex-mode">EX Mode</span>{/if}
        </div>
        <div>
          <p class="role">{guide.role}</p>
          <p class="tag">{guide.tag}</p>
        </div>
      </div>
    </header>

    <p class="motion-note">
      Motions are read toward the opponent; hold the last direction a moment
      before the button.
    </p>

    {#each [...SHARED, ...guide.sections] as section (section.title)}
      <section>
        <h2>
          <span>{section.title}</span>
          {#if section.note && !section.cost}<small>{section.note}</small>{/if}
        </h2>
        <div class="panel">
          <table class="moves">
            <thead class="sr-only">
              <tr>
                <th>Move</th>
                <th>Input</th>
                {#if section.cost}<th>Cost</th>{/if}
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              {#each section.rows as row (row.name)}
                <tr>
                  <td class="name">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html row.name}
                  </td>
                  <td class="input">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html row.input}
                  </td>
                  {#if section.cost}
                    <td class="cost">
                      {#if row.cost > 0}
                        <div
                          class="pips"
                          role="img"
                          aria-label={pipLabel(row.cost)}
                          style="--pw: {pipWidth}px"
                        >
                          {#each slots as i (i)}
                            <i
                              class:on={i < Math.floor(row.cost)}
                              class:half={halfStock(row.cost) &&
                                i === Math.floor(row.cost)}
                            ></i>
                          {/each}
                        </div>
                        <span>{pipText(row.cost)}</span>
                      {/if}
                    </td>
                  {/if}
                  <td class="desc">
                    <!-- eslint-disable-next-line svelte/no-at-html-tags -->
                    {@html row.desc}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
        {#if section.cost && section.note}
          <aside class="gauge-note">
            <div
              class="gauge"
              role="img"
              aria-label="Power gauge: {cap} stock{cap > 1 ? 's' : ''}"
            >
              {#each slots.slice(1) as i (i)}
                <i style="left: {(i / cap) * 100}%"></i>
              {/each}
            </div>
            <p>{section.note}</p>
          </aside>
        {/if}
      </section>
    {/each}

    <p class="footnote">Original SCWU art · Web training rules</p>
  </main>
</div>

<style>
  /* The two families' latin subsets, self-hosted in public/fonts/. */
  @font-face {
    font-family: 'Barlow Semi Condensed';
    font-style: normal;
    font-weight: 500;
    font-display: swap;
    src: url('/fonts/barlow-semi-condensed-500.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Barlow Semi Condensed';
    font-style: normal;
    font-weight: 600;
    font-display: swap;
    src: url('/fonts/barlow-semi-condensed-600.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Barlow Semi Condensed';
    font-style: normal;
    font-weight: 700;
    font-display: swap;
    src: url('/fonts/barlow-semi-condensed-700.woff2') format('woff2');
  }
  @font-face {
    font-family: 'Exo 2';
    font-style: italic;
    font-weight: 900;
    font-display: swap;
    src: url('/fonts/exo-2-italic-900.woff2') format('woff2');
  }
  /* Colours are sampled from the game: the select screen's cyan backdrop
     and select blue, the power gauge's gold-to-red ramp, the 1P block's
     ink, and the brushed-steel panel. */
  :global(:root) {
    --cyan: #00a8ee;
    --cyan-hi: #6fe3ff;
    --navy: #071733;
    --navy-2: #0d2750;
    --edge: #1f4f96;
    --ink: #02020a;
    --gold: #ffcb00;
    --ember: #f46315;
    --red: #ee2421;
    --steel: #8aa2c0;
    --text: #eef4fb;
    --muted: #b4c5da;
    --display: 'Exo 2', 'Arial Black', Arial, sans-serif;
    --body: 'Barlow Semi Condensed', 'Arial Narrow', Arial, sans-serif;
    /* Face-tile scale: the source sheet is 206 x 417. */
    --s: 1.25;
  }
  @media (min-height: 860px) {
    :global(:root) {
      --s: 1.5;
    }
  }
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    color: var(--text);
    font: 500 15px/1.5 var(--body);
    background: var(--cyan) var(--select-bg) center top / cover fixed no-repeat;
    image-rendering: pixelated;
  }
  /* Darken the corners so the panels sit in the frame, like the game's vignette. */
  :global(body)::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: -1;
    background: radial-gradient(
      ellipse at 62% 18%,
      transparent 35%,
      #021a3acc 100%
    );
  }
  img {
    image-rendering: pixelated;
  }
  h1,
  h2,
  p {
    margin: 0;
  }
  a:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 2px;
    box-shadow: 0 0 0 6px var(--ink);
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    margin: -1px;
    padding: 0;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
    border: 0;
  }

  .topbar {
    max-width: 1240px;
    margin: 0 auto;
    padding: 16px 20px 0;
  }
  .back {
    display: inline-block;
    padding: 7px 22px 7px 16px;
    font: 700 14px/1 var(--body);
    color: var(--text);
    text-decoration: none;
    background: var(--ink);
    clip-path: polygon(0 0, 100% 0, calc(100% - 10px) 100%, 0 100%);
  }
  .back:hover {
    color: var(--gold);
  }

  .shell {
    display: grid;
    grid-template-columns: calc(206px * var(--s) + 32px) minmax(0, 1fr);
    gap: 32px;
    max-width: 1240px;
    margin: 0 auto;
    padding: 14px 20px 64px;
    align-items: start;
  }

  /* ---- Roster: the select screen's own face grid ---- */
  .roster {
    position: sticky;
    top: 12px;
    padding: 16px 16px 14px;
    background: var(--ink);
    clip-path: polygon(0 16px, 16px 0, 100% 0, 100% 100%, 0 100%);
    border-top: 5px solid var(--gold);
  }
  .roster summary {
    list-style: none;
    cursor: pointer;
  }
  .roster summary::-webkit-details-marker {
    display: none;
  }
  @media (min-width: 900px) {
    .roster {
      /* Sticky and taller than the window: let it scroll so the bottom
         row stays reachable. */
      max-height: calc(100vh - 24px);
      overflow-y: auto;
    }
    .roster summary {
      display: none;
    }
  }
  .roster .title {
    display: block;
    width: 256px;
    max-width: 100%;
    margin: 0 auto 12px;
  }
  .faces {
    position: relative;
    width: calc(206px * var(--s));
    height: calc(417px * var(--s));
    margin: 0 auto;
  }
  /* The grid renders at 1:1 integer sheet coordinates; the scale transform
     magnifies it as a whole, so no tile ever samples the sheet at a
     fractional texel. */
  .faces-scale {
    position: absolute;
    top: 0;
    left: 0;
    width: 206px;
    height: 417px;
    transform: scale(var(--s));
    transform-origin: top left;
    isolation: isolate;
  }
  .faces a {
    position: absolute;
    left: calc(var(--x) * 1px);
    top: calc(var(--y) * 1px);
    width: 24px;
    height: 60px;
    background: var(--face-sheet) calc(var(--x) * -1px) calc(var(--y) * -1px) /
      206px 417px no-repeat;
    image-rendering: pixelated;
    filter: brightness(0.74) saturate(0.85);
    transition:
      filter 0.12s,
      transform 0.12s;
  }
  .faces a:hover,
  .faces a:focus-visible {
    filter: none;
    transform: translateY(-3px);
  }
  /* The current fighter: a gold silhouette of the tile glows behind it. The
     hover lift's transform makes the tile a stacking context, where a
     z-index: -1 child would paint over its own background — so the face
     moves to an ::after above the ::before glow. */
  .faces a[aria-current] {
    filter: none;
    background: none;
  }
  .faces a[aria-current]::after {
    content: '';
    position: absolute;
    inset: 0;
    background: var(--face-sheet) calc(var(--x) * -1px) calc(var(--y) * -1px) /
      206px 417px no-repeat;
  }
  .faces a[aria-current]::before {
    content: '';
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(var(--gold), var(--ember));
    transform: scale(1.42);
    -webkit-mask: var(--face-sheet) calc(var(--x) * -1px)
      calc(var(--y) * -1px) / 206px 417px no-repeat;
    mask: var(--face-sheet) calc(var(--x) * -1px) calc(var(--y) * -1px) / 206px
      417px no-repeat;
    animation: cursor 1s steps(2) infinite;
  }
  @keyframes cursor {
    50% {
      opacity: 0.4;
    }
  }
  .pick {
    margin-top: 12px;
    font: italic 900 20px/1 var(--display);
    text-align: center;
    color: #fff;
    min-height: 20px;
  }

  /* ---- Hero ---- */
  .hero {
    position: relative;
    display: grid;
    grid-template-columns: 195px minmax(0, 1fr);
    gap: 0 32px;
    align-items: end;
    min-height: 447px;
    padding: 0 36px 0 24px;
  }
  /* The steel slab sits low so the portrait breaks out of its top edge. */
  .hero::before {
    content: '';
    position: absolute;
    inset: auto 0 0 0;
    height: 196px;
    background:
      repeating-linear-gradient(90deg, #ffffff14 0 1px, transparent 1px 3px),
      linear-gradient(165deg, #c4d3e6 0%, #94abc8 52%, #7088ab 100%);
    clip-path: polygon(
      26px 0,
      100% 0,
      100% 38%,
      calc(100% - 30px) 50%,
      100% 62%,
      100% 100%,
      0 100%,
      0 26px
    );
  }
  /* Rivets, as on the game's own panel. */
  .hero::after {
    content: '';
    position: absolute;
    right: 40px;
    bottom: 156px;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 35%, #ffc15a, #e0700a);
    box-shadow:
      -15px 5px 0 #e0700a,
      -4px 17px 0 #e0700a;
  }
  .hero-art {
    position: relative;
    display: block;
    width: auto;
    height: auto;
    max-width: 100%;
    max-height: 447px;
    animation: step-in 0.5s cubic-bezier(0.2, 0.9, 0.3, 1) both;
  }
  @keyframes step-in {
    from {
      opacity: 0;
      transform: translateX(-28px);
    }
  }
  .hero-body {
    position: relative;
    align-self: stretch;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 18px 0 26px;
  }
  .name-row {
    display: flex;
    align-items: center;
    gap: 18px;
    flex-wrap: wrap;
  }
  /* The heading is a flex item; without min-width: 0 its automatic
     minimum keeps the banner's full scaled width and defeats the img clamp. */
  .name-row h1 {
    min-width: 0;
    max-width: 100%;
  }
  .name-row img {
    height: 78px;
    width: auto;
    max-width: 100%;
    object-fit: contain;
    filter: drop-shadow(0 4px 0 #02020a88);
  }
  /* No nameplate art: the display name drawn in its place. */
  .name-text {
    font: italic 900 44px/1.1 var(--display);
    color: var(--ink);
  }
  .ex-mode {
    padding: 5px 16px 5px 14px;
    font: italic 900 15px/1 var(--display);
    color: var(--gold);
    background: linear-gradient(#c01818, #7a0000);
    clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%);
  }
  .role {
    font: italic 900 28px/1.1 var(--display);
    color: var(--ink);
  }
  .motion-note {
    margin-top: 10px;
    font-size: 13px;
    color: var(--muted);
  }
  .tag {
    margin-top: 8px;
    max-width: 50ch;
    font-size: 19px;
    line-height: 1.4;
    font-weight: 600;
    color: #061530;
  }

  /* ---- Sections ---- */
  section {
    margin-top: 34px;
  }
  h2 {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 12px;
    font: italic 900 30px/1 var(--display);
  }
  /* Gold chrome with a dark outline, the way the title logo is drawn. */
  h2 span {
    color: transparent;
    background: linear-gradient(
      #fff4b8 0%,
      #ffe14d 40%,
      #ffcb00 52%,
      #f46315 100%
    );
    -webkit-background-clip: text;
    background-clip: text;
    padding: 2px 3px 4px;
    filter: drop-shadow(2px 0 0 #2a0e05) drop-shadow(-2px 0 0 #2a0e05)
      drop-shadow(0 2px 0 #2a0e05) drop-shadow(0 -2px 0 #2a0e05)
      drop-shadow(0 4px 0 #0008);
  }
  /* The orange-and-black stripe from the select grid's column gutters. */
  h2::after {
    content: '';
    flex: 1;
    height: 9px;
    background: repeating-linear-gradient(
      -55deg,
      var(--gold) 0 7px,
      var(--ink) 7px 14px
    );
    clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%);
  }
  h2 small {
    order: 1;
    padding: 4px 10px;
    font: 600 14px/1 var(--body);
    color: var(--muted);
    background: var(--ink);
  }

  .panel {
    clip-path: polygon(
      0 0,
      calc(100% - 18px) 0,
      100% 18px,
      100% 100%,
      18px 100%,
      0 calc(100% - 18px)
    );
  }
  .moves {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0 3px;
  }
  .moves td {
    padding: 12px 16px;
    vertical-align: top;
    background: #071733f2;
    border-block: 1px solid var(--edge);
  }
  .moves tr:nth-child(even) td {
    background: #0d2750f2;
  }
  .moves td:first-child {
    border-left: 5px solid var(--steel);
    padding-left: 14px;
  }
  .moves tr:hover td:first-child {
    border-left-color: var(--gold);
  }
  .name {
    width: 190px;
    font-size: 16px;
    font-weight: 700;
    color: #fff;
  }
  .moves .name :global(em) {
    font-style: normal;
    font-weight: 600;
    color: var(--cyan-hi);
  }
  .input {
    width: 205px;
    white-space: nowrap;
  }
  .desc {
    font-size: 15px;
    line-height: 1.45;
    color: #d7e3f1;
  }
  .moves .desc :global(b) {
    color: var(--gold);
  }

  /* kbd, motions and separators ride in through {@html}, so they anchor
     inside the table instead of Svelte's scope class. */
  .moves :global(kbd) {
    display: inline-grid;
    place-items: center;
    min-width: 27px;
    height: 27px;
    padding: 0 7px;
    margin: 1px 2px 3px 0;
    font: 700 14px/1 var(--body);
    color: var(--ink);
    background: linear-gradient(#f7faff, #c5d5e8);
    border-radius: 5px;
    box-shadow:
      0 2px 0 #4f6a90,
      0 3px 0 #02020a99;
  }
  .moves :global(.motion) {
    font: 700 18px/1 var(--body);
    letter-spacing: 2px;
    color: var(--gold);
  }
  .moves :global(.sep) {
    padding: 0 3px;
    color: var(--muted);
    font-weight: 600;
  }

  /* Cost: stocks on the power gauge, three to a bar. */
  .cost {
    width: 112px;
  }
  .pips {
    display: flex;
    gap: 3px;
    margin-bottom: 3px;
  }
  .pips i {
    width: var(--pw, 18px);
    height: 14px;
    background: #2a4d85;
    clip-path: polygon(24% 0, 100% 0, 76% 100%, 0 100%);
  }
  .pips .on {
    background: linear-gradient(#ffe36a, var(--gold) 50%, var(--ember));
  }
  .pips .half {
    background: linear-gradient(90deg, #ffcb00 0 50%, #2a4d85 50% 100%);
  }
  .cost span {
    font-size: 13px;
    font-weight: 600;
    color: var(--muted);
  }

  /* ---- Power gauge note ---- */
  .gauge-note {
    margin-top: 12px;
    padding: 14px 18px 16px;
    background: #071733f2;
    border-left: 5px solid var(--steel);
  }
  .gauge {
    position: relative;
    height: 21px;
    margin-bottom: 12px;
    background: var(--gauge-art) 0 0 / 100% 100% no-repeat;
    image-rendering: pixelated;
    clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
  }
  .gauge i {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 4px;
    margin-left: -2px;
    background: var(--ink);
  }
  .gauge-note p {
    max-width: 70ch;
    color: #d7e3f1;
  }

  .footnote {
    display: inline-block;
    margin-top: 30px;
    padding: 5px 12px;
    font-size: 12px;
    color: var(--muted);
    background: #02020acc;
  }

  /* ---- Narrow screens: the roster folds away, rows stack ---- */
  /* not (min-width) so a fractional width like 899.5px can't fall between. */
  @media not all and (min-width: 900px) {
    .shell {
      grid-template-columns: minmax(0, 1fr);
      gap: 20px;
    }
    .roster {
      position: static;
    }
    .roster summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      font: italic 900 18px/1 var(--display);
      color: var(--gold);
      padding-bottom: 4px;
    }
    .roster summary::after {
      content: '▾';
    }
    .roster[open] summary::after {
      content: '▴';
    }
    .roster .title {
      display: none;
    }
    :global(:root) {
      --s: 1.2;
    }
  }
  @media (max-width: 700px) {
    .hero {
      grid-template-columns: 1fr;
      min-height: 0;
      padding: 0 18px;
    }
    .hero::before {
      height: calc(100% - 150px);
    }
    .hero::after {
      display: none;
    }
    .hero-art {
      margin: 0 auto -8px;
    }
    .hero-body {
      padding-top: 10px;
    }
    .moves,
    .moves tbody,
    .moves tr,
    .moves td {
      display: block;
      width: 100%;
    }
    .moves tr {
      margin-bottom: 3px;
    }
    .moves td {
      border-block: 0;
      padding: 4px 14px;
    }
    .moves td:first-child {
      padding-top: 12px;
    }
    .moves tr td:last-child {
      padding-bottom: 12px;
    }
    .name,
    .input,
    .cost {
      width: auto;
    }
    .input {
      white-space: normal;
    }
    h2 {
      font-size: 24px;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .hero-art,
    .faces a[aria-current]::before {
      animation: none;
    }
    .faces a {
      transition: none;
    }
  }
</style>
