# airport-game — project memory

## Context Recovery

IMPORTANT: At session start, read all `.md` files in the `/docs/` directory
(`docs/current-task.md`, `docs/decisions.md`, `docs/architecture.md`,
`docs/debugging-notes.md`, `docs/setup.md`) to restore full context.

## Current State

- **Branch**: `fresh-start` (this repo) ; sister branch `fresh-start` on
  `8-1000-e/airport-game` GitHub remote
- **Status**: Anchor program compiles with `cargo check`; all instructions
  ported to zero-copy AccountLoader. Pending: confirm `anchor build` succeeds
  end-to-end and test on devnet.
- **Last updated**: 2026-04-30

## What this project is

Three pieces under one directory tree:

1. `airport-game/src/` — 2D HTML5 canvas game (Vite + TypeScript). Stadium-shaped
   carousel, Pyth Lazer SOL/USD price drives a chevron-charge mechanic that
   flips the carousel direction; an industrial robotic claw arm picks luggage
   and drops it in a delivery box; dark tiled floor background.
2. `airport-game/program/` — Anchor / Solana program managing a singleton
   multiplayer Lobby + Vault + Leaderboard with reset-between-matches.
3. `front-dev/src/components/games/airport-carousel/` — React port of the
   game wired into front-dev's onchain-games dashboard via a modal.

## Task Progress

- [x] 2D game canvas (carousel, claw, chart, chevrons, tiled bg, points)
- [x] Front-dev integration (card + modal + canvas component)
- [x] Anchor program — singleton Lobby/Vault/Leaderboard PDAs
- [x] Per-pick scoring via `pick_luggage` instead of batch submit_results
- [x] Reset instructions for re-using PDAs across matches
- [x] 50-player capacity via Lobby & Leaderboard zero-copy conversion
- [x] `cargo check` passes
- [ ] `anchor build` end-to-end success on this machine ← CURRENT — last
       run hit the SBF stack overflow which the zero-copy conversion should
       have fixed; user needs to retry
- [ ] Wire up Cargo.lock pins so the build is reproducible (we copied
      red-light's lock; works but should be committed deliberately)
- [ ] `anchor keys sync` to replace the placeholder declare_id
- [ ] Deploy to devnet and write integration tests
- [ ] Build a backend service that drives create_lobby → start_match →
      pick_luggage → finalize_leaderboard → distribute_prize → reset cycle
- [ ] BOLT integration was scoped OUT — leaderboard is plain Anchor

## Key Decisions (see docs/decisions.md for full list)

- **Singleton PDAs reused across matches** (vs per-match new PDAs like red-light).
  Lobby seeds = `[b"lobby"]`, Leaderboard seeds = `[b"leaderboard", lobby.key()]`.
  Reset via `reset_lobby` + `reset_leaderboard`.
- **Per-pick on-chain scoring** (`pick_luggage(player, points)`) instead of
  batched `submit_results`. Backend calls it on every claw drop. Each player
  picks at most once per match (security check: `existing entry score == 0`).
- **Zero-copy for Lobby AND Leaderboard** (not just Leaderboard) so we can
  scale to 50+ players without SBF stack overflow.
- **Same red-light lobby economics**: top half by score wins, 95%/5% pot split
  (8% treasury for ≤2-player matches), tie at cutoff splits the slot.
- **No BOLT for the leaderboard** — pure Anchor `AccountLoader<Leaderboard>`.
