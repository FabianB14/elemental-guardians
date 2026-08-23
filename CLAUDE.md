# Elemental Guardians

Turn-based tactics + card game for the browser. One human controls 1–4
Elemental Guardians against an automated evil faction. v1 is single-player,
placeholder art, no backend.

## Commands

```bash
npm run dev        # Vite dev server
npm run build      # typecheck + production build
npm run typecheck  # tsc --noEmit
npm test           # vitest run
npm run sim        # headless autoplay: npm run sim -- --games 20 --guardians fire,water
```

Definition of done for any change: `npm run typecheck && npm test` green.

## Architecture

```
src/data    ALL balance numbers: units, cards, combos, terrain, doom deck,
            config. Typed data files. Nothing here imports from other layers.
src/engine  Pure reducer: applyAction(state, action) -> { state, events }.
            Deterministic; all randomness flows through the seeded Rng whose
            state lives on GameState.rngState. NEVER Math.random() here.
            The events array powers the combat log and replays.
src/ai      Evil-side controller: pure, deterministic given the state.
            All ties break by lowest unit id.
src/sim     Headless autoplay (scripted guardian bot + CLI win-rate runner).
src/ui      React components. Read state, dispatch actions. No game rules.
```

The engine is the future co-op server — keep it free of React and DOM types.

## Conventions

- Every tunable (stats, deck counts, ranges, escalation) lives in `/src/data`.
  Logic switches on typed ability tags; adding/tuning content means editing
  data, not engine code.
- Engine state is plain JSON (no classes) so `structuredClone` and snapshots
  work. `applyAction` clones its input; it never mutates the caller's state.
- Illegal player input throws `IllegalActionError`; engine bugs throw plain
  `Error`. The UI catches only the former.
- Ambiguous rules: implement the simplest reading and log it in DECISIONS.md.
- Tests live in `src/engine/__tests__`. Combat tests pin dice by searching for
  an RNG state that yields the wanted rolls (see `helpers.findRngFor`).

## Git workflow

- `main` is the default branch and always stays stable and playable.
- All development happens on `fabian-branch`.
- Merge `fabian-branch` into `main` only at the end of a completed build
  phase, with typecheck and tests green.

## Out of scope for v1

No networking, no Capacitor, no accounts, no canvas renderer. The board is
DOM/CSS grid; keep the renderer swappable.
