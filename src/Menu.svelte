<script module lang="ts">
  // The pause menu's static art paths. The exporter's dom_art() scan
  // publishes exactly the literal paths written in this file, so every
  // entry stays a whole literal path (no template strings) and the paths
  // keep existing in the export.
  import type { Stage } from './game/characters';

  // The Max EN stock digits, 100–1000: the source's own digits for 100–600
  // (KGT images 18–23), then HPA-971's authored art for 700–1000.
  export const EN_DIGITS = [
    'ui/18.png',
    'ui/19.png',
    'ui/20.png',
    'ui/21.png',
    'ui/22.png',
    'ui/23.png',
    'en/7.png',
    'en/8.png',
    'en/9.png',
    'en/10.png',
  ] as const;

  // The Match tab's stage preview: each stage's lowest-indexed frame. Every
  // stage's first frame is 0 except streetnight's, which is 4 (generated
  // stages.json).
  export const STAGE_THUMBNAILS: Record<Stage, string> = {
    boss: 'stages/boss/0.png',
    brboss: 'stages/brboss/0.png',
    court: 'stages/court/0.png',
    dojin: 'stages/dojin/0.png',
    gi: 'stages/gi/0.png',
    greek: 'stages/greek/0.png',
    japan: 'stages/japan/0.png',
    office: 'stages/office/0.png',
    office2: 'stages/office2/0.png',
    park: 'stages/park/0.png',
    parknight: 'stages/parknight/0.png',
    sakura: 'stages/sakura/0.png',
    sakuranight: 'stages/sakuranight/0.png',
    space: 'stages/space/0.png',
    spacenight: 'stages/spacenight/0.png',
    streetnight: 'stages/streetnight/4.png',
    train: 'stages/train/0.png',
    trainnight: 'stages/trainnight/0.png',
  };
</script>

