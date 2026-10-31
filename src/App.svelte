<script lang="ts">
  import { onMount } from 'svelte';
  import { ASSET_BASE } from './game/assetBase';
  import { buttonsOf, KEYS, usesButton } from './game/commands';
  import { SUPER_CONTROLS } from './game/match';
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
  let pausedBefore = false;
  const asset = ASSET_BASE;
  const touchControls: { control: Control; label: string; symbol: string }[] = [
    { control: 'left', label: 'Move left', symbol: '←' },
    { control: 'right', label: 'Move right', symbol: '→' },
    { control: 'jump', label: 'Jump', symbol: '↑' },
    { control: 'crouch', label: 'Crouch', symbol: '↓' },
    { control: 'punch', label: 'Punch', symbol: 'G' },
    { control: 'kick', label: 'Kick', symbol: 'H' },
    { control: 'dash', label: 'Dash', symbol: '⇧' },
    { control: 'drill', label: 'Drill punch', symbol: 'U' },
    { control: 'axe', label: 'Axe throw', symbol: 'I' },
    { control: 'throw', label: 'Throw', symbol: 'O' },
    { control: 'hitUp', label: 'Hit Up', symbol: 'K' },
    { control: 'iori', label: 'IORI', symbol: 'F' },
    { control: 'dst', label: 'Daisetsuzan', symbol: 'J' },
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
      zaku: {
        getterBeam: 'Super P',
        musashi: 'Super K',
        drill: 'Dash P',
      },
      pachelo: {
        getterBeam: 'Super Roll',
        drill: 'Roll',
        axe: 'Electric',
      },
      golf: {
        getterBeam: 'Super P',
        drill: 'Sp P',
        axe: 'Sp K',
      },
      asura: {
        getterBeam: 'Shinku TATU',
        drill: 'Tatumaki',
      },
      ttro: {
        getterBeam: 'SCC',
        musashi: 'Super Fire',
        changeAttack: 'EN300',
        drill: 'Dash P',
        axe: 'Fire',
        iori: 'Dash K',
        dst: 'CC',
      },
      astroman: {
        getterBeam: 'S CC',
        musashi: 'Super P',
        changeAttack: 'Gun Super',
        drill: 'Jump Att',
        axe: 'Punch',
        iori: 'Ass Gun',
        dst: 'C Chuck',
      },
      yinan: {
        getterBeam: 'SS',
        musashi: 'EN Driver',
        changeAttack: 'Eat',
        blackRush: 'EN Chuck',
        megaBeam: 'R300',
        drill: 'Driver',
        axe: 'Assault',
        iori: 'Doge',
        dst: 'ECS',
        ex: 'Type',
      },
      aya: {
        getterBeam: 'Slash',
        musashi: 'Rocket',
        changeAttack: 'EN3',
        drill: 'FB',
        axe: 'DH',
        iori: 'SHO',
        dst: 'TE P',
        ex: 'TE K',
      },
      dora: {
        punch: 'LP',
        kick: 'LK',
        hitUp: 'HP',
        dst: 'HK',
        throw: 'Chuck',
        ex: 'EN',
        getterBeam: 'Cannon',
        musashi: 'Gadgets',
        changeAttack: 'Fists',
        blackRush: 'Pierce',
        megaBeam: 'Hug',
        drill: 'Air Cannon',
        axe: 'Sky Rise',
        iori: 'Charge',
      },
      rario: {
        getterBeam: 'Shinku',
        musashi: 'Shin Shoryu',
        drill: 'Hado',
        axe: 'Shoryu',
        iori: 'Tatumaki',
      },
      training: {
        punch: 'Drain',
        kick: 'Refill',
        throw: 'Self KO',
        drill: 'Hado',
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
    return () => {
      disposed = true;
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
    pausedBefore = status.paused;
    if (status.ready && !status.paused && !status.resultReady)
      session?.scene.togglePause();
    settingsOpen = true;
    dialog.showModal();
  }
  // close fires on every path (Close button, Character select, native Esc).
  function settingsClosed() {
    settingsOpen = false;
    if (status.ready && !status.resultReady && status.paused !== pausedBefore)
      session?.scene.togglePause();
    focusArena();
  }
  // begin() unpauses on every reset; re-pause while the modal is open.
  $effect(() => {
    if (settingsOpen && status.ready && !status.paused && !status.resultReady)
      session?.scene.togglePause();
  });
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
      <div
        class="arena"
        bind:this={host}
        tabindex="-1"
        role="application"
        aria-roledescription="fighting game"
        aria-label="Training arena. A and D to move, W to jump or double jump, S to crouch, hold back to guard, G to punch, H to kick, K for Hit Up then W to chase on hit, F for IORI, tap again for each follow-up, Shift to dash, double-tap left or right to dash on the ground or in the air, U for Drill Punch, I for Axe throw, O to grab and throw, J for the Daisetsuzan command throw, E to switch EX mode, 1 to 5 for the supers, or Ryuko's original motion commands. P to pause."
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

  <p class="keyboard-guide">
    <span><kbd>A</kbd><kbd>D</kbd> Move</span><span><kbd>W</kbd> Jump</span
    ><span><kbd>S</kbd> Crouch</span>{#if has('punch')}<span
        ><kbd>G</kbd> {labelOf('punch', 'Punch')}</span
      >{/if}{#if has('kick')}<span><kbd>H</kbd> {labelOf('kick', 'Kick')}</span
      >{/if}<span>Hold back Guard</span><span><kbd>Shift</kbd> Dash</span
    >{#if has('drill')}<span><kbd>U</kbd> {labelOf('drill', 'Drill')}</span
      >{/if}{#if has('axe')}<span><kbd>I</kbd> {labelOf('axe', 'Axe')}</span
      >{/if}{#if has('throw')}<span
        ><kbd>O</kbd> {labelOf('throw', 'Throw')}</span
      >{/if}{#if has('hitUp')}<span
        ><kbd>K</kbd> {labelOf('hitUp', 'Hit Up')}</span
      >{/if}{#if has('iori')}<span><kbd>F</kbd> {labelOf('iori', 'IORI')}</span
      >{/if}{#if has('dst')}<span
        ><kbd>J</kbd> {labelOf('dst', 'Daisetsuzan')}</span
      >{/if}{#if has('ex')}<span><kbd>E</kbd> {labelOf('ex', 'EX')}</span
      >{/if}{#if SUPER_CONTROLS.some(has)}<span
        ><kbd>1</kbd>–<kbd>{SUPER_CONTROLS.filter(has).length}</kbd> Supers</span
      >{/if}
  </p>

  <dialog
    class="settings-dialog"
    bind:this={dialog}
    aria-label="Settings"
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
      href="instructions.html"
      target="_blank"
      rel="noopener">Controls guide</a
    >
    <button class="text-button" onclick={() => dialog.close()}>Close</button>
  </dialog>
</main>
