# Rules decisions log

Ambiguities in the design doc, resolved with the simplest reading.

1. **Round 1 draw.** Guardians deal an opening hand of 5, then Round 1 begins
   with a normal Draw Phase (draw 2). Setup pre-resolves that draw, so a new
   game starts in Round 1's Summon Phase with 7 cards.
2. **Evil units that move can still attack.** The written AI rule is
   "(1) attack if in range, (2) otherwise move toward the nearest guardian".
   We let a unit that moved attack if its move brought a target into range —
   otherwise melee evil units could never land a hit on a mobile player, and
   guardians (who move-then-attack) would outclass them entirely.
3. **Dice modifiers.** "−1 on rolls against her" (Evasive) subtracts from the
   attacker's roll; Sandstorm's "−1 on all attack and defense rolls" is a
   status on the unit applying to both of its roll types. Combat rolls are
   d6 + stat + roll-modifiers.
4. **Riposte is exactly 1 damage** regardless of the attacker's ability
   riders; on-damage riders (Ignite, Roots) only trigger on the attacker's own
   hits.
5. **Power card range.** Cards with a printed range measure it from the
   casting guardian's god (Fireball "range 3", Riptide, Rampart at 5).
   Overheat, Gust, Slipstream, Healing Tide and Stoneskin are unlimited.
   Slipstream's "within 3" is measured from the teleported unit.
6. **"This round" buffs** (Overheat, Stoneskin, Quake's −1 DEF) expire at
   end-of-round cleanup. "Next round" effects (Roots, Frost Typhoon's Rooted,
   Sandstorm) activate at the next round's start and expire at its cleanup.
7. **Burn** deals 1 at end-of-round cleanup and is then removed (one tick per
   application, no stacking cap).
8. **Deck-out check** runs at the start of every Draw Phase, counting only
   living guardians' decks/hands; dead guardians neither draw nor summon but
   their remaining troops still count as "troops on the board".
9. **Evil god attack.** Evil gods use the same target priority as troops
   (kill-shot > god > lowest HP > lowest id) across adjacent guardian units.
10. **Doom "nearest" measures** Manhattan distance from the closest living
    evil god (fallback: any evil unit). Creeping Blight / Withering pick the
    2×2 block minimising total distance to all living guardian units, ties by
    lowest tile index.
11. **Shrine tiles** are Blighted at setup and marked `shrine`; Stillness
    skips them. Evil gods sit on them and never move.
12. **Rampart** expires at the next Terrain Phase: the engine clears all tile
    blocks after resolving each Terrain card.
13. **Mudslide** pushes along the line's direction; other pushes (Cyclone)
    move targets directly away from the source, axis-snapped, horizontal
    winning ties.
14. **Prism** may fuel a combo from either guardian's hand and counts as any
    element; it can never be played alone and has no effect as a discard.
15. **Generals summon like troops** (cost 4 discards) and may be placed within
    2 of the god as usual; "adjacent to your General" placement applies to
    subsequent summons once the General is on the board.
16. **Hard cap of 60 rounds** (CONFIG.maxRounds) counts as a defeat, so the
    headless sim always terminates.
17. **Gods and MOV.** Guardian gods move like units (MOV 1) in the Action
    Phase and may attack adjacent enemies (ATK 3).
18. **Evasive** applies to any attack roll against the Nymph, including evil
    ripostes? No — it modifies only rolls where she is the defender.
19. **Combo "two power cards"**: summon cards can never fuel combos; the two
    cards may come from one hand or two different guardians' hands.
20. **Tectonic Shift** damages non-Earth units of both factions standing on
    the repainted tiles (evil units are never Earth).
21. **Balance pass (Phase 5, sim-driven).** As written, the game was
    unwinnable: the headless sim went 0-for-60 and evil god HP was never even
    scratched (1-damage combat + ~15 rounds of card economy vs 20 HP gods and
    ~3 evil units spawning per round). Tuned in /src/data, verified by
    `npm run sim`:
    - Evil god HP 20 → 10 (`config.GOD_STATS`).
    - Doom cards per round: guardians+1/+2 → guardians+0 (Normal), +1 (Hard)
      (`config.CONFIG.doomCardsPerRound`).
    - All guardian troops and Generals +1 ATK, +1 DEF, +1 HP over the design
      table — summons cost cards, so each body must outclass the free evil
      spawns.
    - Generals gained Heavy Blow (their hits deal 2 damage), leaning on the
      combat rule's "unless an ability says more" clause; without it no god
      could realistically die.
    Result: the simple scripted bot wins ~30-50% on Normal (1-3 guardians)
    and ~10% on Hard; humans should comfortably beat the bot. 4-guardian
    games remain the hardest (4 gods to kill before the decks run dry).
22. **Sound hooks, not sounds.** `src/ui/sound.ts` routes every engine event
    through one `playForEvent` hook (WebAudio blips, muted by default, 🔊
    toggle in the phase banner). Swapping in real audio assets means editing
    only that file.