<script lang="ts">
  import { ASSET_BASE } from './game/assetBase';
  import type { CheatOptions } from './game/cheats';
  import type { Who } from './game/characters';
  import { DUMMY_BEHAVIORS } from './game/dummy';
  import type { PracticeOptions } from './game/match';
  import type { GameStatus } from './game/scene';
  import { ROSTER } from './instructions/fighters';
  import {
    CHEAT_GROUPS,
    changedCheats,
    isChangedCheat,
    opponentChoiceOf,
    PARTNER_LABELS,
    resetCheats,
    STAGE_LABELS,
    stepCheat,
    summonables,
    summonStep,
    SUMMON_COLUMNS,
    tileOf,
    toggleSide,
    type MenuIdentity,
  } from './menu';

  // One dialog, three contents: the Match and Cheats tabs, and the
  // alternate Summon overlay App opens with Ctrl+Backquote.
  export type MenuView = 'match' | 'cheats' | 'summon';

  interface Props {
    open: boolean;
    view: MenuView;
    status: GameStatus;
    practice: PracticeOptions;
    cheats: CheatOptions;
    fighter: Who;
    opponent: Who;
    stage: Stage;
    identity: MenuIdentity;
    mePending: boolean;
    profileRow: boolean;
    onclose: () => void;
    onopponentchoice: (value: string) => void;
    onpractice: (changes: Partial<PracticeOptions>) => void;
    oncheats: (changes: Partial<CheatOptions>) => void;
    onfighter: (who: Who) => void;
    onopponent: (who: Who) => void;
    onstage: (stage: Stage) => void;
    onmusic: (on: boolean) => void;
    onselect: () => void;
    onsummon: (who: Who, side: -1 | 1) => Promise<void>;
  }

  let {
    open,
    view,
    status,
    practice,
    cheats,
    fighter,
    opponent,
    stage,
    identity,
    mePending,
    profileRow,
    onclose,
    onopponentchoice,
    onpractice,
    oncheats,
    onfighter,
    onopponent,
    onstage,
    onmusic,
    onselect,
    onsummon,
  }: Props = $props();

  let dialog = $state<HTMLDialogElement>();
  // The dialog's own view state: the active tab and, for Summon, the grid
  // cursor and the side it would join. Opening resets them.
  let tab = $state<'match' | 'cheats'>('match');
  let cursor = $state(0);
  let side = $state<-1 | 1>(-1);
  let summoning = $state(false);
  let note = $state<{ kind: 'load' | 'ok' | 'error'; text: string } | null>(
    null,
  );

  $effect(() => {
    if (open) {
      tab = view === 'cheats' ? 'cheats' : 'match';
      cursor = 0;
      side = -1;
      summoning = false;
      note = null;
      if (dialog && !dialog.open) dialog.showModal();
    } else if (dialog?.open) {
      dialog.close();
    }
  });

  // Every row takes programmatic focus so ↑/↓ can land on one whose
  // controls are all disabled; otherwise the walk sits on the row's
  // first enabled control. Re-runs as each tab mounts its rows.
  $effect(() => {
    void tab;
    void view;
    for (const row of dialog?.querySelectorAll<HTMLElement>('[data-row]') ?? [])
      row.tabIndex = -1;
  });

  // A tab switch unmounts the panel focus sat in, dropping focus to the
  // body — outside the dialog, where the keydown model cannot hear it.
  // Pull it back to the bare dialog when it escaped.
  $effect(() => {
    void tab;
    if (dialog?.open && !dialog.contains(document.activeElement))
      dialog.focus();
  });

  // ↑/↓ land a row's first enabled control — a stepper's ◀, a checkbox,
  // an input — or the row itself when everything it holds is disabled.
  function focusRow(row: HTMLElement | undefined) {
    if (!row) return;
    const control =
      row.querySelector<HTMLElement>('[data-step] button:not([disabled])') ??
      row.querySelector<HTMLElement>(
        'input:not([disabled]), select:not([disabled]), button:not([disabled])',
      );
    (control ?? row).focus();
  }

  // The rendered grid's columns: the stylesheet holds 8 desktop, 4 at
  // phone width — read the computed tracks so navigation matches what is
  // drawn.
  function gridColumns() {
    const grid = dialog?.querySelector<HTMLElement>('.grid');
    return grid
      ? getComputedStyle(grid).gridTemplateColumns.split(' ').length
      : SUMMON_COLUMNS;
  }

  // Focus the cursor's cell, scrolling the scrollable grid (phone widths)
  // so the pick stays visible. Focus rides with the cursor so a focused
  // tile's native Enter activation confirms the highlighted fighter.
  function focusCell(index: number) {
    const cell =
      dialog?.querySelectorAll<HTMLElement>('[role="option"]')[index];
    cell?.focus();
    cell?.scrollIntoView({ block: 'nearest' });
  }

  const nameOf = (who: Who) => ROSTER.find((entry) => entry.id === who)!.name;
  // Left/right roster stepping wraps; the seat keeps a fighter always.
  const rosterStep = (who: Who, delta: 1 | -1): Who => {
    const at = ROSTER.findIndex((entry) => entry.id === who);
    return ROSTER[(at + delta + ROSTER.length) % ROSTER.length]!.id;
  };
  const stages = Object.keys(STAGE_LABELS) as Stage[];
  const stageStep = (at: Stage, delta: 1 | -1): Stage =>
    stages[(stages.indexOf(at) + delta + stages.length) % stages.length]!;

  const opponentChoice = $derived(
    opponentChoiceOf(status.mode, practice.partner),
  );
  const pairDisabled = $derived(
    !status.ready || status.selecting || status.story,
  );
  const optionsDisabled = $derived(
    !status.ready || opponentChoice === 'vsCpu' || opponentChoice === 'story',
  );
  const changed = $derived(changedCheats(cheats));

  // Summon confirm: the same action the grid's Enter/G and a tile's click
  // take. The scene holds the fight (setModal) for the whole dialog visit;
  // this only reports what the summon did.
  async function confirmSummon() {
    if (summoning) return;
    const entry = summonables[cursor]!;
    summoning = true;
    // Confirming disables the tiles, which would drop a focused tile's
    // focus to the body — where the dialog's keydown never runs and the
    // arena reads Esc and P again. Take the dialog itself first, so the
    // keys stay ours through a slow pack load.
    dialog?.focus();
    note = { kind: 'load', text: `Loading ${entry.name}…` };
    try {
      await onsummon(entry.id, side);
      note = { kind: 'ok', text: `${entry.name} joined the fight.` };
    } catch (error) {
      note = {
        kind: 'error',
        text: error instanceof Error ? error.message : String(error),
      };
    } finally {
      summoning = false;
      // The re-enable and a pointer click elsewhere can still have moved
      // focus off the dialog; keep the keys ours.
      dialog?.focus();
    }
  }

  // One keydown model for the whole dialog. Typing stays inside inputs;
  // everything else is ours, and stops before the arena or App's window
  // handlers can read a key (the modal focus trap already holds Phaser).
  function onkeydown(event: KeyboardEvent) {
    event.stopPropagation();
    const target = event.target as HTMLElement;
    const key = event.key;
    // Left/right on a focused switch or stepper button adjusts it.
    if (key === 'ArrowLeft' || key === 'ArrowRight') {
      const dir = key === 'ArrowLeft' ? -1 : 1;
      if (target.matches?.('input[type="checkbox"]')) {
        event.preventDefault();
        target.click();
        return;
      }
      const stepper = target.closest?.('[data-step]');
      if (stepper) {
        event.preventDefault();
        (
          stepper.querySelector(
            dir < 0 ? '[data-minus]' : '[data-plus]',
          ) as HTMLButtonElement | null
        )?.click();
        return;
      }
    }
    // ↑/↓ walk the rows — from a control, a disabled row or a bare field.
    // They run before the input early-return, so navigation never strands
    // once an edit field is focused; the summon view's arrows walk the
    // grid instead.
    if ((key === 'ArrowDown' || key === 'ArrowUp') && view !== 'summon') {
      event.preventDefault();
      const rows = [
        ...(dialog?.querySelectorAll<HTMLElement>('[data-row]') ?? []),
      ];
      const at = rows.findIndex((row) => row.contains(document.activeElement));
      const next =
        rows[(at + (key === 'ArrowDown' ? 1 : rows.length - 1)) % rows.length];
      focusRow(next);
      return;
    }
    if (target.closest?.('input, select, textarea')) return;
    if (view === 'summon') {
      // Tab flips the side; WASD and the arrows walk the grid; G/Enter
      // join the picked fighter; Esc closes natively.
      if (key === 'Tab') {
        event.preventDefault();
        side = toggleSide(side);
      } else if (key === 'g' || key === 'G') {
        event.preventDefault();
        void confirmSummon();
      } else if (key === 'Enter') {
        // A focused tile or side button clicks natively — and focus rides
        // the cursor below, so that activation is the confirm. Only the
        // bare dialog confirm runs here.
        if (target === dialog) {
          event.preventDefault();
          void confirmSummon();
        }
      } else if (/^[wasd]$/i.test(key) || key.startsWith('Arrow')) {
        // Every recognised nav key rides focus to the cursor — a step the
        // grid edge clamps too, so Enter confirms the highlight instead
        // of whichever button focus sat on (HPA-972 review round 2).
        event.preventDefault();
        cursor = summonStep(cursor, summonables.length, key, gridColumns());
        focusCell(cursor);
      }
      return;
    }
    // Q/E switch the two local tabs.
    if (key === 'q' || key === 'Q') {
      event.preventDefault();
      tab = 'match';
    } else if (key === 'e' || key === 'E') {
      event.preventDefault();
      tab = 'cheats';
    }
  }
