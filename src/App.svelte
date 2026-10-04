<script lang="ts">
  import { onMount } from 'svelte';
  import { SUPER_CONTROLS } from './game/match';
  import type { Control, Mode, PracticeOptions } from './game/match';
  import { DUMMY_BEHAVIORS } from './game/dummy';
  import type { DummyBehavior } from './game/dummy';
  import type { GameStatus, createGame } from './game/scene';

  let host: HTMLDivElement;
  let session: ReturnType<typeof createGame> | undefined;
  let mode = $state<Mode>('practice');
  let practice = $state<PracticeOptions>({
    partner: 'stand',
    maxStock: false,
    lowHealth: false,
  });
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
    hp: [510, 510],
    seconds: Infinity,
    hits: 0,
    damage: 0,
    action: 'idle',
    winner: null,
    resultReady: false,
    error: '',
  });
  let help = $state(false);
  const asset = `${import.meta.env.BASE_URL}assets/`;
  const touchControls: { control: Control; label: string; symbol: string }[] = [
    { control: 'left', label: 'Move left', symbol: '←' },
    { control: 'right', label: 'Move right', symbol: '→' },
    { control: 'jump', label: 'Jump', symbol: '↑' },
    { control: 'crouch', label: 'Crouch', symbol: '↓' },
    { control: 'punch', label: 'Punch', symbol: 'J' },
    { control: 'kick', label: 'Kick', symbol: 'K' },
    { control: 'guard', label: 'Guard', symbol: 'L' },
    { control: 'dash', label: 'Dash', symbol: '⇧' },
    { control: 'drill', label: 'Drill punch', symbol: 'U' },
    { control: 'axe', label: 'Axe throw', symbol: 'I' },
    { control: 'throw', label: 'Throw', symbol: 'O' },
    { control: 'hitUp', label: 'Hit Up', symbol: 'H' },
    { control: 'iori', label: 'IORI', symbol: 'F' },
    { control: 'dst', label: 'Daisetsuzan', symbol: 'G' },
    { control: 'ex', label: 'EX mode', symbol: 'E' },
    { control: 'getterBeam', label: 'Getter Beam', symbol: '1' },
    { control: 'musashi', label: 'Musashi', symbol: '2' },
    { control: 'changeAttack', label: 'Change Attack', symbol: '3' },
    { control: 'blackRush', label: 'Black Rush', symbol: '4' },
    { control: 'megaBeam', label: 'Mega Beam', symbol: '5' },
  ];
  const supers = new Set<Control>(SUPER_CONTROLS);

  onMount(() => {
    let disposed = false;
    import('./game/scene')
      .then(({ createGame }) => {
        if (!disposed)
          session = createGame(host, (next) => {
            status = next;
          });
      })
      .catch((error: unknown) => {
        if (!disposed) status = { ...status, error: String(error) };
      });
    return () => {
      disposed = true;
      session?.game.destroy(true);
    };
  });

  function focusArena() {
    (session?.game.canvas ?? host).focus({ preventScroll: true });
  }
  function reset(next = mode) {
    mode = next;
    session?.scene.reset(mode);
    focusArena();
  }
  function setPractice(changes: Partial<PracticeOptions>) {
    practice = { ...practice, ...changes };
    session?.scene.setPractice(practice);
    focusArena();
  }
  function pause() {
    session?.scene.togglePause();
    focusArena();
  }
  function openHelp() {
    help = !help;
    if (help && status.ready && !status.paused && !status.resultReady)
      session?.scene.togglePause();
  }
  function press(event: PointerEvent, control: Control) {
    if (!status.ready || status.paused || status.winner) return;
    event.preventDefault();
    (event.currentTarget as HTMLButtonElement).setPointerCapture(
      event.pointerId,
    );
    session?.scene.control(control, true);
  }
</script>

<svelte:head><title>SCWU — Training</title></svelte:head>

