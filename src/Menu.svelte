<script module lang="ts">
  // The pause menu's static art paths. Task 5 builds this component's dialog
  // around this table; the exporter's dom_art() scan publishes exactly the
  // literal paths written in this file, so every entry stays a whole literal
  // path (no template strings) and the paths keep existing in the export.
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
