<script lang="ts">
  import { onMount } from 'svelte';
  import { KEYS } from './game/commands';
  import { SUPER_CONTROLS } from './game/match';
  import type { Control, Mode, PracticeOptions } from './game/match';
  import type { Stage, Who } from './game/characters';
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
  // The others' moves take Ryuko's keys (commands.ts).
  const fighterLabels: Partial<Record<Who, Partial<Record<Control, string>>>> =
    {
      zoma: {
        getterBeam: 'Spake',
        musashi: 'DST',
        changeAttack: 'EN300',
        blackRush: 'Shin Spark',
        drill: 'Dragon',
        axe: 'Fire',
        iori: 'Dragon 2',
        dst: 'Bomb',
        ex: 'G Beam',
      },
      kiki: {
        getterBeam: 'Ranbu',
        musashi: 'Magic Fire',
        changeAttack: 'EN3',
        drill: 'Dragon O',
        axe: "K'",
        iori: 'Tatumaki',
      },
      chung: {
        getterBeam: 'Gesar',
        musashi: 'Lee',
        changeAttack: 'EN300',
        drill: 'Dragon',
        axe: 'Fire Ball',
        iori: 'Orochi',
        dst: 'Burn Knock',
      },
      amiro: {
        getterBeam: 'SCC',
        musashi: 'Medeo',
        changeAttack: 'NT',
        blackRush: 'Funnal',
        drill: 'Dragon',
        axe: 'Beam',
        iori: 'Coment Chuck',
        dst: 'Morning Star',
      },
      anmc: {
        getterBeam: 'Super Chuck',
        musashi: 'Super Ball',
        changeAttack: 'EN300',
        drill: 'Fly Move',
        axe: 'Fire Ball',
        iori: 'Twis Att',
        dst: 'Ball Fire',
      },
      giant: {
        getterBeam: 'Fire',
        musashi: 'Hariken',
        changeAttack: 'EN300',
        drill: 'Rock Punch',
        axe: 'Base Ball',
        iori: 'H Punch',
        dst: 'Counter',
      },
    };
  const labelOf = (control: Control, label: string) =>
    fighterLabels[fighter]?.[control] || label;
  // A move key the fighter has no command for has no button.
  const moveKeys = new Set(
    Object.values(KEYS).flatMap((keys) => keys.map(([control]) => control)),
  );
  const has = (control: Control) =>
    !moveKeys.has(control) || KEYS[fighter].some(([key]) => key === control);

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
  function openHelp() {
    help = !help;
    if (help && status.ready && !status.paused && !status.resultReady)
      session?.scene.togglePause();
  }
  const sayWinner = (winner: GameStatus['winner']) =>
    winner === 'draw'
      ? 'Draw.'
      : winner === 'player'
        ? 'Player 1 wins.'
        : 'Player 2 wins.';
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
        aria-label="Training arena. A and D to move, W to jump or double jump, S to crouch, J to punch, K to kick, H for Hit Up then W to chase on hit, F for IORI, tap again for each follow-up, L to guard, Shift to dash, double-tap left or right to dash on the ground or in the air, U for Drill Punch, I for Axe throw, O to grab and throw, G for the Daisetsuzan command throw, E to switch EX mode, 1 to 5 for the supers, or Ryuko's original motion commands. P to pause."
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
    <div class="match-footer">
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
      <div class="practice-options" role="group" aria-label="Match settings">
        <label
          >Fighter
          <select
            value={fighter}
            disabled={!status.ready}
            onchange={(event) => setFighter(event.currentTarget.value as Who)}
          >
            <option value="ryuko">Ryuko</option>
            <option value="zoma">Zoma</option>
            <option value="kiki">Kiki</option>
            <option value="chung">Chung</option>
            <option value="amiro">Amiro</option>
            <option value="anmc">ANMC P</option>
            <option value="giant">Giant</option>
          </select></label
        >
        <label
          >Opponent
          <select
            value={opponent}
            disabled={!status.ready}
            onchange={(event) => setOpponent(event.currentTarget.value as Who)}
          >
            <option value="zoma">Zoma</option>
            <option value="ryuko">Ryuko</option>
            <option value="kiki">Kiki</option>
            <option value="chung">Chung</option>
            <option value="amiro">Amiro</option>
            <option value="anmc">ANMC P</option>
            <option value="giant">Giant</option>
          </select></label
        >
        <label
          >Stage
          <select
            value={stage}
            disabled={!status.ready}
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
        class:super-control={supers.has(item.control)}
        aria-label={labelOf(item.control, item.label)}
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
          >{labelOf(item.control, item.label).replace('Move ', '')}</span
        ></button
      >
    {/each}
  </div>

  <p class="keyboard-guide">
    <span><kbd>A</kbd><kbd>D</kbd> Move</span><span><kbd>W</kbd> Jump</span
    ><span><kbd>S</kbd> Crouch</span><span><kbd>J</kbd> Punch</span><span
      ><kbd>K</kbd> Kick</span
    ><span><kbd>L</kbd> Guard</span><span><kbd>Shift</kbd> Dash</span><span
      ><kbd>U</kbd> {labelOf('drill', 'Drill')}</span
    ><span><kbd>I</kbd> {labelOf('axe', 'Axe')}</span><span
      ><kbd>O</kbd> Throw</span
    ><span><kbd>H</kbd> Hit Up</span><span
      ><kbd>F</kbd> {labelOf('iori', 'IORI')}</span
    >{#if has('dst')}<span><kbd>G</kbd> {labelOf('dst', 'Daisetsuzan')}</span
      >{/if}{#if has('ex')}<span><kbd>E</kbd> {labelOf('ex', 'EX')}</span
      >{/if}<span
      ><kbd>1</kbd>–<kbd>{SUPER_CONTROLS.filter(has).length}</kbd> Supers</span
    >
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
          it keeps your momentum. In the air, let go of every direction, then
          press jump again, with left or right to steer, for a double jump.
          Double-tap left or right, letting go in between, to dash that way on
          the ground or in the air. This also works on touch. You can also press <kbd
            >Shift</kbd
          >
          or the Dash button to dash forward, or hold away to backdash. Each jump
          allows one double jump and one air dash, a double jump can still air dash,
          and an air dash or a finished aerial attack allows neither. Neither comes
          out near the floor on the way down.
        </p>
        <p>
          Press <kbd>U</kbd> for a six-hit Drill Punch on the ground, or an
          aerial drill while jumping. Aerial drill's first hit lifts the
          opponent in front of the drill, and each hit or block is followed by a
          weaker strike while they stay in range. Landing ends it with its
          recovery pose. Press <kbd>I</kbd> on the ground to throw a spinning axe.
          Only one axe per fighter can be out at a time: pressing it again while your
          axe flies only makes Ryuko stand. These basic specials do not spend super
          stock.
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
          press or hold Jump near the end of the impact pause, or just after it, to
          chase the opponent into the air, then use an aerial attack. A press earlier
          in the pause is too early; a blocked or missed kick cannot trigger the chase.
        </p>
        <p>
          Press <kbd>F</kbd> or IORI on the ground for an advancing strike. Press
          it again near the end of the strike for the second, then once more for the
          knockdown finisher; each follow-up begins after the current strike. Holding
          the button performs only one stage.
        </p>
        <p>
          Press <kbd>O</kbd> close to a grounded opponent to grab and throw them,
          even through guard. A miss leaves you recovering. The opponent tumbles,
          lands, then gets up; they cannot act or be hit again during this recovery.
          Jumping avoids a grab, and a strike can interrupt its startup.
        </p>
        <p>
          Press <kbd>G</kbd> or Daisetsuzan for Ryuko's command throw. Ryuko transforms,
          spins the opponent overhead, hurls them into the sky, then fires two missiles
          that can catch them as they fall. A miss leaves a long recovery; started
          from farther away, its shorter grab stays open through that recovery. At
          30% health or less it becomes EVIL DST, striking the held opponent five
          times first.
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
          Ryuko's original motion commands work too, read toward the opponent:
          ↓→ <kbd>J</kbd> axe, ↓← <kbd>K</kbd> Drill Punch, ↓← <kbd>J</kbd> IORI
          and its follow-ups, ←↓→ <kbd>K</kbd> Daisetsuzan, ↓ ↓ <kbd>H</kbd> EX
          mode, ↓→↓→ <kbd>J</kbd> Getter Beam, ↓→↓→ <kbd>K</kbd> Mega Getter
          Beam, ↓←↓→
          <kbd>J</kbd> Black Getter Mega Rush, and →↓←→↓← with <kbd>J</kbd> for
          Musashi or <kbd>K</kbd> for the Getter Change Attack. Hold the last direction
          a moment before the button. A button or motion is remembered briefly, so
          one entered during another move comes out when that move ends.
        </p>
        <p>
          Choose Fighter: Zoma below the arena to play Zoma in free practice.
          <kbd>J</kbd> and <kbd>K</kbd> punch and kick; on a hit or block press
          either again for the second strike, then again for the third. Hold
          down for his crouching punch and sweep, and attack in the air for his
          air punch and kick. <kbd>Shift</kbd> or → → runs while you hold
          forward; up during the run leaps high. With back held it hops back
          instead. Up in the air double jumps, and → → there air dashes.
          <kbd>H</kbd>
          is his Hit Up (up on a hit chases), and <kbd>O</kbd> his chuck, a
          close grab that slams and tosses the opponent, then throws a hatchet.
          Blocking with a stock, <kbd>H</kbd> early or <kbd>J</kbd> +
          <kbd>K</kbd> late spends it on COUNTER HIT. His specials: <kbd>U</kbd>
          or →↓↘ <kbd>J</kbd> DRAGON (also in the air), <kbd>I</kbd> or ↓→
          <kbd>J</kbd> FIRE (one fireball at a time; again while it flies, he
          punches), <kbd>F</kbd> or ↓← <kbd>J</kbd> dragon 2, vanishing and
          striking from ahead (↓← <kbd>K</kbd> farther, ↓← <kbd>J</kbd> +
          <kbd>K</kbd> in place), <kbd>G</kbd> or ↓→ <kbd>K</kbd> BOMB, three
          bombs falling on marks ahead (five, then he reloads), and <kbd>E</kbd>
          or ↓→↓→ <kbd>K</kbd> G Beam. His supers spend stock: <kbd>1</kbd> or
          ↓→↓→ <kbd>J</kbd> SPAKE, a charging dash (also in the air),
          <kbd>2</kbd> or →↓←→↓← <kbd>J</kbd> DST, a close command grab that
          tosses, juggles and blasts the opponent, <kbd>3</kbd> or ↓←↓←
          <kbd>K</kbd>
          EN300 for three stocks, and <kbd>4</kbd> or ↓←↓→ <kbd>K</kbd> Shin Spark,
          three stocks below 30% health (BOMB otherwise). After DRAGON connects, SPAKE
          or DST cancels it for two stocks.
        </p>
        <p>
          Choose Kiki to play her. <kbd>J</kbd> and <kbd>K</kbd> chain as Zoma's
          do, her third punch a long lunge and her third kick a flying fist;
          down with <kbd>K</kbd> throws a hopping potato. <kbd>Shift</kbd>
          or → → hops forward (with back held, back), and in the air → → air dashes.
          <kbd>H</kbd>
          is her Hit Up (up on a hit chases),
          <kbd>O</kbd> her chuck, a close grab that ends in a blast, and
          blocking with a stock, <kbd>H</kbd> spends it on COUNTER HIT. Her
          specials:
          <kbd>U</kbd> or ↓→ <kbd>K</kbd> DRAGON O, a rising multi-hit (also in
          the air), <kbd>I</kbd> or ↓→ <kbd>J</kbd> K', then → <kbd>K</kbd> a
          dashing strike (stronger if repeated soon after it hits), →
          <kbd>J</kbd> a shot or ← <kbd>K</kbd> BLACK OUT, and <kbd>F</kbd> or
          ↓← <kbd>K</kbd> TATUMAKI, a hopping spin. Her supers: <kbd>1</kbd> or
          ↓→↓← <kbd>J</kbd> ranbu, a dash into a slam and flurry, <kbd>2</kbd>
          or ↓→↓→ <kbd>J</kbd> MAGIC FIRE, eleven fireballs, for a stock each,
          and <kbd>3</kbd> or ↓→↓→ <kbd>K</kbd> EN3 majic dance for three: it lifts
          the opponent, then witches fly in and a beam hops them in and out. As TATUMAKI
          lands, ranbu or MAGIC FIRE cancels it for two stocks.
        </p>
        <p>
          Choose Chung to play him. <kbd>J</kbd> and <kbd>K</kbd> chain as
          Zoma's do, his third punch a strike that catches and blasts the
          opponent away; down with <kbd>K</kbd> is a burning kick that knocks
          down. <kbd>Shift</kbd> or → → dashes (with back held, back), up in the
          air double jumps, and → → there air dashes. <kbd>H</kbd> is his Hit
          Up, <kbd>O</kbd> his chuck, a close grab that hurls the opponent into
          the screen's edge, and blocking with a stock, <kbd>H</kbd> spends it
          on COUNTER HIT. <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> switches to EX mode
          for half a stock, where several of his moves take their EX forms, and
          back again. His specials: <kbd>U</kbd> or →↓↘ <kbd>J</kbd> Dragon
          (also in the air), <kbd>I</kbd> or ↓→ <kbd>J</kbd> Fire ball, a thrown
          star,
          <kbd>F</kbd> or ←↓→ <kbd>K</kbd> orochi, <kbd>G</kbd> or ↓←
          <kbd>J</kbd> Burn Knock, ↓← <kbd>K</kbd> jump wall move, and in the
          air ↓→ <kbd>K</kbd> air fire. His supers: <kbd>1</kbd> or ↓←↓→
          <kbd>J</kbd> gesar (in the air, nin star), <kbd>2</kbd> or ↓→↓→
          <kbd>K</kbd> lee, kicks that carry the opponent up and leave them
          floating, for a stock each (Evil gesar and Evil Lee below 30% health),
          and <kbd>3</kbd> or ↓←↓← <kbd>K</kbd> EN300 for three: it shocks the opponent,
          then lifts and tosses them about.
        </p>
        <p>
          Choose Amiro to play her. <kbd>J</kbd> and <kbd>K</kbd> chain as
          Chung's do: her third punch lunges and hurls the opponent into the
          screen's edge, her third kick throws a bouncing ball, and down with
          <kbd>K</kbd> sweeps. <kbd>H</kbd> is her Hit Up, <kbd>O</kbd> her
          chuck, a grab and a spinning toss, and blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓ ↓
          <kbd>H</kbd> switches to EX mode for half a stock, and back, which
          swaps her specials and supers for other forms. Her specials:
          <kbd>U</kbd> or →↓↘ <kbd>J</kbd> Dragon (also in the air),
          <kbd>I</kbd> or ↓→↓→ <kbd>K</kbd> BEAM, <kbd>F</kbd> or ←↓→
          <kbd>K</kbd> Coment chuck, a grab that throws the opponent straight
          up, and <kbd>G</kbd> or ↓← <kbd>J</kbd> morning star, a flail. Her
          supers: <kbd>1</kbd> or →↓←→↓← <kbd>J</kbd> scc, a grab, a toss up and
          a beam, <kbd>3</kbd> or ↓←↓← <kbd>K</kbd> NT, a flying unit that
          strikes from range, and <kbd>4</kbd> or ↓→↓→ <kbd>J</kbd> funnal,
          drones that fire beams, for a stock each, and <kbd>2</kbd> or ↓←↓→
          <kbd>J</kbd> medeo, a meteor drop, for three (Evil forms of NT, funnal and
          medeo below 30% health).
        </p>
        <p>
          Choose ANMC P to play him. <kbd>J</kbd> and <kbd>K</kbd> chain as
          Chung's do: his third punch rushes in and hurls the opponent into the
          screen's edge, his third kick blasts them away, and down with
          <kbd>K</kbd> knocks down. <kbd>H</kbd> is his Hit Up, <kbd>O</kbd> his
          chuck, a grab that spins the opponent away, and blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓ ↓
          <kbd>H</kbd>
          switches to EX mode for half a stock, and back: he guards in a winged bird
          costume instead of his mecha suit, and his kicks, chuck and twis att take
          other forms. His specials: <kbd>U</kbd> or ↓← <kbd>J</kbd>
          fly move, a rocket leap, <kbd>I</kbd> or ↓→ <kbd>J</kbd> fire ball,
          lobbed in a high arc, <kbd>F</kbd> or ↓← <kbd>K</kbd> twis att, a
          spinning rush that a super can cancel, and <kbd>G</kbd> or ↓→
          <kbd>K</kbd> ball fire, a straight shot (both shots also in the air).
          His supers: <kbd>1</kbd> or →↓←→↓← <kbd>J</kbd> SUPER CHUCK, a grab
          and a beating, and <kbd>2</kbd> or ↓→↓→ <kbd>J</kbd> super ball, balls
          that fire beams, for a stock each, and <kbd>3</kbd> or ↓→↓→
          <kbd>K</kbd> en300, a barrage of shots, for three.
        </p>
        <p>
          Choose Giant to play him. <kbd>J</kbd> and <kbd>K</kbd> chain as
          Chung's do: his third punch knocks the opponent away, his third kick
          grabs and twists them away but knocks him down too, and down with
          <kbd>J</kbd> or <kbd>K</kbd> is an uppercut or a sweep. <kbd>H</kbd>
          is his Hit Up, <kbd>O</kbd> his chuck: a grab, then a song that dazes
          the opponent until the music explodes, throwing you both. Blocking
          with a stock, <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓
          ↓ <kbd>H</kbd> switches to EX mode for half a stock, and back, which
          swaps his third punch and kick, Hit Up, specials and supers for other
          forms. His specials: <kbd>U</kbd> or →←↓→ <kbd>J</kbd> Rock punch, a
          rocket punch that flies out from range, <kbd>I</kbd> or ↓→
          <kbd>K</kbd> base ball, a pitch of random kind (in the air, a diving
          punch), <kbd>F</kbd> or ↓→ <kbd>J</kbd> H PUNCH, a hammer punch that
          hurls the opponent into the screen's edge, which a super can cancel,
          and <kbd>G</kbd> or →↓← <kbd>K</kbd> counter: struck during its stance
          he takes double damage, then strikes back, rushing in to beat the
          opponent inside a cloud of dust. His supers: <kbd>1</kbd> or ↓→↓→
          <kbd>J</kbd>
          fire, a fire beam (also in the air; Evil fire below 30% health), and
          <kbd>2</kbd>
          or ↓→↓→ <kbd>K</kbd> HARIKEN, a whirlwind, for a stock each, and
          <kbd>3</kbd>
          or ↓←↓← <kbd>J</kbd>
          en300, which calls his friends, then a screen-wide barrage, for three.
        </p>
        <p>
          Below the arena, choose your fighter and the opponent, Zoma, Ryuko,
          Kiki, Chung, Amiro, ANMC P or Giant, and one of eighteen stages, in
          either mode. Free practice has no timer, and you also choose how the
          partner behaves: standing, guarding high or low, guarding in the air,
          attacking in range, jumping in, or playing as the original CPU. Max
          stock refills your supers whenever you stand idle, and Low health
          keeps you at 30% for desperation moves. Vs. CPU is the original game's
          CPU, playing the opponent's own moves, specials and supers. Reduce
          their health to zero, or lead on health when time runs out. Changing
          modes, fighters or the stage starts a fresh match.
        </p>
        <p>
          The match pauses when you leave the window. Press <kbd>P</kbd> to
          resume and <kbd>R</kbd> to restart. On touch devices, use the buttons below
          the arena; landscape gives you more room.
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
    {stageLabels[stage].toUpperCase()}
    <span>Original SCWU art · Web training rules</span>
  </footer>
</main>
