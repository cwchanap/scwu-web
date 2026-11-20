<script lang="ts">
  import { onMount } from 'svelte';
  import { readMe } from './auth/api';
  import { ASSET_BASE } from './game/assetBase';
  import { buttonsOf, KEYS, usesButton } from './game/commands';
  import { DEFAULT_CHEATS, normalizeCheats } from './game/cheats';
  import type { CheatOptions } from './game/cheats';
  import type { Control, Mode, PracticeOptions } from './game/match';
  import type { Stage, Who } from './game/characters';
  import { DUMMY_BEHAVIORS } from './game/dummy';
  import type { GameStatus, createGame } from './game/scene';
  import Menu from './Menu.svelte';
  import {
    applyMe,
    identityRefresher,
    loadCheats,
    profileConfigured,
    resetModeOf,
    STAGE_LABELS,
    saveCheats,
    type MenuIdentity,
  } from './menu';

  let host: HTMLDivElement;
  let session: ReturnType<typeof createGame> | undefined;
  let practice = $state<PracticeOptions>({
    partner: 'stand',
    maxStock: false,
    lowHealth: false,
    enemyBars: false,
  });
  let cheats = $state<CheatOptions>({ ...DEFAULT_CHEATS });
  let fighter = $state<Who>('ryuko');
  let opponent = $state<Who>('zoma');
  let stage = $state<Stage>('court');
  let status = $state<GameStatus>({
    ready: false,
    paused: false,
    hp: [510, 490],
    life: [510, 490],
    seconds: Infinity,
    action: 'idle',
    winner: null,
    matchWinner: null,
    error: '',
    selecting: true,
    fighters: ['ryuko', 'zoma'],
    story: false,
    mode: 'practice',
    music: true,
    cheated: false,
  });
  let menuOpen = $state(false);
  // Which content the open dialog shows: the tabs, or the Summon grid its
  // Ctrl+Backquote shortcut opens (HPA-972).
  let menuView = $state<'match' | 'cheats' | 'summon'>('match');
  let identity = $state<MenuIdentity>({
    user: null,
    loaded: false,
    failed: false,
  });
  let mePending = $state(false);
  const profileRow = profileConfigured(import.meta.env.VITE_GOOGLE_CLIENT_ID);
  const refreshIdentity = profileRow
    ? identityRefresher(
        async () => {
          mePending = true;
          try {
            return await readMe();
          } finally {
            mePending = false;
          }
        },
        (result) => {
          identity = applyMe(identity, result);
        },
      )
    : null;
  // The dialog element lives in Menu.svelte now.
  const asset = ASSET_BASE;
  const touchControls: { control: Control; label: string; symbol: string }[] = [
    { control: 'left', label: 'Move left', symbol: '←' },
    { control: 'right', label: 'Move right', symbol: '→' },
    { control: 'jump', label: 'Jump', symbol: '↑' },
    { control: 'crouch', label: 'Crouch', symbol: '↓' },
    { control: 'punch', label: 'Punch', symbol: 'G' },
    { control: 'kick', label: 'Kick', symbol: 'H' },
    { control: 'dash', label: 'Dash', symbol: '⇧' },
    { control: 'throw', label: 'Throw', symbol: 'J' },
    { control: 'hitUp', label: 'Hit Up', symbol: 'K' },
    { control: 'iori', label: 'IORI', symbol: 'F' },
    { control: 'ex', label: 'EX mode', symbol: 'E' },
  ];
  // The others' moves take Ryuko's keys (commands.ts).
  const fighterLabels: Partial<Record<Who, Partial<Record<Control, string>>>> =
    {
      zoma: {
        iori: 'Dragon 2',
        ex: 'G Beam',
      },
      kiki: {
        iori: 'Tatumaki',
      },
      chung: {
        iori: 'Orochi',
      },
      amiro: {
        iori: 'Coment Chuck',
      },
      anmc: {
        iori: 'Twis Att',
      },
      giant: {
        iori: 'H Punch',
      },
      suneo: {
        iori: 'G Driver',
      },
      yo: {
        iori: 'Zombi Walk',
      },
      sin: {
        iori: 'Run Chuck',
      },
      lizard: {
        iori: 'Jump Att',
      },
      kay: {
        iori: 'Counter',
      },
      dido: {
        iori: 'RAiden',
      },
      sakuya: {
        iori: 'Iori',
      },
      alex: {
        iori: 'Reflect',
      },
      sou: {
        iori: 'Iori',
      },
      hiso: {
        iori: 'Bannaku',
      },
      erus: {
        iori: 'Coin',
      },
      feng: {
        iori: 'Iori',
      },
      sean: {
        iori: 'Whip K',
      },
      gon: {
        iori: 'Drill',
      },
      kate: {
        iori: 'Dash Att',
      },
      remu: {
        iori: 'Jet',
      },
      rear: {
        iori: 'Down Att',
      },
      gigi: {
        iori: 'Dive',
        ex: 'Change',
      },
      sww: {
        iori: 'Chain',
        ex: 'Chan',
      },
      ogi: {
        iori: 'Rose',
      },
      ziro: {
        iori: 'Telepot',
        ex: 'Type',
      },
      masa: {
        iori: '3 Hit',
      },
      times: {
        iori: 'Dash P',
      },
      zenka: {
        iori: 'New Move',
      },
      zmega: {
        iori: 'Giga',
        ex: 'Shin Z',
      },
      alpha: {
        iori: 'NC',
      },
      shinz: {
        iori: 'Giga',
        ex: 'Gaisa',
      },
      ttro: {
        iori: 'Dash K',
      },
      astroman: {
        iori: 'Ass Gun',
      },
      yinan: {
        iori: 'Doge',
        ex: 'Type',
      },
      aya: {
        iori: 'SHO',
        ex: 'TE K',
      },
      dora: {
        punch: 'HP',
        kick: 'LK',
        throw: 'Chuck',
        ex: 'EN',
        iori: 'Charge',
      },
      rario: {
        iori: 'Tatumaki',
      },
      training: {
        punch: 'Drain',
        kick: 'Refill',
        throw: 'Self KO',
      },
    };
  const labelOf = (control: Control, label: string) =>
    fighterLabels[fighter]?.[control] || label;
  // A move key the fighter has no command or button for has no button, nor
  // a button no command with an action takes.
  const moveKeys = new Set(
    Object.values(KEYS).flatMap((keys) => keys.map(([control]) => control)),
  );
  // A select screen's pad (authored, HPA-765): the directions and every
  // button the screens' input word reads — each chooses, in its own
  // palette (select.ts word/buttonIndex), so keeping G alone would cost
  // touch players H/K/J's alternate palettes in SINGLE, VS and TEAM VS.
  const SELECT_CONTROLS: ReadonlySet<Control> = new Set([
    'left',
    'right',
    'jump',
    'crouch',
    'punch',
    'kick',
    'hitUp',
    'throw',
  ]);
  const has = (control: Control) =>
    status.selecting
      ? SELECT_CONTROLS.has(control)
      : control in buttonsOf(fighter)
        ? usesButton(fighter, control)
        : !moveKeys.has(control) ||
          KEYS[fighter].some(([key]) => key === control);

  onMount(() => {
    // The Cheats menu's saved settings (HPA-767): read here — a failed
    // read opens the defaults — and handed to the scene as pending values
    // the moment it exists; the initial title is not a played match.
    const saved = loadCheats((key) => localStorage.getItem(key));
    cheats = saved;
    let disposed = false;
    import('./game/scene')
      .then(({ createGame }) => {
        if (!disposed) {
          session = createGame(host, (next) => {
            status = next;
            [fighter, opponent] = next.fighters;
          });
          session.scene.setCheats(saved);
        }
      })
      .catch((error: unknown) => {
        if (!disposed) status = { ...status, error: String(error) };
      });
    // The touch pad or a viewport change can resize the arena without a
    // window resize; keep the letterbox in step.
    const observer = new ResizeObserver(() => session?.game.scale.refresh());
    observer.observe(host);
    return () => {
      disposed = true;
      observer.disconnect();
      session?.game.destroy(true);
    };
  });

  // Every setter calls this; keep focus inside the open menu dialog.
  function focusArena() {
    if (menuOpen) return;
    (session?.game.canvas ?? host).focus({ preventScroll: true });
  }
  // Restart the match in the picked mode — 'practice' or 'cpu' is all
  // resetModeOf hands over (menu.ts).
  function reset(next: Mode) {
    session?.scene.reset(next);
    focusArena();
  }
  function openSelect() {
    session?.scene.openSelect();
    focusArena();
  }
  function setPractice(changes: Partial<PracticeOptions>) {
    practice = { ...practice, ...changes };
    session?.scene.setPractice(practice);
    focusArena();
  }
  // The Cheats menu's settings: normalized, kept in one saved object and
  // pushed to the scene as pending values, which the next battle takes.
  function setCheats(changes: Partial<CheatOptions>) {
    cheats = normalizeCheats({ ...cheats, ...changes });
    saveCheats((key, value) => localStorage.setItem(key, value), cheats);
    session?.scene.setCheats(cheats);
    focusArena();
  }
  // A clamped entry that lands on the value already held leaves the raw
  // out-of-range text in the field (Svelte sees no change to re-apply), so
  // each numeric field rewrites itself from the normalized value. A cleared
  // field (NaN) keeps the value it had instead of saving the default.
  // (The fields live in Menu.svelte now; the normalization is menu.ts's.)
  function setOpponentChoice(value: string) {
    const partner = DUMMY_BEHAVIORS.find((b) => b === value);
    if (partner) setPractice({ partner });
    const to = resetModeOf(value, status.mode);
    if (to) reset(to);
  }
  function setFighter(who: Who) {
    fighter = who;
    session?.scene.setFighter(who);
    focusArena();
  }
  function setOpponent(who: Who) {
    opponent = who;
    session?.scene.setOpponent(who);
    focusArena();
  }
  function setStage(next: Stage) {
    stage = next;
    session?.scene.setStage(next);
    focusArena();
  }
  function pause() {
    session?.scene.togglePause();
    focusArena();
  }
  function openMenu() {
    // The scene holds the modal's freeze, so a reset's unpause can't slip a
    // tick through and a select screen after a match freezes too.
    menuView = 'match';
    session?.scene.setModal(true);
    menuOpen = true;
    void refreshIdentity?.();
  }
  // Ctrl+Backquote in an active, ready, unfinished, non-selecting match
  // opens the Summon view — only with the Menu's master cheat switch on.
  // The same dialog, no scene→App callback.
  const summonOpenable = $derived(
    cheats.enabled && status.ready && !status.winner && !status.selecting,
  );
  function openSummon() {
    menuView = 'summon';
    session?.scene.setModal(true);
    menuOpen = true;
  }
  function summonInto(who: Who, side: -1 | 1): Promise<void> {
    return (
      session?.scene.summon(who, side) ??
      Promise.reject(new Error('The arena is not running.'))
    );
  }
  // close fires on every path (Close button, Character select, native Esc).
  function menuClosed() {
    menuOpen = false;
    session?.scene.setModal(false);
    focusArena();
  }
  const sayWinner = (winner: GameStatus['winner']) =>
    winner === 'draw'
      ? 'Draw.'
      : winner === 'player'
        ? 'Player 1 wins.'
        : 'Player 2 wins.';
  function press(event: PointerEvent, control: Control) {
    if (!status.ready || status.paused || (status.winner && !status.selecting))
      return;
    event.preventDefault();
    (event.currentTarget as HTMLButtonElement).setPointerCapture(
      event.pointerId,
    );
    session?.scene.control(control, true);
  }
