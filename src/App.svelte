<script lang="ts">
  import { onMount } from 'svelte';
  import { ASSET_BASE } from './game/assetBase';
  import { buttonsOf, KEYS, usesButton } from './game/commands';
  import type { Control, Mode, PracticeOptions } from './game/match';
  import type { Stage, Who } from './game/characters';
  import { DUMMY_BEHAVIORS } from './game/dummy';
  import type { DummyBehavior } from './game/dummy';
  import type { GameStatus, createGame } from './game/scene';
  import { ROSTER } from './instructions/fighters';

  let host: HTMLDivElement;
  let session: ReturnType<typeof createGame> | undefined;
  let mode = $state<Mode>('practice');
  let practice = $state<PracticeOptions>({
    partner: 'stand',
    maxStock: false,
    lowHealth: false,
  });
  let fighter = $state<Who>('ryuko');
  let opponent = $state<Who>('zoma');
  let stage = $state<Stage>('court');
  const stageLabels: Record<Stage, string> = {
    court: 'Sport Court',
    train: 'Train Morning',
    sakuranight: 'Sakura Night',
    trainnight: 'Train Night',
    dojin: 'Dojin BKG',
    japan: 'Japan Street',
    park: 'Park Morning',
    parknight: 'Park Night',
    sakura: 'Sakura Street',
    greek: 'Greek',
    space: 'Space',
    boss: 'Boss Base',
    office: 'ZM Office',
    office2: 'ZM Office T2',
    brboss: 'BR Boss Base',
    gi: 'GI Stage',
    spacenight: 'Space Night',
    streetnight: 'Street Night',
  };
  const partnerLabels: Record<DummyBehavior, string> = {
    stand: 'Stand',
    guard: 'Guard',
    crouchGuard: 'Crouch guard',
    airGuard: 'Air guard',
    attack: 'Attack',
    jumpIn: 'Jump in',
    cpu: 'Original CPU',
  };
  let status = $state<GameStatus>({
    ready: false,
    paused: false,
    hp: [510, 490],
    life: [510, 490],
    seconds: Infinity,
    hits: 0,
    damage: 0,
    action: 'idle',
    winner: null,
    matchWinner: null,
    resultReady: false,
    error: '',
    selecting: true,
    fighters: ['ryuko', 'zoma'],
    story: false,
    mode: 'practice',
  });
  let settingsOpen = $state(false);
  let dialog: HTMLDialogElement;
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
      zaku: {},
      pachelo: {},
      golf: {},
      asura: {},
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
        punch: 'Punch',
        kick: 'Kick',
        hitUp: 'Hit Up',
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
  const has = (control: Control) =>
    control in buttonsOf(fighter)
      ? usesButton(fighter, control)
      : !moveKeys.has(control) ||
        KEYS[fighter].some(([key]) => key === control);

  onMount(() => {
    let disposed = false;
    import('./game/scene')
      .then(({ createGame }) => {
        if (!disposed)
          session = createGame(host, (next) => {
            status = next;
            [fighter, opponent] = next.fighters;
            if (next.mode !== 'story') mode = next.mode;
          });
      })
      .catch((error: unknown) => {
        if (!disposed) status = { ...status, error: String(error) };
      });
    // The chrome band wraps under narrow windows, shrinking the arena without
    // a window resize; keep the letterbox in step.
    const observer = new ResizeObserver(() => session?.game.scale.refresh());
    observer.observe(host);
    return () => {
      disposed = true;
      observer.disconnect();
      session?.game.destroy(true);
    };
  });

  // Every setter calls this; keep focus inside the open settings modal.
  function focusArena() {
    if (settingsOpen) return;
    (session?.game.canvas ?? host).focus({ preventScroll: true });
  }
  // A story battle starts over; otherwise the match starts in this mode.
  function reset(next: Mode = mode) {
    if (next !== 'story') mode = next;
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
  function openSettings() {
    // The scene holds the modal's freeze, so a reset's unpause can't slip a
    // tick through and a select screen after a match freezes too.
    session?.scene.setModal(true);
    settingsOpen = true;
    dialog.showModal();
  }
  // close fires on every path (Close button, Character select, native Esc).
  function settingsClosed() {
    settingsOpen = false;
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

<main class="app-shell" id="main">
  <section class="cabinet" aria-label="SCWU training match">
    <div class="stage-shell">
      <div class="stage-chrome">
        <div class="stats-chip">
          {#if status.resultReady}
            <strong class="result-label"
              >{status.matchWinner === 'draw'
                ? 'DRAW GAME'
                : status.matchWinner === 'player'
                  ? '1P WIN'
                  : '2P WIN'}</strong
            >
          {:else}
            <span class="match-stats"
              ><strong>{status.hits}</strong> HITS <span>·</span>
              <strong>{status.damage}</strong> DAMAGE</span
            >
          {/if}
        </div>
        <p class="keyboard-guide">
          <span><kbd>A</kbd><kbd>D</kbd> Move</span><span
            ><kbd>W</kbd> Jump</span
          ><span><kbd>S</kbd> Crouch</span>{#if has('punch')}<span
              ><kbd>G</kbd> {labelOf('punch', 'Punch')}</span
            >{/if}{#if has('kick')}<span
              ><kbd>H</kbd> {labelOf('kick', 'Kick')}</span
            >{/if}<span>Hold back Guard</span><span><kbd>Shift</kbd> Dash</span
          >{#if has('throw')}<span
              ><kbd>J</kbd> {labelOf('throw', 'Throw')}</span
            >{/if}{#if has('hitUp')}<span
              ><kbd>K</kbd> {labelOf('hitUp', 'Hit Up')}</span
            >{/if}{#if has('iori')}<span
              ><kbd>F</kbd> {labelOf('iori', 'IORI')}</span
            >{/if}{#if has('ex')}<span><kbd>E</kbd> {labelOf('ex', 'EX')}</span
            >{/if}
        </p>
        <div class="floating-controls">
          <button
            aria-haspopup="dialog"
            disabled={!status.ready}
            onclick={openSettings}>Settings</button
          >
          <button
            disabled={!status.ready || status.resultReady || !!status.error}
            onclick={pause}
            >{status.paused ? 'Resume' : 'Pause'} <kbd>P</kbd></button
          >
          <button
            class:rematch={status.resultReady}
            disabled={!status.ready || !!status.error}
            onclick={() => reset(status.story ? 'story' : mode)}
            >{status.resultReady ? 'Fight again' : 'Reset'} <kbd>R</kbd></button
          >
        </div>
      </div>
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
            <p>Opening {stageLabels[stage]}.</p>
          </div>
        {:else if status.paused}
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
      </div>
    </div>
  </section>
  <div class="touch-controls" aria-label="Touch controls">
    {#each touchControls.filter( (item) => has(item.control) ) as item (item.control)}
      <button
        class:attack-control={[
          'punch',
          'kick',
          'drill',
          'axe',
          'throw',
          'hitUp',
          'iori',
          'dst',
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

  <dialog
    class="settings-dialog"
    bind:this={dialog}
    aria-label="Settings"
    tabindex="-1"
    onkeydown={(event) => event.stopPropagation()}
    onclose={settingsClosed}
  >
    <div class="mode-switch" aria-label="Opponent mode">
      <button
        class:active={mode === 'practice'}
        aria-pressed={mode === 'practice'}
        disabled={!status.ready}
        onclick={() => reset('practice')}>Free practice</button
      >
      <button
        class:active={mode === 'cpu'}
        aria-pressed={mode === 'cpu'}
        disabled={!status.ready}
        onclick={() => reset('cpu')}>Vs. CPU</button
      >
    </div>
    <label class="music-toggle"
      ><input
        type="checkbox"
        disabled={!status.ready}
        onchange={(event) => {
          session?.scene.setMusic(event.currentTarget.checked);
          focusArena();
        }}
      /> Music</label
    >
    <button
      class="text-button"
      disabled={!status.ready || status.selecting}
      onclick={() => {
        dialog.close();
        openSelect();
      }}>Character select</button
    >
    <div class="practice-options" role="group" aria-label="Match settings">
      <label
        >Fighter
        <select
          value={fighter}
          disabled={!status.ready || status.selecting || status.story}
          onchange={(event) => setFighter(event.currentTarget.value as Who)}
        >
          {#each ROSTER as { id, name } (id)}
            <option value={id}>{name}</option>
          {/each}
        </select></label
      >
      <label
        >Opponent
        <select
          value={opponent}
          disabled={!status.ready || status.selecting || status.story}
          onchange={(event) => setOpponent(event.currentTarget.value as Who)}
        >
          {#each ROSTER as { id, name } (id)}
            <option value={id}>{name}</option>
          {/each}
        </select></label
      >
      <label
        >Stage
        <select
          value={stage}
          disabled={!status.ready || status.story}
          onchange={(event) => setStage(event.currentTarget.value as Stage)}
        >
          {#each Object.entries(stageLabels) as [value, label] (value)}
            <option {value}>{label}</option>
          {/each}
        </select></label
      >
      {#if mode === 'practice'}
        <label
          >Partner
          <select
            value={practice.partner}
            disabled={!status.ready}
            onchange={(event) =>
              setPractice({
                partner: event.currentTarget.value as DummyBehavior,
              })}
          >
            {#each DUMMY_BEHAVIORS as behavior (behavior)}
              <option value={behavior}>{partnerLabels[behavior]}</option>
            {/each}
          </select></label
        >
        <label
          ><input
            type="checkbox"
            checked={practice.maxStock}
            disabled={!status.ready}
            onchange={(event) =>
              setPractice({ maxStock: event.currentTarget.checked })}
          /> Max stock</label
        >
        <label
          ><input
            type="checkbox"
            checked={practice.lowHealth}
            disabled={!status.ready}
            onchange={(event) =>
              setPractice({ lowHealth: event.currentTarget.checked })}
          /> Low health</label
        >
      {/if}
    </div>
    <a
      class="guide-link"
      href={`instructions.html#${fighter}`}
      target="_blank"
      rel="noopener">Controls guide</a
    >
    <button class="text-button" onclick={() => dialog.close()}>Close</button>
  </dialog>
</main>
