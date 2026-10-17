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
      suneo: {
        getterBeam: 'HH',
        musashi: 'GP',
        changeAttack: 'EN300',
        blackRush: 'BP',
        drill: 'Drill Knee',
        axe: 'Fire Ball',
        iori: 'G Driver',
        dst: 'Bike',
      },
      yo: {
        getterBeam: 'Giga Press',
        musashi: 'Hidden',
        changeAttack: 'Snake',
        blackRush: 'EN300',
        drill: 'Dragon',
        axe: 'Tofu',
        iori: 'Zombi Walk',
        dst: 'Run In',
      },
      sin: {
        getterBeam: 'Baku',
        musashi: 'Sup Run C',
        changeAttack: 'EN300',
        blackRush: 'Nozan',
        drill: 'S Punch',
        axe: 'Low Chuck',
        iori: 'Run Chuck',
        dst: 'Clack Chuck',
      },
      lizard: {
        getterBeam: 'Hidden',
        musashi: 'Chuck Sup',
        changeAttack: 'Dragon SP',
        blackRush: 'EN300',
        drill: 'Cross',
        axe: 'Fire',
        iori: 'Jump Att',
      },
      kay: {
        getterBeam: 'EN300',
        musashi: 'Kaoru',
        changeAttack: 'Super P',
        drill: 'Air Chuck',
        axe: 'Fire',
        iori: 'Counter',
        dst: 'Comment Chuck',
      },
      dido: {
        getterBeam: 'Hidden EN300',
        musashi: 'Temjin Fly',
        changeAttack: 'Dragon',
        blackRush: 'Raiden',
        megaBeam: 'EN300',
        drill: 'Slide',
        axe: 'Fire',
        iori: 'RAiden',
        dst: 'Dodge',
      },
      sakuya: {
        getterBeam: 'EN300',
        musashi: 'Super Hit Up',
        changeAttack: 'Spark',
        blackRush: 'Dragon Kick',
        megaBeam: 'Low Fire',
        drill: 'Dragon Punch',
        axe: 'Fire',
        iori: 'Iori',
        dst: 'Counter',
      },
      alex: {
        getterBeam: 'EN300',
        musashi: 'Gysa',
        changeAttack: 'Super Fire',
        blackRush: 'Haou',
        drill: 'Dragon',
        axe: 'Air Fire',
        iori: 'Reflect',
        dst: 'Counter',
      },
      sou: {
        getterBeam: 'Kokaken',
        musashi: 'Rengeki',
        changeAttack: 'Beast Attack',
        blackRush: 'Spark',
        megaBeam: 'Danku Shot',
        drill: 'Akuma Jump',
        axe: 'Fire Kick',
        iori: 'Iori',
        dst: 'BK',
      },
      hiso: {
        getterBeam: 'Fish',
        musashi: 'EN300',
        changeAttack: 'Fly Arm',
        blackRush: 'S Shoot',
        megaBeam: 'Striker',
        drill: 'Dragon',
        axe: 'Fire',
        iori: 'Bannaku',
        dst: 'Counter',
      },
      erus: {
        getterBeam: 'Hidden EN3',
        musashi: 'Lizard Fly',
        changeAttack: 'SCC',
        blackRush: 'EN300',
        megaBeam: 'Super Slash',
        drill: 'Inatuma',
        axe: 'VO5',
        iori: 'Coin',
        dst: 'Counter',
      },
      feng: {
        getterBeam: 'EN300',
        musashi: 'ICE Punch',
        changeAttack: 'S Shoot',
        blackRush: 'Suck',
        drill: 'Dragon',
        axe: 'Fire',
        iori: 'Iori',
        dst: 'BP',
      },
      sean: {
        getterBeam: 'EN300',
        musashi: 'SCC',
        changeAttack: 'S Shoot',
        drill: 'Dragon',
        axe: 'Whip',
        iori: 'Whip K',
        dst: 'CC',
      },
      gon: {
        getterBeam: 'EN300',
        musashi: 'Kuren',
        changeAttack: 'Heart',
        blackRush: 'Hidden',
        drill: 'Dragon',
        axe: 'Fire Ball',
        iori: 'Drill',
        dst: 'Counter',
      },
      kate: {
        getterBeam: 'en300',
        musashi: 'Slash',
        changeAttack: 'Beam',
        drill: 'Neko',
        axe: 'Air Fire',
        iori: 'Dash Att',
        dst: 'Counter',
      },
      remu: {
        getterBeam: 'Gold Hand',
        musashi: 'Minami',
        changeAttack: 'Bakuretu',
        blackRush: 'Phsy',
        megaBeam: 'Thander',
        drill: 'Tatsumaki',
        axe: 'Slash',
        iori: 'Jet',
        dst: 'Drill',
      },
      rear: {
        getterBeam: 'Gysa',
        musashi: 'Viper F',
        changeAttack: 'en300',
        blackRush: 'Evil en3',
        drill: 'Sama',
        axe: 'Fire Ball',
        iori: 'Down Att',
        dst: 'Viper',
      },
      gigi: {
        getterBeam: 'Ranbu',
        musashi: 'S Chuck',
        changeAttack: 'EN3',
        blackRush: 'Bike K',
        megaBeam: 'Bike PK',
        drill: 'Dragon',
        axe: "K'",
        iori: 'Dive',
        dst: 'Bike P',
        ex: 'Change',
      },
      sww: {
        getterBeam: 'Super RSK',
        musashi: 'God Dragon',
        changeAttack: 'C. Chain',
        blackRush: 'EN300',
        megaBeam: 'Healing',
        drill: 'Dragon P',
        axe: 'Ice Punch',
        iori: 'Chain',
        dst: 'Ryuseiken',
        ex: 'Chan',
      },
      ogi: {
        getterBeam: 's shoot',
        musashi: 'SCC',
        changeAttack: 'S Crush',
        blackRush: 'EN300',
        megaBeam: 'Fire K',
        drill: 'Dragon',
        axe: 'Crush',
        iori: 'Rose',
        dst: 'Fire P',
      },
      ziro: {
        getterBeam: 'Miss All',
        musashi: 'Rambu',
        changeAttack: 'EN300',
        blackRush: 'Twin Shot',
        megaBeam: 'CC',
        drill: 'Fire Ball',
        axe: 'Nataku',
        iori: 'Telepot',
        dst: 'Iori',
        ex: 'Type',
      },
      masa: {
        getterBeam: 'Rambu',
        musashi: 'SCC',
        changeAttack: 'Mesatsu',
        drill: 'Shoryu',
        axe: '3 Fire',
        iori: '3 Hit',
        dst: 'Bando',
      },
      times: {
        getterBeam: 'Rambu',
        musashi: 'Super Boom',
        changeAttack: 'Mesatsu',
        drill: 'Shoryu',
        axe: 'Fire',
        iori: 'Dash P',
      },
      zenka: {
        getterBeam: 'Ranbu',
        musashi: 'Daisharin',
        changeAttack: 'En300',
        drill: 'Dragon P',
        axe: 'Fire Ball',
        iori: 'New Move',
      },
      zmega: {
        getterBeam: 'Gaisa',
        musashi: 'S Giga',
        changeAttack: 'Akuma',
        drill: 'Sama',
        axe: 'Fire Ball',
        iori: 'Giga',
        dst: 'Reflect',
        ex: 'Shin Z',
      },
      alpha: {
        getterBeam: 'Snake Fire',
        musashi: 'Ryuon',
        changeAttack: 'Rambu',
        blackRush: 'New En3',
        megaBeam: 'SCC',
        drill: 'CC',
        axe: 'Munt',
        iori: 'NC',
      },
      shinz: {
        getterBeam: 'Kaisa',
        musashi: 'S Giga',
        changeAttack: 'Akuma',
        drill: 'Sama',
        axe: 'Fire Ball',
        iori: 'Giga',
        dst: 'Reflect',
        ex: 'Gaisa',
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
            <option value="suneo">G Suneo</option>
            <option value="yo">Yo</option>
            <option value="sin">SIN</option>
            <option value="lizard">LIZARD</option>
            <option value="kay">KAY</option>
            <option value="dido">DIDO</option>
            <option value="sakuya">SAKUYA</option>
            <option value="alex">ALEX</option>
            <option value="sou">SOU</option>
            <option value="hiso">HISO</option>
            <option value="erus">ERUS</option>
            <option value="feng">OS FENG</option>
            <option value="sean">SEAN</option>
            <option value="gon">GON</option>
            <option value="kate">KATE</option>
            <option value="remu">REMU</option>
            <option value="rear">REAR</option>
            <option value="gigi">GIGI</option>
            <option value="sww">SWW</option>
            <option value="ogi">OGI</option>
            <option value="ziro">ZIRO</option>
            <option value="masa">MASA</option>
            <option value="times">3-TIMES</option>
            <option value="zenka">ZENKA</option>
            <option value="zmega">Z-MEGA</option>
            <option value="alpha">ALPHA</option>
            <option value="shinz">SHIN-Z</option>
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
            <option value="suneo">G Suneo</option>
            <option value="yo">Yo</option>
            <option value="sin">SIN</option>
            <option value="lizard">LIZARD</option>
            <option value="kay">KAY</option>
            <option value="dido">DIDO</option>
            <option value="sakuya">SAKUYA</option>
            <option value="alex">ALEX</option>
            <option value="sou">SOU</option>
            <option value="hiso">HISO</option>
            <option value="erus">ERUS</option>
            <option value="feng">OS FENG</option>
            <option value="sean">SEAN</option>
            <option value="gon">GON</option>
            <option value="kate">KATE</option>
            <option value="remu">REMU</option>
            <option value="rear">REAR</option>
            <option value="gigi">GIGI</option>
            <option value="sww">SWW</option>
            <option value="ogi">OGI</option>
            <option value="ziro">ZIRO</option>
            <option value="masa">MASA</option>
            <option value="times">3-TIMES</option>
            <option value="zenka">ZENKA</option>
            <option value="zmega">Z-MEGA</option>
            <option value="alpha">ALPHA</option>
            <option value="shinz">SHIN-Z</option>
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
          <kbd>J</kbd> Burn Knock, ↓← <kbd>K</kbd> jump wall move, a leap back
          that clings to the wall (<kbd>K</kbd> kicks off it, <kbd>J</kbd> or ↑
          leaps away), and in the air ↓→ <kbd>K</kbd> air fire. His supers:
          <kbd>1</kbd>
          or ↓←↓→
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
          Choose G Suneo to play her. <kbd>J</kbd> and <kbd>K</kbd> chain as
          Chung's do: her third punch hurls the opponent into the screen's edge,
          her third kick is a leaping kick that strikes again and again, and
          down with <kbd>J</kbd> or <kbd>K</kbd> is a rising punch or a sliding
          sweep. <kbd>H</kbd> is her Hit Up, <kbd>O</kbd> her chuck: a grab, a
          hop back and a leaping throw that spins the opponent away. Blocking
          with a stock, <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓
          ↓ <kbd>H</kbd> switches to EX mode for half a stock, and back, which
          swaps her second kick, crouching and air attacks, Hit Up, chuck and
          specials for other forms. Her specials: <kbd>U</kbd> or →↓↘
          <kbd>K</kbd> DRILL KNIEE, a rising knee (also in the air),
          <kbd>I</kbd> or ↓→ <kbd>J</kbd> FIRE BALL, a shot that speeds up,
          which a super can cancel, <kbd>F</kbd> or ↓← <kbd>J</kbd> G DRIVER, a
          drill lance thrust that hurls the opponent into the screen's edge (in
          EX mode a shocking strike), and <kbd>G</kbd> or ↓← <kbd>K</kbd> BIKE,
          a leap on a golden lion (also in the air; in EX mode a wheel that
          strikes again and again). Her supers: <kbd>2</kbd> or →↓←→↓←
          <kbd>J</kbd> GP, a grab and a beating out of sight, and <kbd>4</kbd>
          or ↓→↓→ <kbd>J</kbd> BP, a flying fist that strikes three times (a
          ring below 30% health), for a stock each, <kbd>3</kbd> or ↓→↓→
          <kbd>K</kbd>
          en300, a shock, then a hammer, for three, and, below 30% health,
          <kbd>1</kbd> or <kbd>K</kbd> <kbd>K</kbd> ← <kbd>J</kbd> <kbd>K</kbd>
          hh, a screen-wide shock into a long beating, for three.
        </p>
        <p>
          Choose Yo to play her, in a costume for most moves. <kbd>J</kbd> and
          <kbd>K</kbd> chain as Chung's do: her third punch is a pistol shot,
          her third kick a kick in a long coat, and down with <kbd>J</kbd> or
          <kbd>K</kbd> is a licker's tongue lash or a plant's lash into a
          knockdown. <kbd>H</kbd> is her Hit Up, a monster rising from the
          floor, <kbd>O</kbd> her chuck: zombie hands burst from the floor to
          hold the opponent, then a kick. Blocking with a stock, <kbd>H</kbd>
          spends it on COUNTER HIT. She has no EX mode. Her specials:
          <kbd>U</kbd> or →↓↘ <kbd>J</kbd> Dragon, a man springing out of a
          trunk with the opponent, <kbd>I</kbd> or ↓← <kbd>K</kbd> TOFU, a
          gatling burst, <kbd>F</kbd> or ←↓→ <kbd>K</kbd> ZOMBI WALK, a zombie's
          shuffle that grabs and bites the opponent, healing her, which a super
          can cancel, <kbd>G</kbd> or ↓← <kbd>J</kbd> Run in, a monster's charge
          and claw, and in the air ↓→ <kbd>J</kbd> Fire ball, a rocket. Her
          supers: <kbd>1</kbd> or ↓→↓← <kbd>J</kbd> GIGA PRESS, a charge that
          carries the opponent into the screen's edge, then slams them, and
          <kbd>3</kbd> or ↓←↓← <kbd>J</kbd> snake, a giant snake rising from the
          floor, for a stock each, <kbd>4</kbd> or ↓→↓→ <kbd>K</kbd> en300, a
          cannon blast across the screen, for three, and, below 30% health,
          <kbd>2</kbd> or ↓←↓← <kbd>K</kbd> HIDDEN, a hidden brute's rush and beating,
          for a stock.
        </p>
        <p>
          Choose SIN to play him, a shapeshifter in another guise for most
          moves. <kbd>J</kbd> and <kbd>K</kbd> chain as Chung's do: his second
          punch is a horned demon's dashing slash, his third a golden serpent's
          lunge, his second kick a sweep, then a rising kick, and his third a
          wolf's leap, and down with <kbd>J</kbd> or <kbd>K</kbd> is a chainsaw
          thrust or a low blade into a knockdown. <kbd>H</kbd> is his Hit Up,
          <kbd>O</kbd> his chuck: a masked man's grab and throw. Blocking with a
          stock, <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓ ↓
          <kbd>H</kbd> switches to EX mode for half a stock, and back, which
          swaps his stance and his grabs for other forms, and below 30% health
          he stands in a red blaze. His specials:
          <kbd>U</kbd> or ↓→ <kbd>J</kbd> S PUNCH, a dashing flurry of blasts,
          which BAKU or SUP RUN C can cancel for two stocks, <kbd>I</kbd> or ←↓→
          <kbd>J</kbd> low chuck, a hooked pole that catches the opponent's feet
          and flips them, <kbd>F</kbd> or →↓← <kbd>K</kbd> RUN CHUCK, a dashing
          grab that leaps and drops the opponent on their head (also in the
          air), <kbd>G</kbd> or ←↓→ <kbd>K</kbd> Clack chuck, a grab, a leap and
          a slam (both harder below 30% health), and ↓← <kbd>J</kbd> WOLF att, a
          wolf's leap. His supers: <kbd>1</kbd> or ↓←↓→ <kbd>J</kbd> BAKU, a
          masked brute's charge, and <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> SUP RUN
          C, RUN CHUCK into a clawed figure's slashes (also in the air), for a
          stock each, <kbd>3</kbd> or →↓←→↓← <kbd>J</kbd> EN300, a grab and
          machete cuts (in EX mode three lion-head pillars), for three, and,
          below 30% health, <kbd>4</kbd> or →↓←→↓← <kbd>K</kbd> NOZAN, a grab and
          a long beating out of sight, for three.
        </p>
        <p>
          Choose LIZARD to play him, a man in a yellow suit who becomes a
          different mecha or armor for most moves. <kbd>J</kbd> and
          <kbd>K</kbd> chain as Chung's do: his second punch is a purple mecha's
          blade slash, his third an orange-armored shield bash, his second kick
          a red mecha's spinning kick and his third a winged white mecha's
          blade, and down with <kbd>J</kbd> or <kbd>K</kbd> is a prone rifle
          shot or a low swipe into a knockdown. <kbd>H</kbd> is his Hit Up, a
          black mecha's rising lance, <kbd>O</kbd> his chuck: a blue-armored
          grab that spins the opponent away. Blocking with a stock, <kbd>H</kbd>
          spends it on COUNTER HIT. He has no EX mode. His specials:
          <kbd>U</kbd>
          or →↓↘ <kbd>J</kbd> Cross, a red mecha raising a pillar of red light,
          <kbd>I</kbd> or ↓→ <kbd>J</kbd> FIRE, a blast of red lightning, and
          <kbd>F</kbd> or ↓← <kbd>K</kbd> jump att, a purple mecha's leaping
          grab and throw (also in the air). His supers: <kbd>2</kbd> or ↓→↓←
          <kbd>J</kbd>
          chuck sup, a leap that catches an opponent in the air, swallows them in
          a giant striped sphere and drops them, <kbd>3</kbd> or ↓→↓→
          <kbd>K</kbd>
          dragon sp, a leap in a black slab's disguise whose hit calls a flight of
          white winged beasts down on the opponent, and, below 30% health,
          <kbd>1</kbd>
          or ↓←↓→
          <kbd>J</kbd> HIDDEN, a rush into a fanged maw's bite, for a stock
          each, and <kbd>4</kbd> or ↓←↓← <kbd>J</kbd> en300, a pale spirit's orb that
          bursts into a dome of light, for three.
        </p>
        <p>
          Choose KAY to play him, a monkey-faced boy who dresses up as a
          different angel or mecha for most moves. <kbd>J</kbd> chains a swipe
          of his curl, a pink-haired figure's ribbon lashes and a gold-collared
          figure's paper blades (in EX mode a lance thrown from a red cross),
          <kbd>K</kbd> a kick, a striped sphere's swallow and a gold-masked
          figure's strike (in EX mode a stretching punch), and down with
          <kbd>J</kbd> or <kbd>K</kbd> is a blue crystal's jab or a black
          figure's low sweep. <kbd>H</kbd> is his Hit Up, a fishing rod's cast,
          <kbd>O</kbd> his chuck: a nurse's syringe. Blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT, and his air guards free him
          after 6 ticks. <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> switches to EX mode
          for half a stock, and back, which swaps most of his moves for other
          forms. His specials: <kbd>U</kbd> or →↓↘ <kbd>J</kbd> air chuck, a
          spider's leap that catches only an airborne opponent and crashes down
          with them, knocking him down too (also in the air), <kbd>I</kbd> or ↓→
          <kbd>J</kbd> Fire, a spinning red lance thrown from a cross (in EX
          mode a stance, which <kbd>O</kbd> turns into a dashing grab and
          <kbd>H</kbd> a claw's beam), <kbd>F</kbd> or →↓← <kbd>K</kbd> Counter,
          a twin-colored stance that splits in two and slashes whoever strikes
          it, <kbd>G</kbd> or ←↓→ <kbd>K</kbd> Comment chuck, a clawed black
          figure's grab (harder below 30% health; in EX mode a pink figure's
          whips), and ↓← <kbd>J</kbd> or <kbd>K</kbd> 12P and 12K, black arms
          bursting from the ground at two distances (in EX mode a pillar of
          light at one, a decoy at the other). His supers: <kbd>2</kbd> or ↓→↓→
          <kbd>K</kbd>
          KAORU, a silver-haired boy's low grab into a long scene with a giant purple
          hand, and <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd> SUPER P, a wound-up
          stretching punch, for a stock each (after Counter's slash either
          cancels for two), and <kbd>1</kbd> or ↓←↓← <kbd>J</kbd> en300, a purple
          mecha's grab and berserk mauling, for three; in EX mode they become a ribbon-armed
          figure's slashes, a blue crystal's beam and the mecha's claw wave.
        </p>
        <p>
          Choose DIDO to play her, a blonde girl in a black dress who dresses up
          as a different armored figure or mecha for most moves.
          <kbd>J</kbd> chains an axe's swing, a red-armored figure's flying kick
          and a blue mecha's lance lunge, <kbd>K</kbd> a kick, a blue hover
          scooter's ram and an orange-armored figure's trident, and down with
          <kbd>J</kbd> or <kbd>K</kbd> is a sheep costume's crawl or a blue
          tail's low sweep; → with <kbd>K</kbd> is a tiger-striped figure's
          dashing strike, and ↑ during a forward dash a long jump.
          <kbd>H</kbd> is her Hit Up, a maid's swing, <kbd>O</kbd> her chuck: a
          green arm cannon's grab. Blocking with a stock, <kbd>H</kbd> spends it
          on COUNTER HIT. Her specials: <kbd>U</kbd> or ↓→ <kbd>K</kbd> slid, a
          low dive on a white jet sled, <kbd>I</kbd> or ↓→ <kbd>J</kbd> fire, a
          gold-winged figure's blue flames (in the air a purple winged figure's,
          harder below 30% health), <kbd>F</kbd> or ↓←
          <kbd>K</kbd> RAiden, a grey mecha's claw strike that <kbd>K</kbd>
          keeps striking, and <kbd>G</kbd> or ↓← <kbd>J</kbd> doge, a pink
          heart-armored figure's dash, low enough to pass under most strikes.
          Her supers, for a stock each: <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> Temjin
          fly, a white-suited girl surfing a giant blade (also in the air),
          <kbd>3</kbd> or ↓←↓← <kbd>K</kbd> dragon super, a hooded figure's blue
          lightning dragon coiling around her, and <kbd>4</kbd> or ↓→↓→
          <kbd>J</kbd> Raiden, a red mecha's barrage fired diagonally up the
          screen; for three, <kbd>5</kbd> or ↓←↓→ <kbd>J</kbd> EN300, a purple
          winged mecha's dash whose catch sends giant hands sweeping across the
          stage behind her, and, below 30% health, <kbd>1</kbd> or ↓←↓→
          <kbd>K</kbd> Hidden En300, a white-robed girl's magic circle whose catch
          plays a long scene of wings and water (slid otherwise).
        </p>
        <p>
          Choose SAKUYA to play her, a brown-haired girl in purple who dresses
          up as a different swordswoman, armored figure or mecha for most moves.
          <kbd>J</kbd> chains her sword's slash, a pink-kimono swordswoman's
          slash and a silver-armored figure's red blades, <kbd>K</kbd> a kick, a
          red-dressed girl's crossbow and a red-armored figure's chain claw that
          catches the opponent far out and pulls them back up; down with
          <kbd>J</kbd> or <kbd>K</kbd> is a red-clad girl's jab or a purple
          maid's scythe sweep. <kbd>H</kbd> is her Hit Up, a giant teddy bear,
          <kbd>O</kbd> her chuck, a scythe's grab. Blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓ ↓
          <kbd>H</kbd> enters or leaves EX mode for half a stock, where most of
          her moves take other forms. Her specials: <kbd>U</kbd> or →↓↘
          <kbd>J</kbd> Dragon punch, rising on white wings, <kbd>I</kbd> or ↓→
          <kbd>J</kbd> FIRE, a fireball (also in the air), <kbd>F</kbd> or ↓←
          <kbd>J</kbd> iori, a dashing slash with two follow-ups on ↓←
          <kbd>J</kbd>, <kbd>G</kbd> or →↓← <kbd>K</kbd> counter, a stance that
          grabs and throws whoever strikes her, <kbd>4</kbd> or →↓↘
          <kbd>K</kbd> DRAGON KICK, a dash with red blades, <kbd>5</kbd> or ↓→
          <kbd>K</kbd>
          LOW FIRE, a low staff sweep, and ←↓→ <kbd>K</kbd> C C, a blade rush
          that ↓→ <kbd>K</kbd> or <kbd>J</kbd> turns into a mounted rider's
          charge. Her supers, for a stock each: <kbd>2</kbd> or ↓→↓→
          <kbd>K</kbd>
          super HIT UP, a swing that calls an airship (in the air a mecha's diving
          dash), and <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd>
          SPARK, a horned mecha girl's blade dash; for three, <kbd>1</kbd> or
          ↓←↓→ <kbd>J</kbd> en300, a swordswoman's dash whose catch turns into a mecha
          girl's blade combo.
        </p>
        <p>
          Choose ALEX to play him, a boy in a cap who dresses up as a different
          armored hero or mecha for most moves. <kbd>J</kbd> chains a jab, a
          red-armored figure's sword sweep and a grey-armored figure's lance
          gun,
          <kbd>K</kbd> a kick, a yellow-armored figure's twin daggers and a
          blue-armored figure's bow; down with <kbd>J</kbd> or <kbd>K</kbd> is a
          red lance's jab or sweep. <kbd>H</kbd> is his Hit Up, an uppercut,
          <kbd>O</kbd> his chuck, a drill lance's grab. Blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT. <kbd>E</kbd> or ↓ ↓
          <kbd>H</kbd> enters or leaves EX mode for half a stock, where most of
          his moves take other forms. His specials: <kbd>U</kbd> or →↓↘
          <kbd>J</kbd> dragon, a rising drill lance, <kbd>I</kbd> or ↓→
          <kbd>J</kbd> in the air, a pink-armored archer's arrow, <kbd>F</kbd>
          or ↓→ <kbd>K</kbd> REFLACT, an arm shield that turns an incoming
          projectile back, <kbd>G</kbd> or →↓← <kbd>K</kbd> counter, a stance
          that slashes back at whoever strikes him, and <kbd>4</kbd> or →←↓→
          <kbd>J</kbd>
          HAOU, a combined blaster's shot. His supers, for a stock each:
          <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> GYSA, a red-horned mecha's three
          sword strikes, and <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd> super fire, a red
          dinosaur tank's cannon; for three, <kbd>1</kbd> or ↓←↓←
          <kbd>K</kbd> en300, which summons a white mecha dragon.
        </p>
        <p>
          Choose SOU to play him, a boy in a white headband who dresses up as a
          black-armored mecha or a helmeted pilot for most moves. <kbd>J</kbd>
          chains a jab, a soldier's punch and the mecha's arm punch,
          <kbd>K</kbd> a short sword's slash, the mecha's scythe sweep and a
          gunman's pistol shot; down with <kbd>J</kbd> or <kbd>K</kbd> is a
          red-helmed figure's punch or a yellow-helmed one's. <kbd>H</kbd> is
          his Hit Up, the pilot's uppercut, <kbd>O</kbd> his chuck, the mecha's
          grab. Blocking with a stock, <kbd>H</kbd> spends it on COUNTER HIT.
          <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> enters or leaves EX mode for half a
          stock, where most of his moves take other forms, calling beast mechas
          among them. His specials: <kbd>U</kbd> or →↓↘ <kbd>K</kbd> AKUMA jump,
          a leap that <kbd>J</kbd> or <kbd>K</kbd> turns into a diving punch or
          a flying kick (in EX mode the mecha's rising uppercut),
          <kbd>I</kbd> or ↓→ <kbd>K</kbd> Fire Kick, the mecha's low rifle shot
          (in the air a flying kick; in EX mode it calls a black panther),
          <kbd>F</kbd> or ↓← <kbd>J</kbd> IORI, the mecha's sword slashes,
          chained on ↓← <kbd>J</kbd>, <kbd>G</kbd> or ↓→ <kbd>J</kbd> BK, the
          mecha's dashing punch (in EX mode it calls a yellow lion, or in the
          air an eagle jet the pilot hangs from, steered with the directions for
          up to five seconds and dropped with <kbd>J</kbd>, <kbd>K</kbd> or
          <kbd>O</kbd>), ↓← <kbd>K</kbd> MID SLASS, the mecha's sword slash (in
          EX mode a leaping ground slam), and ↓→ <kbd>H</kbd> HIDDEN A, a quick
          step (in EX mode it calls a white mammoth). His supers, for a stock
          each: <kbd>2</kbd> or ↓→↓← <kbd>K</kbd> Command 1, the mecha's punch
          rush, <kbd>4</kbd> or ↓→↓→ <kbd>K</kbd> SPARK, a dive as a black jet
          (also in the air), and <kbd>5</kbd> or ↓→↓→ <kbd>J</kbd>
          DANKU SHOT, the mecha's shoulder cannons; for three, <kbd>3</kbd> or
          ↓←↓← <kbd>J</kbd> Beast att, the lion, panther and mammoth charging in
          turn, and, below 30% health, <kbd>1</kbd> or <kbd>O</kbd>
          <kbd>J</kbd> ← <kbd>K</kbd> <kbd>H</kbd> KOKAKEN, the pilot's sword dash.
        </p>
        <p>
          Choose HISO to play him, a boy in a red sleeveless top who dresses up
          as a different character for most moves. <kbd>J</kbd> chains a jab, a
          suited man's pointing jab and a girl in glasses swinging a vacuum
          cleaner's toothed hose, <kbd>K</kbd> a kick, a clown-faced boy's
          thrown rock and a muscled brawler's punch; down with <kbd>J</kbd> or
          <kbd>K</kbd> is a samurai's sword slash or the brawler's punch.
          <kbd>H</kbd> is his Hit Up, an uppercut, <kbd>O</kbd> his chuck, the
          clown-faced boy's grab and sliding kick. Blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT. He has no EX mode. His
          specials:
          <kbd>U</kbd> or →↓↘ <kbd>J</kbd> Dragon p, a samurai's rising sword
          slashes (also in the air), <kbd>I</kbd> or ↓→ <kbd>J</kbd> FIRE, the
          clown-faced boy's thrown card, <kbd>F</kbd> or ↓← <kbd>J</kbd>
          bannaku, a headbanded knife fighter's dashing slash, which a super cancels
          for two stocks, <kbd>G</kbd> or →↓← <kbd>K</kbd> counter, a stance
          with a phone: struck in it, a machine-gun man fires back, and
          <kbd>5</kbd>
          or ↓→ <kbd>K</kbd> striker, a gunwoman behind him whose shot holds
          whoever it meets still. His supers, for a stock each: <kbd>1</kbd> or
          ↓←↓←
          <kbd>K</kbd> FISH, a suited man's red book whose fish spirit seizes
          the opponent up close, <kbd>3</kbd> or ↓←↓← <kbd>J</kbd> fly arm, the
          clown-faced boy's flying fists up close, and <kbd>4</kbd> or ↓→↓→
          <kbd>J</kbd> S Shoot, a blue-coated boy's palm blast; for three,
          <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> en300, a shirtless, tattooed man who calls
          a dark giant.
        </p>
        <p>
          Choose ERUS to play her, a blond figure in a black coat and white
          bandeau who dresses up as a different character for most moves.
          <kbd>J</kbd> chains a chain swing, a blue-robed figure's chain whip
          and a suited man's knife thrust, <kbd>K</kbd> a kick, a spiky-haired
          boy's sliding kick and the suited man's briefcase swing; down with
          <kbd>J</kbd> or <kbd>K</kbd> is a green-clad boy's slab strike or a
          cap-wearing figure's sword slash. <kbd>H</kbd> is her Hit Up, a girl
          in a red dress's rising punch, <kbd>O</kbd> her chuck, the blue-robed
          figure's chains. Blocking with a stock, <kbd>H</kbd> spends it on
          COUNTER HIT. <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> enters or leaves EX mode
          for a stock, where most of her moves take other forms. Her specials:
          <kbd>U</kbd>
          or →↓↘ <kbd>J</kbd> INATUMA, the spiky-haired boy's electric strike,
          <kbd>I</kbd>
          or ↓→ <kbd>J</kbd> VO5, the green-clad boy's punch (in the air he
          hurls a boulder; in EX mode she calls two headbanded boys who drop in
          and charge), <kbd>F</kbd> or ↓→ <kbd>K</kbd> Coin, the suited man's
          flicked coin, seven in all before every other press fails (in EX mode
          she calls a white-haired scythe fighter from a portal), <kbd>G</kbd>
          or →↓← <kbd>K</kbd>
          COUNTER, the girl's stance: struck in it, she hits back (in EX mode a book
          that also answers specials), and ↓← <kbd>J</kbd>,
          <kbd>K</kbd> or both TELP, the spiky-haired boy's blur step. Her
          supers, for a stock each: <kbd>2</kbd> or ↓→↓← <kbd>J</kbd> lizard
          fly, the spiky-haired boy's flying grab, which catches only an
          opponent in the air, <kbd>3</kbd> or ↓←↓← <kbd>K</kbd> SCC, his rush
          up close, and <kbd>5</kbd> or ↓→↓→ <kbd>J</kbd> Super slash, the
          cap-wearing figure's scythe slash; for three, <kbd>4</kbd> or ↓→↓→
          <kbd>K</kbd> EN300, a headbanded boy's punch rush, and, below 30%
          health, <kbd>1</kbd> or ↓→↓← <kbd>K</kbd> コマンド 3, a card that heals
          her or drops planks on the opponent.
        </p>
        <p>
          Choose OS FENG to play him, a blue-haired boy in glasses and a red
          vest who dresses up as a different character for most moves.
          <kbd>J</kbd> chains a jab, a white-shirted fighter's crescent slash
          and a white-coated man's pistol shot, <kbd>K</kbd> a kick, a
          green-capped figure's high kick and a red-bandannaed fighter's kicks;
          down with <kbd>J</kbd> or <kbd>K</kbd> is a headbanded figure's double
          stab or a white-clad figure's slide with a black hound.
          <kbd>H</kbd> is his Hit Up, a blond girl in a white kimono's rising
          punch, <kbd>O</kbd> his chuck, a shirtless man in sunglasses who turns
          the opponent into a strawberry shortcake. Blocking with a stock,
          <kbd>H</kbd> spends it on COUNTER HIT. ↑ during a forward dash is a
          High Jump. <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> enters or leaves EX mode
          for half a stock, where dragon, ICE punch, sshoot and the chuck take
          other forms. His specials: <kbd>U</kbd> or →↓↘ <kbd>K</kbd> dragon, a
          black-pompadoured man's punch, <kbd>I</kbd> or ↓→ <kbd>J</kbd> Fire, a
          winged girl's arrow (in the air an orange-headbanded boy throws a
          yellow spirit), <kbd>F</kbd> or ↓← <kbd>J</kbd> iori, a black-clad
          fighter's spear thrust, which ↓← <kbd>J</kbd> again takes on to a
          hooked blade and a sword, <kbd>G</kbd> or ↓← <kbd>K</kbd> bp, the
          sunglassed man's clawed lunge, and <kbd>4</kbd> or ←↓→ <kbd>K</kbd>
          SUCK, a white-robed archer's line that reels the opponent in. Below 30%
          health his crouching punch, iori's sword and bp take their Evil forms. His
          supers, for a stock each: <kbd>2</kbd> or ↓←↓→
          <kbd>K</kbd> ICE punch, a black-robed fighter's dashing punch that
          looses an ice wolf, and <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd> sshoot, a
          blond-pigtailed girl's cannon; for three, <kbd>1</kbd> or ↓→↓→
          <kbd>K</kbd> EN300, an orange-haired swordsman in red armour. A super cancels
          iori for two stocks.
        </p>
        <p>
          Choose SEAN to play him, a bald old monk in green robes and prayer
          beads who calls up a different character for most moves.
          <kbd>J</kbd> chains a jab, a blue-haired girl's triple strike and a
          red-haired fighter's dive, <kbd>K</kbd> a kick, a white-armoured
          figure's exploding seal and a dark-clad swordsman's vortex dash; down
          with <kbd>J</kbd> or <kbd>K</kbd> is a cloaked figure's sweep or a
          horned figure's low kick. In the air <kbd>J</kbd> is a spiky-haired
          swordsman's dive and <kbd>K</kbd> a kick from a figure in a white
          hood. <kbd>H</kbd> is his Hit Up, <kbd>O</kbd> his chuck, a chubby
          pigtailed figure's long tongue. Blocking with a stock, <kbd>H</kbd>
          spends it on COUNTER HIT. ↑ during a forward dash is a High Jump. His specials:
          <kbd>U</kbd>
          or →↓↘ <kbd>J</kbd> Dragon, a small red-robed man's crescent,
          <kbd>I</kbd>
          or ↓→ <kbd>J</kbd> whip attack, an eye-patched man's five whips (<kbd
            >F</kbd
          >
          or ↓→
          <kbd>K</kbd> lashes farther off), and <kbd>G</kbd> or ↓←
          <kbd>K</kbd> CC, an elf-eared hooded figure's red card, a grab that
          also works in the air. His supers, for a stock each: <kbd>2</kbd> or
          ↓←↓← <kbd>J</kbd> SCC, an old man in yellow robes whose grab reaches
          across the screen, and <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd> S Shoot, the
          swordsman's crescent wave, which below 30% health takes its Evil form;
          for three, <kbd>1</kbd> or ↓→↓→ <kbd>K</kbd> EN300, a rider on a yellow
          beast who calls down lightning. A super cancels Dragon for two stocks.
        </p>
        <p>
          Choose GON to play him, a brown-haired boy with goggles on his head
          who puts on a different creature's costume for most moves.
          <kbd>J</kbd> chains a jab, a yellow armoured beast's claw charge and a
          green robot's low grab, <kbd>K</kbd> a kick, a yellow fox's spinning
          tail and a blue dinosaur's dashing punch; down with <kbd>J</kbd> or
          <kbd>K</kbd> is a blue wolf's spinning uppercut or a blue-hooded
          dragon's low kick. In the air <kbd>J</kbd> is the blue dinosaur's
          diving claw and <kbd>K</kbd> a green insect's kick. <kbd>H</kbd> is
          his Hit Up, a dark winged demon's claws, <kbd>O</kbd> his chuck, a
          blue metal dinosaur's jaws. Blocking with a stock, <kbd>H</kbd> spends
          it on COUNTER HIT. ↑ during a forward dash is a High Jump.
          <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> enters or leaves EX mode for half a
          stock, where his P2, P3, K1, crouching and air punches, Hit Up,
          specials and supers take other forms. His specials: <kbd>U</kbd> or
          →↓↘ <kbd>J</kbd> DRAGON, a lion-maned figure's rising sword, which →↓↘
          <kbd>J</kbd>
          again takes on to Evil Dragon, <kbd>I</kbd> or ↓→ <kbd>J</kbd> fire
          ball, an orange armoured dragon's dark crescent (in the air a winged
          gunner's lightning ball), <kbd>F</kbd> or ↓← <kbd>J</kbd> DRILL, the
          yellow beast's spinning dive, also in the air,
          <kbd>G</kbd> or →↓← <kbd>K</kbd> COUNTER, a 0.4-second stance: struck
          in it, he takes double damage, then strikes back in three costumes,
          and ↓→ <kbd>K</kbd> dash move, the yellow beast's charge. Below 30%
          health K2 takes its Evil form. His supers, for a stock each:
          <kbd>2</kbd> or ↓←↓← <kbd>J</kbd> KURENCOUNTER, a caped lancer's
          stance that counters a hit, and <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd>
          Super heart, a yellow teddy bear's breaking heart; for three,
          <kbd>1</kbd> or ↓→↓→ <kbd>K</kbd> EN300, a golden armoured beast's
          exploding sun, and, only below 30% health, <kbd>4</kbd> or
          <kbd>H</kbd> ↓ ↓ <kbd>J</kbd> <kbd>O</kbd> Hidden en300, an orange-haired
          girl who calls a white-caped knight with him. Super heart or KURENCOUNTER
          cancels DRILL for two stocks.
        </p>
        <p>
          Choose KATE to play her, a blue-haired girl in a pink top who, like
          GON, puts on a different costume for most moves. <kbd>J</kbd> chains a
          jab, a blue-robed priest's staff thrust and a purple-eared
          swordswoman's crescent cut, <kbd>K</kbd> a kick, a green-masked
          swordsman's slash and a white-winged knight's low lance thrust that
          pins the opponent; down with <kbd>J</kbd> or <kbd>K</kbd> is a
          pink-helmeted girl's spitting pet or a green-robed lancer's low
          thrust. In the air <kbd>J</kbd> is a broadsword's downward cut and
          <kbd>K</kbd> a red-clad fighter's kick. <kbd>H</kbd> is her Hit Up, a
          white-robed figure's trident, which ↑ chases into the air after a hit,
          <kbd>O</kbd>
          her chuck, a white-suited figure's red crosshairs. Blocking with a stock,
          <kbd>H</kbd>
          spends it on COUNTER ATT. Her specials:
          <kbd>U</kbd>
          or →↓↘ <kbd>J</kbd> neko punch, a cat girl's rising paw, <kbd>I</kbd>
          or ↓→ <kbd>J</kbd> Air fire: in the air a turquoise mage leaves a blue
          star hovering for 6 seconds, and on the ground her af add strikes and
          drops it onto whoever is below (↓→
          <kbd>K</kbd> sends it down at a slant), <kbd>F</kbd> or ↓←
          <kbd>J</kbd> DASH ATTACK, a ninja's dagger dash through the opponent,
          who is struck five more times behind her (in the air a diving kick),
          and <kbd>G</kbd> or →↓← <kbd>K</kbd> Counter, a 0.3-second stance with
          a winged girl's axe: struck in it, she takes 30% of the damage and
          swings it. Her supers, for a stock each: <kbd>2</kbd> or ↓←↓←
          <kbd>J</kbd> SLASH SUPER, an archer's arrow that brings her lunging in
          with a halberd when it strikes (below 30% health its Evil form), and
          <kbd>3</kbd> or ↓→↓→ <kbd>J</kbd> BEAM, a red-clad fighter's long
          beam; for three, <kbd>1</kbd> or ↓→↓→ <kbd>K</kbd> en300, a goggled sorcerer's
          yellow spirits. BEAM or SLASH SUPER cancels af add for two stocks.
        </p>
        <p>
          Choose REMU to play him, a long-haired blond fighter in a teal jacket
          who, like GON and KATE, puts on a different costume for most moves.
          <kbd>J</kbd> chains a jab, a blue-helmeted hero's lunging punch in red
          and white armour and his leaping grab, which beats the opponent,
          <kbd>K</kbd> a kick, the hero's two kicks and his flying kick; down
          with <kbd>J</kbd> or <kbd>K</kbd> is a blue-armoured swordsman's low
          cut or the hero's sliding kick. In the air <kbd>J</kbd> is the
          swordsman's cut and <kbd>K</kbd> the hero's kick. <kbd>H</kbd> is his
          Hit Up, the hero's uppercut, which ↑ chases into the air after a hit,
          <kbd>O</kbd> his chuck, a white and red horned robot's punches.
          Blocking with a stock, <kbd>H</kbd> spends it on Counter Hit. His
          specials: <kbd>U</kbd> or →↓↘ <kbd>J</kbd> tatsumaki, the swordsman's
          swing that calls a grey whirlwind, <kbd>I</kbd> or ↓→ <kbd>J</kbd>
          slash, the swordsman's dashing cut (in the air a diving one, which slash
          again on landing after a hit follows with a quicker cut),
          <kbd>F</kbd> or ↓← <kbd>J</kbd> JET, the hero's call for a jet-backed
          robot's charging blade, <kbd>G</kbd> or ↓← <kbd>K</kbd> Drill, his
          call for a drill that bursts from the ground, and <kbd>3</kbd> or ↓←↓←
          <kbd>J</kbd>
          BAKURETU, the swordsman's thrust that fires a yellow beam. His supers, for
          a stock each: <kbd>5</kbd> or ↓→↓→
          <kbd>J</kbd> Thander p, the robot's lightning-charged dashing punch,
          <kbd>4</kbd> or ↓→↓→ <kbd>K</kbd> Phsy driver, the robot's leaping
          kick into a piledriver, and, only at 155 health or less (else it is
          Drill), <kbd>2</kbd> or ↓←↓← <kbd>K</kbd> MINAMI, a 1-second stance as
          the hero: struck in it, he takes 30% of the damage and strikes back;
          for three, <kbd>1</kbd> or ↓←↓→ <kbd>K</kbd> GOLD HAND, the robot's climb
          and dive with a golden hand, which lands well ahead of him, into a long
          beating. Thander p, Phsy driver or MINAMI cancels tatsumaki for two stocks.
        </p>
        <p>
          Choose REAR to play him, a masked blond fighter in a grey gi who, like
          GON, KATE and REMU, puts on a different costume for most moves.
          <kbd>J</kbd> chains a jab, a horned red robot's drill-armed thrust and
          its spinning strikes, <kbd>K</kbd> a kick, a purple and blue robot's
          low kicks and its kick that sends a green whirlwind along the floor;
          down with <kbd>J</kbd> or <kbd>K</kbd> is the red robot's thrust or
          the purple robot's beast-headed punch. In the air <kbd>J</kbd> is a
          green-chested robot's punch and <kbd>K</kbd> the purple robot's kick.
          <kbd>H</kbd> is his Hit Up, a blue horse's horn, which ↑ chases into
          the air after a hit, <kbd>O</kbd> his chuck, a purple serpent's grab.
          Blocking with a stock, <kbd>H</kbd> spends it on COUNTER ATT. His
          specials: <kbd>U</kbd> or →↓↘ <kbd>K</kbd> SAMA, the purple robot's
          rising shield punch (also in the air), <kbd>I</kbd> or ↓→
          <kbd>J</kbd> Fire ball, the red robot's fireball, <kbd>F</kbd> or ↓←
          <kbd>K</kbd> DOWN ATTACK, a long leap that strikes as he lands, over a
          near opponent's head, and <kbd>G</kbd> or ↓← <kbd>J</kbd> VIPER WHIP,
          the red robot's whip. His supers, for a stock each: <kbd>1</kbd> or
          ↓←↓→ <kbd>J</kbd> GYSA, the red robot's hammer that raises a pink
          crystal ahead of him (below 30% health its Evil form, three crystals),
          and <kbd>2</kbd> or ↓→↓→ <kbd>J</kbd> VIPER FINAL, a long whip that
          catches the opponent for a purple blast; for three, <kbd>3</kbd> or
          ↓→↓→ <kbd>K</kbd> en300, a giant sword's slashes, which miss an
          opponent standing close. Only below 30% health and with three stocks,
          <kbd>4</kbd> or <kbd>H</kbd> <kbd>K</kbd> → <kbd>J</kbd>
          <kbd>O</kbd> evil en3 spends one on a green clock shot; when it strikes
          he spends the other two, takes a winged form and fires seven beams. Fire
          ball cancels into GYSA or VIPER FINAL for two stocks.
        </p>
        <p>
          Choose GIGI to play him, a big-headed grunt in a black mask with an FK
          crest and a skeleton-striped suit. <kbd>J</kbd> chains a jab, a
          lunging punch and a dash past the opponent that grabs them from behind
          and flips them over, <kbd>K</kbd> a kick, a high kick and a hopping
          kick; down with <kbd>J</kbd> or <kbd>K</kbd> is a leaping punch or a
          low drop kick. <kbd>H</kbd> is his Hit Up, a rolling headbutt, which ↑
          chases into the air after a hit, <kbd>O</kbd> his chuck, a grab that
          leaps up with the opponent and slams them down. Blocking with a stock,
          <kbd>H</kbd> spends it on Counter Hit (after a heavy standing block,
          <kbd>J</kbd> and <kbd>K</kbd> together). <kbd>E</kbd> or ↓ ↓
          <kbd>H</kbd> enters or leaves his Change form for half a stock, which
          swaps his specials and two supers. His specials: <kbd>U</kbd> or →↓↘
          <kbd>J</kbd> Dragon, a rising spin, also in the air (Change: Jump att,
          a leap that grabs the opponent's head), <kbd>I</kbd> or ↓→
          <kbd>J</kbd> K', a rifle butt that → <kbd>J</kbd> follows with a shot
          or → <kbd>K</kbd> with a swing (Change: Chuck ECC, a tumbling toy
          robot that bursts), <kbd>F</kbd> or ↓← <kbd>J</kbd> DIVE, sinking into
          the floor, where ← and → move him and <kbd>J</kbd> or <kbd>K</kbd>
          comes up striking (Change: GIGI P, a rushing punch that ↓←
          <kbd>J</kbd> or <kbd>K</kbd> chains on), and <kbd>G</kbd>,
          <kbd>4</kbd>
          or <kbd>5</kbd>, or ↓ ↓ <kbd>J</kbd>, <kbd>K</kbd> or both, Bike Doge
          D, a charge or a leap on an orange motorbike, also in the air (Change:
          Doge D, sinking into the floor to come up ahead or where he stands).
          His supers, for a stock each: <kbd>1</kbd> or ↓→↓→ <kbd>J</kbd> Ranbu,
          a punch flurry whose last blow ↑ or ↓ turns into a rising or a low
          strike (Change: Bean, a ray gun's beam across the screen, which misses
          an opponent standing close), and <kbd>2</kbd> or ↓→↓← <kbd>K</kbd> S
          chuck, a grab and a beating (Change: Counter, a stance: struck in it,
          he kicks back); for three, <kbd>3</kbd> or ↓→↓→ <kbd>K</kbd> EN3, a stampede
          of GIGIs led by a blonde masked woman. Bike Doge D P cancels into Ranbu
          or S chuck, and GIGI P into Bean or Counter, for two stocks.
        </p>
        <p>
          Choose SWW to play him, a red-haired boy in a red shirt who changes
          into a different suit of armour for each move, and into gold armour at
          30% life or less. <kbd>J</kbd> chains a jab, a lunging punch and a
          dash through the opponent that leaves a flurry of blows behind them,
          <kbd>K</kbd> a kick, a high kick and a long chain lash; down with
          <kbd>J</kbd> or <kbd>K</kbd> is a flaming punch or a sliding sweep.
          <kbd>H</kbd> is his Hit Up, a rising punch, which ↑ chases into the
          air after a hit, <kbd>O</kbd> his chuck, a grab and a throw. Blocking
          with a stock, <kbd>H</kbd> spends it on Counter Hit. <kbd>E</kbd> or ↓
          ↓ <kbd>H</kbd> enters or leaves EX mode for half a stock, which swaps
          his specials and three supers. His specials: <kbd>U</kbd> or →↓↘
          <kbd>J</kbd> Dragon P, a rising uppercut (EX: a flying knee),
          <kbd>I</kbd> or ↓← <kbd>J</kbd> ICE Punch, a punch with an ice spark
          (EX: a dash through the opponent), <kbd>F</kbd> or ↓← <kbd>K</kbd>
          Chain att, a chain lash across the screen, which again within a moment of
          a hit lashes once more (EX: EX Chain, a spinning chain: struck in it, he
          lashes back), and <kbd>G</kbd> or ↓→ <kbd>J</kbd> Ryuseiken, a punch
          flurry that ↓→ <kbd>J</kbd> follows with a dashing one, in the air a
          flaming bird (EX: fists of light flying across the screen). His
          supers, for a stock each: <kbd>1</kbd> or ↓→↓→ <kbd>J</kbd> SUPER RSK,
          a flurry under a winged horse (EX: Gysa, an ice blast that flies past
          an opponent standing close), <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> GOD
          DRAGON, charging uppercuts (EX: a rising dragon), and <kbd>3</kbd> or
          ↓←↓← <kbd>J</kbd> COUNTER CHAIN, a stance: struck in it, he lashes
          back (EX: a dashing chain lash); for three, <kbd>4</kbd> or ↓←↓→
          <kbd>J</kbd> EN300, a winged charge across the whole screen, and at
          30% life or less <kbd>5</kbd> or ↓←↓← <kbd>K</kbd> Healing, which
          restores 160 life. Also at 30% or less, <kbd>J</kbd> <kbd>J</kbd> →
          <kbd>K</kbd> <kbd>J</kbd> is ROLL CRASH, for two stocks: a grab that leaps
          and crashes down, knocking out both fighters. Ryuseiken cancels into SUPER
          RSK, GOD DRAGON or COUNTER CHAIN for two stocks.
        </p>
        <p>
          Choose OGI to play him, a white-haired, green-armed strongman who
          suits up in a different robot armour, or a caped red coat, for most
          moves.
          <kbd>J</kbd> chains three punches, a thrown hook and a dash with a
          chain whip, <kbd>K</kbd> a kick, a dashing slash and a grab into a
          beating (at 30% life or less a longer one); down with <kbd>J</kbd> or
          <kbd>K</kbd> is a long shield thrust or a burst of blasts.
          <kbd>H</kbd> is his Hit Up, a rapier lunge, which ↑ chases into the
          air after a hit, <kbd>O</kbd> his chuck, a grab and a throw. Blocking
          with a stock, <kbd>H</kbd> spends it on Counter Hit. He has no EX
          mode. His specials: <kbd>U</kbd> or →↓↘ <kbd>J</kbd> Dragon, a rising
          claw, <kbd>I</kbd> or ↓← <kbd>J</kbd> Crush attack, a shield-bash dash
          (in the air a dive), <kbd>F</kbd> or ↓← <kbd>K</kbd> Rose attack, a
          rose tossed in a high arc that lands far off, taking 35 power,
          <kbd>G</kbd> or ↓→ <kbd>J</kbd> fire p, a straight cannon shot, and
          <kbd>5</kbd> or ↓→ <kbd>K</kbd> FIRE K, a cannon shell that bounces
          along. His supers, for a stock each: <kbd>1</kbd> or ↓→↓→
          <kbd>J</kbd> s shoot, a giant cannon blast, also in the air,
          <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> SCC, close a grab and a beam-saber
          stab, which ↓→ <kbd>K</kbd> follows with an uppercut and → ↓ ←
          <kbd>K</kbd> with a throw, farther a leap into a beating, and
          <kbd>3</kbd> or ↓←↓← <kbd>J</kbd> S Crush, a shield-bash dash and four
          more; for three, <kbd>4</kbd> or ↓←↓→ <kbd>J</kbd> EN300, a blast thrown
          in a high arc that flies over a close opponent but drops short near a wall.
          fire p cancels into s shoot, SCC or S Crush for two stocks.
        </p>
        <p>
          Choose ZIRO to play him, a teal-haired young man who calls up a
          different robot suit, winged, caped, horned or heavily armed, for most
          moves. <kbd>J</kbd> chains a punch, a caped robot's scythe swing and a
          dragon-armed robot's trident flurry, <kbd>K</kbd> a kick, a gunner
          robot's spinning volley and a horned robot's whip; down with
          <kbd>J</kbd> or <kbd>K</kbd> is a gatling volley or a low whip.
          <kbd>H</kbd> is his Hit Up, a girl's rising kick, which ↑ chases into
          the air after a hit, <kbd>O</kbd> his chuck, a grab and a throw.
          Blocking with a stock, <kbd>H</kbd> spends it on Counter Hit.
          <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> enters or leaves EX mode for half a
          stock, which swaps his specials and supers. His specials:
          <kbd>U</kbd> or →↓↘ <kbd>K</kbd> Fire Ball, a shell that speeds up as
          it flies, two at 30% life or less (EX: a winged robot's rising slash),
          <kbd>I</kbd> or ←↓↙ <kbd>J</kbd> nataku p, a dragon arm thrust up and
          out, or ←↓↙ <kbd>K</kbd> straight out (EX: a cloaked robot's charge),
          <kbd>F</kbd>
          or ↓← <kbd>K</kbd> telepot, vanishing under a dark cloak to come out
          past the opponent, or with ↓← <kbd>J</kbd> into the air,
          <kbd>G</kbd> or ↓→ <kbd>J</kbd> IORI3HIT, a winged robot's dashing
          slash that ↓→ <kbd>J</kbd> follows twice more, in the air a shot down
          at the floor (EX: a fire ball; in the air a spin), and <kbd>5</kbd> or
          ←↓→ <kbd>K</kbd> CC, a grab into blows and a leaping slam (EX: a
          trident flurry). His supers, for a stock each: <kbd>1</kbd> or ↓→↓→
          <kbd>K</kbd> MISS ALL, a gunner robot's barrage of bullets and
          missiles (EX: a winged robot's beam), and <kbd>2</kbd> or ↓→↓←
          <kbd>J</kbd> RAMBU, a dash into a rush of blows from each robot (EX: a
          grab into one); for three, <kbd>3</kbd> or ↓←↓→ <kbd>J</kbd> EN300, a
          winged robot rising to rain beams down, also in the air (EX: a diving
          slash), and below 30% life <kbd>4</kbd> or a full turn of the stick
          and <kbd>J</kbd> TWIN SHOT, twin beams swept round the whole screen (otherwise
          the CC). nataku cancels into MISS ALL or RAMBU for two stocks.
        </p>
        <p>
          Choose MASA to play him, a blond pilot in red armour who swings a
          purple axe and swells into a bigger robot for his heaviest blows.
          <kbd>J</kbd> or <kbd>K</kbd> swings the axe, which <kbd>J</kbd> or
          <kbd>K</kbd> again at once swings twice, then <kbd>J</kbd> a third
          time or <kbd>K</kbd> into a leaping chop; down with <kbd>J</kbd> or
          <kbd>K</kbd> is a grenade that bounces along the floor or a low axe
          sweep, and in the air <kbd>J</kbd> or <kbd>K</kbd> an axe swing or a
          gun shot. <kbd>H</kbd> is his Hit Up, a rising axe slash, which ↑
          chases into the air after a hit, <kbd>O</kbd> his chuck, a grab into
          the big robot's blows. Blocking with a stock, <kbd>H</kbd> spends it
          on Counter Attack. His specials: <kbd>U</kbd> or →↓↘ <kbd>J</kbd>
          SHORYU, a rising uppercut that →↓↘ <kbd>J</kbd> follows twice more,
          also in the air, <kbd>I</kbd> or ↓→ <kbd>K</kbd> 3Fire, a kick that
          fires a missile, a second and third with → and <kbd>K</kbd>,
          <kbd>F</kbd> or ↓← <kbd>J</kbd> 3HIT, an axe rush that ↓←
          <kbd>J</kbd> follows twice more, and <kbd>G</kbd> or ↓← <kbd>K</kbd>
          BANDO BOX, a bazooka's canister that arcs out and bursts, which ↓←
          <kbd>K</kbd> fires twice more. His supers, for a stock each:
          <kbd>1</kbd> or ↓→↓← <kbd>J</kbd> RAMBU SUP, a dash into a rush of
          blows from the other fighters' shadows, and <kbd>2</kbd> or ←↓→←↓→
          <kbd>K</kbd> SCC, a grab into the big robot's blows and a throw into
          the wall; for three, <kbd>3</kbd> or <kbd>J</kbd> <kbd>J</kbd> →
          <kbd>K</kbd> <kbd>J</kbd> MESATSU, a dash that grabs into a flurry of flashing
          blows. 3HIT cancels into SCC or RAMBU SUP for two stocks.
        </p>
        <p>
          Choose 3-TIMES to play him, a blond pilot in red armour like MASA's,
          who swings a purple axe and dashes with two shadows of himself.
          <kbd>J</kbd> is a dashing axe swing that strikes three times,
          <kbd>K</kbd> a grenade lobbed to hop along the floor and <kbd>O</kbd>
          a heavy axe swing that shakes the screen, standing or crouching; in the
          air <kbd>J</kbd> or <kbd>O</kbd> swings the axe and <kbd>K</kbd>
          fires two shots angled down. His dash is a run that goes on while → is held,
          ↑ leaping into a high jump. He has no Hit Up, chuck, double jump, air dash
          or Counter Attack. His specials: <kbd>U</kbd> or →↓↘
          <kbd>J</kbd> SHORYU, a crescent slash that rises forward,
          <kbd>I</kbd> or ↓→ <kbd>K</kbd> FIRE, a pink crescent that flies
          across the screen, and <kbd>F</kbd> or ↓→ <kbd>J</kbd> DASH P, a
          dashing swing with two shadows of himself. His supers, for a stock
          each: <kbd>1</kbd> or ↓→↓← <kbd>J</kbd> Rambu, his armour bursting off
          for a dash into a rush of the other fighters' shadows, and
          <kbd>2</kbd> or ↓→↓→ <kbd>K</kbd> SB, fifteen grenades lobbed in a
          spread; for three, <kbd>3</kbd> or <kbd>J</kbd> <kbd>J</kbd> →
          <kbd>K</kbd> <kbd>J</kbd> MESATSU, a cut-in, then a dash that grabs
          into a flurry. <kbd>J</kbd> cancels into <kbd>O</kbd> or a special,
          <kbd>O</kbd> into a special, and DASH P into a super.
        </p>
        <p>
          Choose ZENKA to play her, a silver-haired woman in a long red coat who
          fights with a knife and calls in robots: a blue drill robot, a red
          robot and her own purple armour. <kbd>J</kbd> is a dashing knife slash
          and <kbd>K</kbd> a stepping one; after a hit, <kbd>J</kbd>
          brings the blue robot's sword thrust and <kbd>K</kbd> the red robot's
          drill flurry, then <kbd>J</kbd> the blue robot's overhead swing or
          <kbd>K</kbd> the red robot's sword swing. Down with <kbd>J</kbd> is
          the blue robot's low thrust and with <kbd>K</kbd> the red robot's
          drill that rolls along the floor; in the air <kbd>J</kbd> or
          <kbd>K</kbd> is a robot's swing. <kbd>H</kbd> is her Hit Up, the red
          robot's rising slash, which ↑ chases into the air after a hit,
          <kbd>O</kbd> her chuck, the blue robot's sword skewering the opponent,
          which ↓↘→ <kbd>K</kbd> follows with the red robot's leaping spin. She
          double jumps and air dashes. Blocking with a stock,
          <kbd>H</kbd> spends it on Counter Hit. Her specials: <kbd>U</kbd> or
          →↓↘ <kbd>J</kbd> Dragon P, the red robot's rising slash, also in the
          air, <kbd>I</kbd> or ↓→ <kbd>J</kbd> FIRE BALL, her purple armour's
          slash across the screen, and <kbd>F</kbd> or ↓← <kbd>J</kbd> the new
          move, a charge into a giant sword's thrust. Her supers, for a stock
          each: <kbd>1</kbd> or ↓→↓→ <kbd>K</kbd> Ranbu, a grab into blows from
          both robots and her own last slash, and <kbd>2</kbd> or ↓→↓→
          <kbd>J</kbd> DAISHARIN, a giant sword hurled to spin out and back; for
          three, <kbd>3</kbd> or ↓←↓← <kbd>J</kbd> En300, warnings, then a leap that
          drops with a giant sword, whose grab names the opponent's Clothes off and
          so meets no one here. FIRE BALL cancels into Ranbu or DAISHARIN for two
          stocks.
        </p>
        <p>
          Choose Z-MEGA to play him, a white-haired, moustached brawler in a
          black vest who turns into Shin Z, trading life for power.
          <kbd>J</kbd> is a lunging palm strike that hits twice and
          <kbd>K</kbd> a stepping spin kick, standing or crouching; in the air
          <kbd>J</kbd> punches and <kbd>K</kbd> kicks. Shift runs on while → is
          held, ↑ leaping into a high jump, and Shift with ← hops back; he
          double jumps and air dashes. <kbd>O</kbd> is his chuck, a grab into a
          beating and a blow that knocks the opponent away. He has no Hit Up or
          Counter Attack. <kbd>E</kbd> or ↓ ↓ <kbd>H</kbd> is TYPE CHANGE: as
          Shin Z he loses a point of life every 0.1 seconds while his power
          rises 15, and his moves take their Shin forms; again turns him back,
          which holds his power at zero until he next turns. His specials:
          <kbd>U</kbd> or →↓↘ <kbd>K</kbd> SAMA, a rising somersault kick, also
          in the air, <kbd>I</kbd> or ↓→ <kbd>J</kbd> Fire BALL, a fireball that
          bounces twice and rolls along the floor, <kbd>F</kbd> or →↓←
          <kbd>J</kbd> GIGA, a dash behind a glowing palm that carries the
          opponent into the screen's edge, and <kbd>G</kbd> or ↓→ <kbd>K</kbd>
          REFLACT, a round shield's shove, which doesn't reflect shots here. His supers,
          for a stock each: <kbd>1</kbd> or →←↓→ <kbd>J</kbd> GAISA, a charge
          through three levels, whose wave <kbd>J</kbd> fires at the level
          reached before he collapses, and <kbd>2</kbd> or ↓→↓←
          <kbd>J</kbd> SGIGA, a bigger GIGA; for three, <kbd>3</kbd> or
          <kbd>J</kbd> <kbd>J</kbd> → <kbd>K</kbd> <kbd>J</kbd> AKUMA SP, a dash that
          grabs into a storm of flashes for 250, which Shin Z plays even short of
          stock.
        </p>
        <p>
          Choose ALPHA to play him, a red-haired boy in a chained white suit who
          takes on four armours for his moves: a white tiger's, a green
          knight's, a red one with a snake and a winged blue one. <kbd>J</kbd>
          is a chained punch and <kbd>K</kbd> a kick; after a hit,
          <kbd>J</kbd> brings the tiger's punches and <kbd>K</kbd> the red
          armour's kick, then <kbd>J</kbd> the blue armour's wing slash or
          <kbd>K</kbd> the knight's shield. Down with <kbd>J</kbd> is the
          tiger's swipe and with <kbd>K</kbd> the knight's shield, ↘
          <kbd>J</kbd> the knight's rising blow; in the air <kbd>J</kbd> is the
          blue armour's slash, <kbd>K</kbd> the red armour's kick and ↘
          <kbd>K</kbd> its diving kick. <kbd>H</kbd> is his Hit Up, the red
          armour's snake, which ↑ chases into the air after a hit, and
          <kbd>O</kbd> his chuck, the blue armour's grab into a beam. He double
          jumps and air dashes. Blocking with a stock, <kbd>H</kbd> spends it on
          Counter hit. His specials: <kbd>U</kbd> or ←↓→ <kbd>K</kbd> CC, the
          knight's lunge that grabs into a throw, <kbd>I</kbd> or →←↓→
          <kbd>J</kbd> Munt, a rock pillar thrust up from the floor well ahead,
          and <kbd>F</kbd> or ↓← <kbd>J</kbd> NC, the tiger's chain strikes,
          which ↓← <kbd>J</kbd> follows twice more. His supers, for a stock
          each: <kbd>1</kbd> or ↓→↓→ <kbd>K</kbd> SNAKE FIRE, a giant snake's
          strike, <kbd>3</kbd> or ↓→↓← <kbd>J</kbd> Rambu, the tiger's leap into
          a long flurry, and <kbd>5</kbd> or →↓←→↓← <kbd>K</kbd> SCC, the
          knight's grab into a launch and a slam; for three, <kbd>2</kbd> or
          ↓→↓→ <kbd>J</kbd> RYUON HASANKEN, the blue armour's flight behind a
          fire dragon, and <kbd>4</kbd> or ↓ ↓ ↓ <kbd>J</kbd> NEW EN3, pillars of
          fire. A hit with NC cancels into SNAKE FIRE, Rambu or SCC for two stocks.
        </p>
        <p>
          Choose SHIN-Z to play Z-MEGA as Shin Z for good, a white-haired,
          moustached brawler in a black vest and purple trousers. <kbd>J</kbd>
          is a lunging palm strike that hits twice and <kbd>K</kbd> a stepping
          spin kick, standing or crouching; on a hit, <kbd>K</kbd>, a special or
          a super follows them. In the air <kbd>J</kbd> punches and
          <kbd>K</kbd> kicks. Shift runs on while → is held, ↑ leaping into a
          high jump, and Shift with ← hops back; he double jumps and air dashes.
          <kbd>O</kbd> is his chuck, a grab into a beating and a blow that
          knocks the opponent away. He has no Hit Up or Counter Attack. His
          specials:
          <kbd>U</kbd> or →↓↘ <kbd>K</kbd> SAMA, a rising somersault kick, also
          in the air, where →↓↘ <kbd>K</kbd> kicks again, <kbd>I</kbd> or ↓→
          <kbd>J</kbd> Fire BALL, a fast straight fireball, <kbd>F</kbd> or →↓←
          <kbd>J</kbd> GIGA, a dash behind a glowing palm that carries the
          opponent into the screen's edge, <kbd>G</kbd> or ↓→ <kbd>K</kbd>
          REFLACT, a round shield's shove that hurls the shield back at a shot it
          meets, and <kbd>E</kbd> or →←↓→ <kbd>J</kbd> GAISA, a blue wave. His
          supers, for a stock each: <kbd>1</kbd> or →←↓→ <kbd>K</kbd> KAISA
          SUPER, a giant ghostly head of his that charges across the screen, and
          <kbd>2</kbd> or ↓→↓← <kbd>J</kbd> SGIGA, a bigger GIGA; for three,
          <kbd>3</kbd> or <kbd>J</kbd> <kbd>J</kbd> → <kbd>K</kbd> <kbd>J</kbd>
          AKUMA SP, a dash that grabs into a storm of flashes for 250. On a hit, a
          super cancels SAMA, Fire BALL, REFLACT or GAISA.
        </p>
        <p>
          Below the arena, choose your fighter and the opponent, Zoma, Ryuko,
          Kiki, Chung, Amiro, ANMC P, Giant, G Suneo, Yo, SIN, LIZARD, KAY,
          DIDO, SAKUYA, ALEX, SOU, HISO, ERUS, OS FENG, SEAN, GON, KATE, REMU,
          REAR, GIGI, SWW, OGI, ZIRO, MASA, 3-TIMES, ZENKA, Z-MEGA, ALPHA or
          SHIN-Z, and one of eighteen stages, in either mode. Free practice has
          no timer, and you also choose how the partner behaves: standing,
          guarding high or low, guarding in the air, attacking in range, jumping
          in, or playing as the original CPU. Max stock refills your supers
          whenever you stand idle, and Low health keeps you just under 30% for
          desperation moves. Vs. CPU is the original game's CPU, playing the
          opponent's own moves, specials and supers. Reduce their health to
          zero, or lead on health when time runs out. Changing modes, fighters
          or the stage starts a fresh match.
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