</script>

<svelte:head><title>SCWU — Training</title></svelte:head>
<svelte:window
  onkeydown={(event) => {
    if (event.ctrlKey && event.code === 'Backquote' && summonOpenable) {
      event.preventDefault();
      openSummon();
    }
  }}
/>

<main class="app-shell" id="main">
  <section class="cabinet" aria-label="SCWU training match">
    <div class="stage-shell">
      <div class="stage-body">
        <div
          class="arena"
          bind:this={host}
          tabindex="-1"
          role="application"
          aria-roledescription="fighting game"
          aria-label="Training arena. A and D to move, W to jump or double jump, S to crouch, hold back to guard, G to punch, H to kick, K for Hit Up then W to chase on hit, F for IORI, tap again for each follow-up, Shift to dash, double-tap left or right to dash on the ground or in the air, J to grab and throw, E to switch EX mode, motion commands for specials and supers. P to pause."
        ></div>
        <div class="sr-only" aria-label="Match health">
          <div
            role="meter"
            aria-label="Player health"
            aria-valuemin="0"
            aria-valuemax={status.life[0]}
            aria-valuenow={status.hp[0]}
          >
            {status.hp[0]}
          </div>
          <div
            role="meter"
            aria-label="Opponent health"
            aria-valuemin="0"
            aria-valuemax={status.life[1]}
            aria-valuenow={status.hp[1]}
          >
            {status.hp[1]}
          </div>
          <span
            >Time: {Number.isFinite(status.seconds)
              ? status.seconds
              : 'Unlimited'}</span
          >
          <span>Action: {status.action}</span>
        </div>
        {#if status.error}
          <div class="stage-overlay">
            <h2>Couldn’t enter the arena.</h2>
            <p>{status.error}</p>
            <button
              class="primary-button"
              onclick={() => window.location.reload()}>Try again</button
            >
          </div>
        {:else if !status.ready}
          <div class="stage-overlay">
            <h2>Loading SCWU…</h2>
            <p>Opening {STAGE_LABELS[stage]}.</p>
          </div>
        {:else if status.paused && !menuOpen}
          <!-- status.paused includes the modal's freeze; the open dialog
               covers the overlay's unclickable Resume button. -->
          <div class="pause-overlay" aria-live="polite">
            <img src={`${asset}ui/146.png`} alt="Pause" />
            <button class="primary-button" onclick={pause}>Resume match</button>
          </div>
        {/if}
        <div class="sr-only" aria-live="polite">
          {#if status.winner}{status.seconds === 0 ? 'Time up.' : 'KO.'}
            {sayWinner(status.winner)}
            {#if status.matchWinner}Match over: {sayWinner(
                status.matchWinner,
              )}{/if}{/if}
        </div>
        <button
          class="absolute top-2 right-2 z-10 flex items-center gap-1.5 border border-[#8a6a2f] bg-[#141a20e6] px-3 py-2 font-bold italic text-[#ffd24a] hover:bg-[#241a0c] disabled:opacity-40"
          aria-haspopup="dialog"
          disabled={!status.ready}
          onclick={openMenu}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
            ><circle cx="12" cy="12" r="3" /><path
              d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
            /></svg
          >
          Menu
        </button>
      </div>
    </div>
  </section>
  <div class="touch-controls" aria-label="Touch controls">
    {#each touchControls.filter( (item) => has(item.control) ) as item (item.control)}
      <button
        class:attack-control={[
          'punch',
          'kick',
          'throw',
          'hitUp',
          'iori',
          'ex',
        ].includes(item.control)}
        aria-label={labelOf(item.control, item.label)}
        disabled={!status.ready ||
          status.paused ||
          (!!status.winner && !status.selecting)}
        onpointerdown={(event) => press(event, item.control)}
        onpointerup={() => session?.scene.control(item.control, false)}
        onpointercancel={() => session?.scene.control(item.control, false)}
        onlostpointercapture={() => session?.scene.control(item.control, false)}
        onkeydown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            session?.scene.control(item.control, true);
          }
        }}
        onkeyup={() => session?.scene.control(item.control, false)}
        onblur={() => session?.scene.control(item.control, false)}
        ><strong>{item.symbol}</strong><span
          >{labelOf(item.control, item.label).replace('Move ', '')}</span
        ></button
      >
    {/each}
  </div>

  <Menu
    open={menuOpen}
    view={menuView}
    {status}
    {practice}
    {cheats}
    {fighter}
    {opponent}
    {stage}
    {identity}
    {mePending}
    {profileRow}
    onclose={menuClosed}
    onopponentchoice={setOpponentChoice}
    onpractice={setPractice}
    oncheats={setCheats}
    onfighter={setFighter}
    onopponent={setOpponent}
    onstage={setStage}
    onmusic={(on) => {
      session?.scene.setMusic(on);
      focusArena();
    }}
    onselect={openSelect}
    onsummon={summonInto}
  />
</main>
