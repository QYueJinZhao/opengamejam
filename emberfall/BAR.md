# Emberfall — AAA Bar

Working title: **Emberfall** (弹幕幸存者 Roguelite)
Genre track target: survivor / roguelite (confirm against live jam tracks after login)
Reference bar game: **Vampire Survivors** — for core-loop replayability, escalation curve and build variety. Named reference frames are captured from it at matching states and pinned beside ours on every comparison sheet.
Visual style: dark-fairytale neon, procedural three.js geometry + bloom. Our best concept frame is the floor; the named VS frame is the bar for pacing/density, not for art (VS is 2D pixel art, we are 3D neon).

Each item is written so a stranger can mark **PASS / FAIL / UNVERIFIED** on a capture or a play-through, with evidence. Scored against Vampire Survivors as harshly as someone who has never seen this game. Control: an unchanged frame/run re-checked blind each round.

## Core loop & replay (opengame-depth)
- [ ] C1 A new player, from the real title screen with no explanation, is killing enemies and understands the goal within 90 s. Evidence: recorded 90-second cold play-through with input.
- [ ] C2 The core loop (move → auto-fire → collect gems → level up → pick upgrade → survive waves) is complete and repeatable; a full run reaches a boss or end state. Evidence: uninterrupted run capture.
- [ ] C3 Escalation curve: enemy count/density and elite types rise measurably over a run; a bare timing run shows changing pressure, not a flat stream. Evidence: density counters at 1/3/6/10 min.
- [ ] C4 Build variety: at least 3 meaningfully different upgrade paths (e.g. area/absorb, projectile/multishot, orbit/aura) produce visibly different play. Evidence: two runs with different builds, side by side.
- [ ] C5 Overload mechanic: active screen-clear on a cooldown with the promised control-inversion downside; readable telegraph, real cost, satisfying payoff. Evidence: capture before/during/after.
- [ ] C6 Per-run world rule (e.g. bullets bounce / enemies split) changes tactics and is visibly announced. Evidence: capture showing rule active + player adapting.
- [ ] C7 Meta progression persists between runs and gives a reason to start again (unlock or permanent stat), without trivialising the first run. Evidence: two consecutive runs showing the unlock applied.
- [ ] C8 A run has a clear win AND lose condition; losing teaches what went wrong. Evidence: both end-state captures.

## Feel & controls (opengame-game-feel)
- [ ] F1 Hits register on the hit frame — flash/knockback/particle — no delay between input and visible consequence. Evidence: frame-stepped capture.
- [ ] F2 Player damage has distinct, unmistakable feedback (screen edge, shake, sound). Evidence: capture + audio.
- [ ] F3 One game clock; movement speed and fire rate stay consistent under load. Evidence: timing run at low and high enemy counts.
- [ ] F4 Camera follows smoothly; no jitter at high density, no motion sickness. Evidence: 10 s moving capture at peak density.

## Audio & music (opengame-audio)
- [ ] A1 Sound starts on the first real user gesture on every device; no autoplay-block silence. Evidence: fresh-load capture with audio.
- [ ] A2 Music bed + layered combat intensity that escalates with the wave. Evidence: recording at start vs boss.
- [ ] A3 Key sounds (fire, hit, pickup, level-up, overload, death) are distinct and not harsh/loud-clipped. Evidence: recording + measured peaks.
- [ ] A4 No sound cuts off, loops badly, or repeats noticeably in a 10-minute run. Evidence: full-run recording.

## Title, menus & HUD (opengame-front-end)
- [ ] U1 Title screen reads as a finished game, not a button on black; shows real game art behind it. Evidence: title capture.
- [ ] U2 Menus (start, pause, settings, results) are reachable by mouse and keyboard, and never block a frame. Evidence: menu-route capture + input test.
- [ ] U3 HUD shows HP, timer, level/XP, kills and cooldown, legible at play distance, not covering the action. Evidence: mid-combat full-size frame.
- [ ] U4 Results screen summarises the run and points at the meta unlock. Evidence: end-run capture.

## Look (opengame-look)
- [ ] L1 No cheap tell on the new-player route (title, menu, first minute, loading): no placeholder, no black load, no clipped/flat hero. Evidence: fresh-route capture set vs cheap-tells list.
- [ ] L2 Consistent art direction: palette, bloom, ground and neon read as one deliberate style, verified on side-by-side sheets (concept / named frame / build). Evidence: 3-panel sheet per screen.
- [ ] L3 Enemies, gems, projectiles and environment are visually distinct at a glance under dense fire. Evidence: peak-density frame.
- [ ] L4 Every generated asset is loaded and seen/heard on the real route; nothing generated sits unused. Evidence: asset list with call sites + captures.

## Performance (opengame-performance)
- [ ] P1 Sustained 60 FPS on an ordinary laptop at peak density; frame-time tail (p99) stays in budget. Evidence: timing run with frame-time graph at 10-minute density.
- [ ] P2 Load to first playable frame is fast; second visit near-instant; loading screen is honest. Evidence: cold/warm load timing.
- [ ] P3 No frame drops on level-up or overload spikes. Evidence: capture around the spike.

## Robustness & evidence (opengame-verification / quality-bar)
- [ ] V1 Independent reviewer with fresh context scores each screen and the run, names the single largest gap, cites a capture per verdict, marks unseen as UNVERIFIED. Evidence: reviewer report.
- [ ] V2 Stranger (not builder) can play from cold start and wants a second run. Evidence: observed play-through notes.
- [ ] V3 Every PASS above links to a capture, clip time or test output on the CURRENT build. No inherited passes.

## Rounds log
Each round: play → score every item → fix the weakest one → play again. Record deltas and owner verdict; three rounds under +0.3 means change the method, not the polish.

| Round | Date | Score vs VS | Biggest gap fixed | Owner played? | Notes |
| --- | --- | --- | --- | --- | --- |
| R1 | | | | | initial playable |