<main class="app-shell" id="main">
  <header class="game-toolbar">
    <h1>SCWU <span>TRAINING</span></h1>
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
    <button
      class="text-button"
      onclick={openHelp}
      aria-expanded={help}
      aria-controls="controls-guide">Controls</button
    >
  </header>

  <section class="cabinet" aria-label="SCWU training match">
    <div class="stage-shell">
      <div
        class="arena"
        bind:this={host}
        tabindex="-1"
        role="application"
        aria-roledescription="fighting game"
        aria-label="Training arena. A and D to move, W to jump or double jump, S to crouch, J to punch, K to kick, H for Hit Up then W to chase on hit, F for IORI, tap again for each follow-up, L to guard, Shift to dash, double-tap left/right for a ground dash or tap once in the air, U for Drill Punch, I for Axe throw, O to grab and throw, G for the Daisetsuzan command throw, E to switch EX mode, 1 to 5 for the supers. P to pause."
      ></div>
      <div class="sr-only" aria-label="Match health">
        <div
          role="meter"
          aria-label="Player health"
          aria-valuemin="0"
          aria-valuemax="510"
          aria-valuenow={status.hp[0]}
        >
          {status.hp[0]}
        </div>
        <div
          role="meter"
          aria-label="Opponent health"
          aria-valuemin="0"
          aria-valuemax="510"
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
          <p>Opening Sport Court.</p>
        </div>
      {:else if status.paused}
        <div class="pause-overlay" aria-live="polite">
          <img src={`${asset}ui/146.png`} alt="Pause" />
          <button class="primary-button" onclick={pause}>Resume match</button>
        </div>
      {/if}
      <div class="sr-only" aria-live="polite">
        {#if status.winner}{status.seconds === 0 ? 'Time up.' : 'KO.'}
          {status.winner === 'draw'
            ? 'Draw.'
            : status.winner === 'player'
              ? 'Player 1 wins.'
              : 'Player 2 wins.'}{/if}
      </div>
    </div>
    <div class="match-footer">
      {#if status.resultReady}
        <strong class="result-label"
          >{status.winner === 'draw'
            ? 'DRAW GAME'
            : status.winner === 'player'
              ? '1P WIN'
              : '2P WIN'}</strong
        >
      {:else}
        <span class="match-stats"
          ><strong>{status.hits}</strong> HITS <span>·</span>
          <strong>{status.damage}</strong> DAMAGE</span
        >
      {/if}
      {#if mode === 'practice'}
        <div
          class="practice-options"
          role="group"
          aria-label="Practice settings"
        >
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
        </div>
      {/if}
      <div class="match-actions">
        <button
          disabled={!status.ready || status.resultReady || !!status.error}
          onclick={pause}
          >{status.paused ? 'Resume' : 'Pause'} <kbd>P</kbd></button
        >
        <button
          class:rematch={status.resultReady}
          disabled={!status.ready || !!status.error}
          onclick={() => reset()}
          >{status.resultReady ? 'Fight again' : 'Reset'} <kbd>R</kbd></button
        >
      </div>
    </div>
  </section>
  <div class="touch-controls" aria-label="Touch controls">
    {#each touchControls as item (item.control)}
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
        class:super-control={supers.has(item.control)}
        aria-label={item.label}
        disabled={!status.ready || status.paused || !!status.winner}
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
          >{item.label.replace('Move ', '')}</span
        ></button
      >
    {/each}
  </div>

  <p class="keyboard-guide">
    <span><kbd>A</kbd><kbd>D</kbd> Move</span><span><kbd>W</kbd> Jump</span
    ><span><kbd>S</kbd> Crouch</span><span><kbd>J</kbd> Punch</span><span
      ><kbd>K</kbd> Kick</span
    ><span><kbd>L</kbd> Guard</span><span><kbd>Shift</kbd> Dash</span><span
      ><kbd>U</kbd> Drill</span
    ><span><kbd>I</kbd> Axe</span><span><kbd>O</kbd> Throw</span><span
      ><kbd>H</kbd> Hit Up</span
    ><span><kbd>F</kbd> IORI</span><span><kbd>G</kbd> Daisetsuzan</span><span
      ><kbd>E</kbd> EX</span
    ><span><kbd>1</kbd>–<kbd>5</kbd> Supers</span>
  </p>
  {#if help}
    <section class="help-panel" id="controls-guide" aria-label="How to play">
      <div>
        <h2>Get a feel for the fight.</h2>
        <p>
          Move into range, then tap <kbd>J</kbd> for a quick punch or
          <kbd>K</kbd>
          for a longer kick. Hold <kbd>L</kbd> to block. Jump with
          <kbd>W</kbd> or the up arrow. Left and right arrows also move.
        </p>
        <p>
          Hold <kbd>S</kbd> or the down arrow to crouch. Punch, kick, and guard change
          with your stance: try them while crouching or in the air. When a standing
          punch or kick hits or is blocked, tap punch or kick again for the next attack,
          up to three; the two chains can cross. A missed attack has no follow-up.
          The second punch and jumping kick each strike three times; the third standing
          kick strikes eight times. Holding a button never repeats an attack. Jumping
          attacks break a crouching guard.
        </p>
        <p>
          Hold left or right when jumping to travel in that direction; releasing
          it keeps your momentum. Tap jump again in the air for a double jump,
          choosing a new direction. Double-tap left or right for a ground dash;
          in the air, tap either direction once to dash that way. This also
          works on touch. Holding a direction through takeoff keeps your normal
          jump; release and press again for an air dash. You can also press <kbd
            >Shift</kbd
          >
          or the Dash button to dash forward, or hold away to backdash. You can dash
          once in the air before landing.
        </p>
        <p>
          Press <kbd>U</kbd> for a six-hit Drill Punch on the ground, or an
          aerial drill while jumping. Aerial drill follows each hit or block
          with a weaker strike while you stay in range. Landing ends it with its
          recovery pose. Press <kbd>I</kbd> on the ground to throw a spinning axe.
          Only one axe per fighter can be out at a time: pressing it again while your
          axe flies does nothing. These basic specials do not spend super stock.
        </p>
        <p>
          Press <kbd>E</kbd> on the ground to enter EX mode for half a stock of
          power, and again to leave it for the same. Ryuko's HUD face shows an
          EX mark while it lasts. In EX mode <kbd>I</kbd> fires EX Fire instead
          of the axe: hold forward to charge it into a faster, stronger shot, or
          to the end for a large shot that launches. <kbd>1</kbd> on the ground fires
          EFS instead of Getter Beam: four shots and a launching final one. In Vs.
          CPU, holding down as the round begins starts it in EX mode.
        </p>
        <p>
          Press <kbd>H</kbd> or Hit Up on the ground for an upward kick. On a hit,
          tap Jump during the impact pause or early recovery to chase the opponent
          into the air, then use an aerial attack. Early Jump taps are remembered;
          a blocked or missed kick cannot trigger the chase.
        </p>
        <p>
          Press <kbd>F</kbd> or IORI on the ground for an advancing strike. Tap again
          to queue the second strike, then once more for the knockdown finisher. Early
          taps are remembered; each follow-up begins after the current strike. Holding
          the button performs only one stage.
        </p>
        <p>
          Press <kbd>O</kbd> close to a grounded opponent to grab and throw them,
          even through guard. A miss leaves you recovering. The opponent tumbles,
          lands, then gets up; they cannot act or be hit again during this recovery.
          Jumping avoids a grab, and a strike can interrupt its startup.
        </p>
        <p>
          Press <kbd>G</kbd> or Daisetsuzan for Ryuko's longer-reaching command throw.
          Ryuko transforms, spins the opponent overhead, hurls them into the sky,
          then fires two missiles that can catch them as they fall. A miss leaves
          a long recovery. At 30% health or less it becomes EVIL DST, striking the
          held opponent five times first.
        </p>
        <p>
          Landing hits, blocking, and taking damage fill the power gauge at the
          bottom of the screen. Each full gauge becomes one stock, up to three.
          Keys <kbd>1</kbd>
          to <kbd>5</kbd> spend it on Ryuko's supers: <kbd>1</kbd> Getter Beam
          (also in the air), <kbd>2</kbd> Musashi, <kbd>3</kbd> Getter Change
          Attack, and <kbd>5</kbd> Mega Getter Beam, which needs all three
          stocks. Musashi and the Change Attack grab at close range.
          <kbd>4</kbd> throws an axe until your health falls below 30%, then
          becomes the Black Getter Mega Rush. Without enough stock, Ryuko shouts
          NO SUPER and gains a little power instead. At 30% health or less,
          Getter Beam also takes its stronger form. Once a punch or kick hits or
          is blocked, a special or super can cancel it. A super that cancels
          IORI takes a faster form for two stocks. While blocking with a stock,
          press
          <kbd>H</kbd> to spend it on COUNTER HIT.
        </p>
        <p>
          Free practice has no timer. Below the arena, choose how the partner
          behaves: standing, guarding high or low, guarding in the air,
          attacking in range, jumping in, or playing as the original CPU. Max
          stock refills your supers whenever you stand idle, and Low health
          keeps Ryuko at 30% for her desperation moves. Vs. CPU is the original
          game's CPU, playing Ryuko's own moves, specials and supers. Reduce
          their health to zero, or lead on health when time runs out. Changing
          modes starts a fresh match.
        </p>
        <p>
          The match pauses when you leave the window. Press <kbd>P</kbd> to
          resume and <kbd>R</kbd> to restart. On touch devices, use the buttons below
          the court; landscape gives you more room.
        </p>
      </div>
      <button
        class="text-button"
        onclick={() => {
          help = false;
        }}>Close guide <span aria-hidden="true">×</span></button
      >
    </section>
  {/if}

  <footer class="page-footer">
    SPORT COURT <span>Original SCWU art · Web training rules</span>
  </footer>
</main>