</script>

<dialog
  class="menu"
  bind:this={dialog}
  aria-label="Menu"
  tabindex="-1"
  {onkeydown}
  onclose={() => {
    // A close event fires only once the open attribute is gone — so one
    // arriving while the dialog is open again is the previous close,
    // delivered late (Chrome queues it as a task, and an immediate
    // Ctrl+Backquote reopen can outrun it). Dropping it keeps the stale
    // close from closing the reopened dialog.
    if (!dialog?.open) onclose();
  }}
>
  <div class="page" style="--face-sheet: url({ASSET_BASE}select/13.png)">
    <header class="top">
      <button
        class="back"
        onclick={() => {
          dialog?.close();
        }}>◂ Back to game</button
      >
      <span class="title">MENU</span>
    </header>
    {#if view === 'summon'}
      <section class="summon" aria-label="Summon a fighter">
        <h2 class="chrome"><span>SUMMON</span></h2>
        <div class="sides" role="group" aria-label="Summon side">
          <button
            class="side enemy"
            class:on={side === -1}
            aria-pressed={side === -1}
            disabled={summoning}
            onclick={() => (side = -1)}>Enemy</button
          >
          <button
            class="side partner"
            class:on={side === 1}
            aria-pressed={side === 1}
            disabled={summoning}
            onclick={() => (side = 1)}>Partner</button
          >
        </div>
        <div class="grid" role="listbox" aria-label="Fighters">
          {#each summonables as entry, i (entry.id)}
            <button
              class="cell"
              class:picked={i === cursor}
              role="option"
              aria-selected={i === cursor}
              aria-label={entry.name}
              disabled={summoning}
              onclick={() => {
                cursor = i;
                void confirmSummon();
              }}
            >
              <i
                class="tile"
                style="--x: {tileOf(entry.id)?.x}; --y: {tileOf(entry.id)?.y}"
              ></i>
              {#if entry.plate}
                <img
                  class="plate"
                  src={ASSET_BASE + entry.plate}
                  alt=""
                  width="85"
                  height="26"
                />
              {:else}
                <span class="plate-text">{entry.name}</span>
              {/if}
            </button>
          {/each}
        </div>
        <p
          class="note"
          class:ok={note?.kind === 'ok'}
          class:error={note?.kind === 'error'}
          aria-live="polite"
        >
          {note?.text ??
            (side === -1
              ? 'Pick a fighter to join the enemy side.'
              : 'Pick a fighter to fight beside 1P.')}
        </p>
      </section>
    {:else}
      <div class="body">
        <nav class="rail" aria-label="Menu sections">
          <button
            class="railbtn"
            class:on={tab === 'match'}
            aria-current={tab === 'match' ? 'page' : undefined}
            onclick={() => (tab = 'match')}
          >
            Match
          </button>
          <button
            class="railbtn"
            class:on={tab === 'cheats'}
            aria-current={tab === 'cheats' ? 'page' : undefined}
            onclick={() => (tab = 'cheats')}
          >
            Cheats
            {#if changed}
              <span class="count">{changed}</span>
            {/if}
          </button>
          <a
            class="railbtn"
            href={`instructions.html#${fighter}`}
            target="_blank"
            rel="noopener">Controls ↗</a
          >
          {#if profileRow}
            <div class="profile">
              <span class="who" class:dim={mePending}>
                {#if identity.user?.avatarUrl}
                  <img
                    class="avatar"
                    src={identity.user.avatarUrl}
                    alt=""
                    referrerpolicy="no-referrer"
                  />
                {/if}
                <span class="truncate"
                  >{!identity.loaded
                    ? 'Checking…'
                    : identity.user
                      ? identity.user.name
                      : identity.failed
                        ? "Couldn't check sign-in"
                        : 'Not signed in'}</span
                >
              </span>
              <a
                class="railbtn"
                href="profile.html"
                target="_blank"
                rel="noopener">Profile ↗</a
              >
            </div>
          {/if}
        </nav>
        <div class="content">
          {#if tab === 'match'}
            <section aria-label="Match">
              <h2 class="chrome"><span>MATCH</span></h2>
              <div class="panel stack">
                <label class="field"
                  ><span class="label">Opponent</span>
                  <select
                    value={opponentChoice}
                    disabled={!status.ready}
                    onchange={(event) =>
                      onopponentchoice(event.currentTarget.value)}
                  >
                    {#if opponentChoice === 'story'}
                      <option value="story" disabled>Story mode</option>
                    {/if}
                    <optgroup label="Practice partner">
                      {#each DUMMY_BEHAVIORS as behavior (behavior)}
                        <option value={behavior}
                          >{PARTNER_LABELS[behavior]}</option
                        >
                      {/each}
                    </optgroup>
                    <optgroup label="Match">
                      <option value="vsCpu">Vs. CPU</option>
                    </optgroup>
                  </select></label
                >
                <div class="pair">
                  <div class="card" class:disabled={pairDisabled} data-row>
                    <span class="seat">1P</span>
                    <button
                      class="tilebtn"
                      aria-label={`1P ${nameOf(fighter)} — open character select`}
                      disabled={pairDisabled}
                      onclick={() => {
                        dialog?.close();
                        onselect();
                      }}
                    >
                      <i
                        class="tile"
                        style="--x: {tileOf(fighter)?.x}; --y: {tileOf(fighter)
                          ?.y}"
                      ></i>
                    </button>
                    <strong class="pickname">{nameOf(fighter)}</strong>
                    <span class="step" data-step>
                      <button
                        data-minus
                        aria-label="Previous 1P fighter"
                        disabled={pairDisabled}
                        onclick={() => onfighter(rosterStep(fighter, -1))}
                        >◀</button
                      >
                      <button
                        data-plus
                        aria-label="Next 1P fighter"
                        disabled={pairDisabled}
                        onclick={() => onfighter(rosterStep(fighter, 1))}
                        >▶</button
                      >
                    </span>
                  </div>
                  <div class="card" class:disabled={pairDisabled} data-row>
                    <span class="seat">2P</span>
                    <button
                      class="tilebtn"
                      aria-label={`2P ${nameOf(opponent)} — open character select`}
                      disabled={pairDisabled}
                      onclick={() => {
                        dialog?.close();
                        onselect();
                      }}
                    >
                      <i
                        class="tile"
                        style="--x: {tileOf(opponent)?.x}; --y: {tileOf(
                          opponent,
                        )?.y}"
                      ></i>
                    </button>
                    <strong class="pickname">{nameOf(opponent)}</strong>
                    <span class="step" data-step>
                      <button
                        data-minus
                        aria-label="Previous 2P fighter"
                        disabled={pairDisabled}
                        onclick={() => onopponent(rosterStep(opponent, -1))}
                        >◀</button
                      >
                      <button
                        data-plus
                        aria-label="Next 2P fighter"
                        disabled={pairDisabled}
                        onclick={() => onopponent(rosterStep(opponent, 1))}
                        >▶</button
                      >
                    </span>
                  </div>
                </div>
                <div class="card stage" data-row>
                  <span class="seat">Stage</span>
                  <img
                    class="thumb"
                    src={ASSET_BASE + STAGE_THUMBNAILS[stage]}
                    alt=""
                    width="128"
                    height="96"
                  />
                  <strong class="pickname">{STAGE_LABELS[stage]}</strong>
                  <span class="step" data-step>
                    <button
                      data-minus
                      aria-label="Previous stage"
                      disabled={!status.ready || status.story}
                      onclick={() => onstage(stageStep(stage, -1))}>◀</button
                    >
                    <button
                      data-plus
                      aria-label="Next stage"
                      disabled={!status.ready || status.story}
                      onclick={() => onstage(stageStep(stage, 1))}>▶</button
                    >
                  </span>
                </div>
                <label class="check" data-row
                  ><input
                    type="checkbox"
                    checked={status.music}
                    disabled={!status.ready}
                    onchange={(event) => onmusic(event.currentTarget.checked)}
                  />
                  Music</label
                >
                <label class="check" data-row
                  ><input
                    type="checkbox"
                    checked={practice.enemyBars}
                    disabled={!status.ready}
                    onchange={(event) =>
                      onpractice({ enemyBars: event.currentTarget.checked })}
                  />
                  Enemy HP bars</label
                >
                <div class="practice-only">
                  <label class="check" data-row
                    ><input
                      type="checkbox"
                      checked={practice.maxStock}
                      disabled={optionsDisabled}
                      onchange={(event) =>
                        onpractice({ maxStock: event.currentTarget.checked })}
                    />
                    Max stock</label
                  >
                  <label class="check" data-row
                    ><input
                      type="checkbox"
                      checked={practice.lowHealth}
                      disabled={optionsDisabled}
                      onchange={(event) =>
                        onpractice({
                          lowHealth: event.currentTarget.checked,
                        })}
                    />
                    Low health</label
                  >
                </div>
                <button
                  class="ghost"
                  data-row
                  disabled={!status.ready || status.selecting}
                  onclick={() => {
                    dialog?.close();
                    onselect();
                  }}
                >
                  Character select
                </button>
              </div>
            </section>
          {:else}
            <section aria-label="Cheats">
              <h2 class="chrome">
                <span>CHEATS</span>
                {#if changed}<small>{changed} changed</small>{/if}
              </h2>
              <div class="panel stack">
                <div class="master" class:on={cheats.enabled} data-row>
                  <label class="check"
                    ><input
                      type="checkbox"
                      checked={cheats.enabled}
                      onchange={(event) =>
                        oncheats({ enabled: event.currentTarget.checked })}
                    />
                    Cheat mode</label
                  >
                  <button class="ghost" onclick={() => oncheats(resetCheats())}>
                    Reset all
                  </button>
                </div>
                {#each CHEAT_GROUPS as group (group.name)}
                  <h3>{group.name}</h3>
                  {#each group.rows as row (row.field)}
                    <div
                      class="cheat"
                      class:disabled={!cheats.enabled}
                      data-row
                    >
                      <span
                        class="label"
                        class:gold={isChangedCheat(cheats, row.field)}
                        >{row.label}</span
                      >
                      {#if row.kind === 'stepper'}
                        <span class="value" data-step>
                          <button
                            data-minus
                            aria-label={`Decrease ${row.label}`}
                            disabled={!cheats.enabled}
                            onclick={() =>
                              oncheats(stepCheat(cheats, row.field, -1))}
                            >◀</button
                          >
                          <input
                            type="number"
                            aria-label={row.label}
                            min={row.min}
                            max={row.max}
                            step={row.step}
                            value={cheats[row.field]}
                            disabled={!cheats.enabled}
                            onchange={(event) => {
                              const input =
                                event.currentTarget as HTMLInputElement;
                              if (Number.isFinite(input.valueAsNumber))
                                oncheats({ [row.field]: input.valueAsNumber });
                              input.value = String(cheats[row.field]);
                            }}
                          />
                          {#if row.digits}
                            <img
                              class="digit"
                              src={ASSET_BASE +
                                EN_DIGITS[cheats.playerMaxEn / 100 - 1]}
                              alt={`${cheats.playerMaxEn} EN`}
                              height="16"
                            />
                          {/if}
                          <span class="suffix">{row.suffix}</span>
                          <button
                            data-plus
                            aria-label={`Increase ${row.label}`}
                            disabled={!cheats.enabled}
                            onclick={() =>
                              oncheats(stepCheat(cheats, row.field, 1))}
                            >▶</button
                          >
                        </span>
                      {:else if row.kind === 'input'}
                        <span class="value">
                          <input
                            type="number"
                            aria-label={row.label}
                            min={row.min}
                            max={row.max}
                            step="1"
                            placeholder="Game"
                            value={cheats[row.field] ?? ''}
                            disabled={!cheats.enabled}
                            onchange={(event) => {
                              const input =
                                event.currentTarget as HTMLInputElement;
                              oncheats({
                                [row.field]: Number.isFinite(
                                  input.valueAsNumber,
                                )
                                  ? input.valueAsNumber
                                  : null,
                              });
                              input.value = String(cheats[row.field] ?? '');
                            }}
                          />
                          <span class="suffix">{row.suffix}</span>
                        </span>
                      {:else}
                        <span class="value">
                          <input
                            type="checkbox"
                            aria-label={row.label}
                            checked={cheats[row.field] as boolean}
                            disabled={!cheats.enabled}
                            onchange={(event) =>
                              oncheats({
                                [row.field]: event.currentTarget.checked,
                              })}
                          />
                        </span>
                      {/if}
                      <small class="help">{row.help}</small>
                    </div>
                  {/each}
                {/each}
                <p class="hint">
                  Changes apply from the next match or battle. A summon joins a
                  fighter right now (Ctrl+` in a running match).
                </p>
              </div>
            </section>
          {/if}
        </div>
      </div>
    {/if}
    <footer class="legend">
      {#if view === 'summon'}
        WASD / arrows move · Tab enemy / partner · G or Enter summon · Esc close
      {:else}
        Q / E tabs · ↑ ↓ focus · ← → adjust · Enter select · Esc close
      {/if}
    </footer>
  </div>
</dialog>

<style>
  /* Full-window translucent view of the paused arena; the panels sit on
     the guide's navy. */
  dialog.menu {
    width: 100vw;
    height: 100svh;
    max-width: none;
    max-height: none;
    border: 0;
    padding: 0;
    background: #05070ad9;
    color: var(--text);
    font: 500 15px/1.5 var(--body);
  }
  dialog.menu::backdrop {
    background: #05070ae6;
  }
  .page {
    display: flex;
    flex-direction: column;
    height: 100%;
    max-width: 1240px;
    margin: 0 auto;
    padding: 14px 20px 0;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding-bottom: 10px;
  }
  .title {
    font: italic 900 26px/1 var(--display);
    color: var(--gold);
    text-shadow: 2px 2px 0 #7a2d00;
    letter-spacing: 1px;
  }
  .body {
    display: grid;
    grid-template-columns: 190px minmax(0, 1fr);
    gap: 24px;
    flex: 1;
    min-height: 0;
    align-items: start;
  }
  .rail {
    display: flex;
    flex-direction: column;
    gap: 6px;
    position: sticky;
    top: 0;
    padding-top: 4px;
  }
  .railbtn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 9px 14px;
    font: 700 15px/1 var(--body);
    color: var(--text);
    text-decoration: none;
    text-align: left;
    background: var(--ink);
    border: 0;
    cursor: pointer;
    clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%);
  }
  .railbtn:hover {
    color: var(--gold);
  }
  .railbtn.on {
    color: var(--gold);
    background: linear-gradient(90deg, #241a0c, var(--ink) 70%);
    border-left: 4px solid var(--gold);
  }
  .railbtn:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 1px;
  }
  .count {
    min-width: 20px;
    padding: 2px 6px;
    font: 700 12px/1 var(--body);
    text-align: center;
    color: var(--ink);
    background: var(--gold);
  }
  .profile {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 10px;
    padding: 8px 10px;
    background: var(--navy);
    border: 1px solid var(--edge);
  }
  .who {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    font: 700 13px/1.3 var(--body);
  }
  .who.dim {
    opacity: 0.6;
  }
  .avatar {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    object-fit: cover;
    image-rendering: auto;
  }
  .truncate {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .content {
    min-height: 0;
    overflow-y: auto;
    padding-bottom: 16px;
  }
  .stack {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 16px;
    background: var(--navy);
    border-top: 5px solid var(--gold);
  }
  .field {
    display: block;
  }
  .label {
    display: block;
    font: 700 12px/1 var(--body);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: var(--gold);
  }
  select {
    margin-top: 6px;
    width: 100%;
    padding: 8px 10px;
    font: 700 15px/1 var(--body);
    color: var(--text);
    background: var(--ink);
    border: 1px solid var(--steel);
    border-left: 4px solid var(--gold);
  }
  select:disabled {
    opacity: 0.4;
  }
  /* 1P/2P cards and the stage card: face tiles and thumbnail from the
     game's own sheets, stepped with the round ◀/▶ buttons. */
  .pair {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .card {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: var(--ink);
    border: 1px solid var(--edge);
    border-left: 4px solid var(--gold);
  }
  .card.disabled .tile {
    filter: brightness(0.4) saturate(0.5);
  }
  .seat {
    font: italic 900 15px/1 var(--display);
    color: var(--gold);
    min-width: 34px;
  }
  /* The select sheet's own 24 x 60 face tile, magnified as a whole so no
     tile samples the sheet at a fractional texel. */
  .tile {
    display: block;
    width: 24px;
    height: 60px;
    transform: scale(1.25);
    transform-origin: center;
    background: var(--face-sheet) calc(var(--x) * -1px) calc(var(--y) * -1px) /
      206px 417px no-repeat;
    image-rendering: pixelated;
  }
  .tilebtn {
    padding: 0;
    border: 0;
    background: none;
    cursor: pointer;
  }
  .tilebtn:focus-visible {
    outline: 3px solid #fff;
    outline-offset: 2px;
  }
  .tilebtn:hover .tile {
    filter: brightness(1.2);
  }
  .pickname {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font: 700 16px/1.2 var(--body);
  }
  .thumb {
    width: 64px;
    height: 48px;
    object-fit: cover;
    border: 1px solid var(--edge);
  }
  .step {
    display: flex;
    gap: 4px;
  }
  .step button {
    width: 30px;
    height: 30px;
    padding: 0;
    font: 700 14px/1 var(--body);
    color: var(--text);
    background: #241a0c;
    border: 1px solid var(--steel);
    cursor: pointer;
  }
  .step button:hover:not(:disabled) {
    color: var(--gold);
    border-color: var(--gold);
  }
  .step button:disabled {
    opacity: 0.4;
    cursor: default;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font: 700 15px/1 var(--body);
  }
  .check input {
    width: 16px;
    height: 16px;
    accent-color: var(--gold);
  }
  input:disabled {
    opacity: 0.4;
  }
  .practice-only {
    display: flex;
    gap: 20px;
    padding-left: 10px;
    border-left: 3px solid var(--edge);
  }
  .ghost {
    align-self: flex-start;
    padding: 8px 14px;
    font: 700 13px/1 var(--body);
    color: var(--gold);
    background: none;
    border: 1px solid var(--steel);
    cursor: pointer;
  }
  .ghost:hover:not(:disabled) {
    color: #ffe08a;
    border-color: var(--gold);
  }
  .ghost:disabled {
    opacity: 0.4;
    cursor: default;
  }
  /* Cheats: one master row, then the metadata-built groups. */
  .master {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }
  /* The mockup's red cheat-mode band while the master switch is on. */
  .master.on {
    padding: 10px 12px;
    background: rgba(238, 36, 33, 0.12);
    box-shadow: inset 4px 0 0 var(--red);
  }
  /* The mockup's gold group headings over a fading rule line. */
  h3 {
    display: flex;
    align-items: center;
    gap: 10px;
    margin: 6px 0 0;
    font: italic 900 15px/1 var(--display);
    color: var(--gold);
    letter-spacing: 0.5px;
  }
  h3::after {
    content: '';
    flex: 1;
    height: 2px;
    background: linear-gradient(90deg, var(--edge), transparent);
  }
  .cheat {
    display: grid;
    grid-template-columns: minmax(90px, 1fr) auto;
    align-items: center;
    gap: 4px 10px;
    padding: 6px 8px;
    background: var(--ink);
    border: 1px solid #14263f;
  }
  .cheat .label {
    color: var(--text);
    text-transform: none;
    letter-spacing: 0;
    font-size: 14px;
  }
  .cheat .label.gold {
    color: var(--gold);
  }
  .cheat.disabled {
    opacity: 0.55;
  }
  .value {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    font: 700 14px/1 var(--body);
  }
  .value input[type='number'] {
    width: 64px;
    padding: 5px 6px;
    text-align: right;
    font: 700 14px/1 var(--body);
    color: var(--gold);
    background: #241a0c;
    border: 1px solid var(--steel);
  }
  .value input[type='number']:disabled {
    opacity: 0.5;
  }
  .digit {
    height: 16px;
    width: auto;
  }
  .suffix {
    color: var(--muted);
    font-size: 12px;
  }
  .help {
    grid-column: 1 / -1;
    font: 500 12px/1.4 var(--body);
    color: var(--muted);
  }
  .hint {
    font: 600 12px/1.5 var(--body);
    color: var(--muted);
  }
  /* Summon: the select grid's tiles under a side switch. */
  .summon {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .sides {
    display: flex;
    gap: 8px;
  }
  .side {
    padding: 8px 22px;
    font: 700 15px/1 var(--body);
    color: var(--text);
    background: var(--ink);
    border: 1px solid var(--steel);
    cursor: pointer;
    clip-path: polygon(0 0, 100% 0, calc(100% - 9px) 100%, 0 100%);
  }
  .side.on {
    color: var(--gold);
    border-color: var(--gold);
    background: #241a0c;
  }
  /* The mockup codes the two sides: red for enemies, gold for partners. */
  .side.enemy.on {
    color: #fff;
    /* The mockup's #ff6a5a→#ee2421 ramp leaves white 15px text at 2.8–4.3:1;
       this darker ramp keeps the red coding at ≥5.4:1 on every stop
       (menu-contrast.test.ts pins the AA floor). */
    background: linear-gradient(#d31412, #a5110f);
    border-color: var(--red);
  }
  .side:disabled {
    opacity: 0.4;
  }
  .grid {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(8, minmax(0, 1fr));
    gap: 8px;
    align-content: start;
    padding: 12px;
    background: var(--navy);
    border-top: 5px solid var(--gold);
  }
  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 8px 2px 4px;
    background: var(--ink);
    border: 1px solid #14263f;
    cursor: pointer;
  }
  .cell:hover:not(:disabled) {
    border-color: var(--edge);
  }
  .cell.picked {
    border-color: var(--gold);
    box-shadow: 0 0 0 1px var(--gold);
  }
  .cell:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .cell .plate {
    width: 85px;
    height: auto;
  }
  .cell .plate-text {
    height: 26px;
    display: flex;
    align-items: center;
    font: 700 11px/1 var(--body);
    color: var(--muted);
  }
  .note {
    min-height: 1.5em;
    font: 600 14px/1.5 var(--body);
    color: var(--muted);
  }
  .note.ok {
    color: var(--cyan-hi);
  }
  .note.error {
    color: var(--red);
  }
  .legend {
    position: sticky;
    bottom: 0;
    padding: 10px 0 12px;
    font: 600 12px/1.4 var(--body);
    color: var(--muted);
    background: #05070ae6;
    border-top: 1px solid #14263f;
  }
  /* Phone: tabs become a horizontal row above the scrolling content. */
  @media (max-width: 700px) {
    .page {
      padding: 10px 12px 0;
    }
    .body {
      grid-template-columns: 1fr;
      gap: 10px;
    }
    .rail {
      position: static;
      flex-direction: row;
      overflow-x: auto;
      padding-bottom: 4px;
    }
    .railbtn {
      white-space: nowrap;
      clip-path: polygon(9px 0, 100% 0, calc(100% - 9px) 100%, 0 100%);
    }
    .profile {
      flex-direction: row;
      align-items: center;
      margin-top: 0;
      margin-left: auto;
      padding: 2px 8px;
      border: 0;
      background: none;
    }
    .profile .who {
      max-width: 130px;
    }
    .grid {
      grid-template-columns: repeat(4, minmax(0, 1fr));
    }
    .pair {
      grid-template-columns: 1fr;
    }
  }
</style>
