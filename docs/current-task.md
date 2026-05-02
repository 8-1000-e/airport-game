# Current task — finalize Anchor program build + deployment

## What we're building

The `airport-carousel-lobby` Anchor program at
[program/](../program/) — a singleton multiplayer lobby for the airport-carousel
game. Backend creates a single Lobby + Vault + Leaderboard at deploy time;
matches loop create → join → start → pick × N → finalize → distribute →
reset_lobby + reset_leaderboard.

## Where we are

`cargo check` passes. The next step is to confirm `anchor build` produces a
clean `.so` after the most recent zero-copy refactor of the `Lobby` struct.

## Files of interest

- [program/src/lib.rs](../program/src/lib.rs) — entry, declare_id placeholder,
  12 instruction wrappers + `PrizeDistributed` event
- [program/src/state.rs](../program/src/state.rs) — both `Lobby` and
  `Leaderboard` are `#[account(zero_copy(unsafe))]` + `#[repr(C)]`. `Lobby` has
  5-byte `_padding`, `Leaderboard` has 5-byte `_padding`. `LeaderboardEntry`
  is also zero_copy (40 bytes: pubkey + u64 score).
- [program/src/constants.rs](../program/src/constants.rs) —
  `MAX_PLAYERS = 50`, `MATCH_DURATION_SECS = 60`, fees, status codes.
- [program/src/errors.rs](../program/src/errors.rs) — all error variants
  including `AlreadyPicked`, `MatchWindowExpired`, `CannotLeaveWithOthers`,
  `LobbyNotSettled`, …
- All 12 [program/src/instructions/](../program/src/instructions/) files use
  `AccountLoader<'info, Lobby>` and/or `AccountLoader<'info, Leaderboard>` and
  scope load() / load_mut() / load_init() borrows in `{ … }` blocks where
  necessary to avoid RefCell conflicts.

## Build state

- `Cargo.lock` was copied from `/Users/emile/Documents/TNTX/red-light/Cargo.lock`
  to dodge transitive deps that need rust 1.85 (platform-tools v1.48 ships rustc
  1.84). See [docs/debugging-notes.md](debugging-notes.md).
- Anchor.toml uses `[workspace] members = ["."]` because the crate is at the
  program/ root (we flattened the standard `program/programs/<name>/` layout).
- declare_id! is `Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS` (Anchor docs
  example). The user has updated lib.rs locally to
  `DSxQtZoKFeF7xzpcSCTNgxocf8kazFEtvT2iC5GY3iMk` — confirm this matches what
  `solana address -k target/deploy/airport_carousel_lobby-keypair.json` shows
  before deploying.

## Next steps (in order)

1. Run `anchor build`. Should compile cleanly. If a new rust 1.84 / edition2024
   error appears on a fresh transitive dep, follow the pattern in
   [docs/debugging-notes.md](debugging-notes.md) (cargo update --precise).
2. Run `anchor keys sync` to make declare_id and Anchor.toml match the
   keypair Anchor generates under `target/deploy/`.
3. Run `anchor build` again after sync.
4. Deploy to devnet: `anchor deploy --provider.cluster devnet` (program
   already configured to use devnet by default in Anchor.toml `[provider]`).
5. Write integration tests (none yet — should mirror
   `red-light/tests/red-light-lobby.test.ts` patterns).
6. Build the backend service that drives the lifecycle.

## Backend lifecycle (target spec)

On boot:
- `create_lobby(lobby_id=1, entry_fee)` (signer: backend authority)
- `init_leaderboard()` (signer: backend authority)

Per match:
1. Frontend lets players sign their own `join_lobby()` txs.
2. When `player_count >= 2`, backend starts a 60s off-chain countdown.
3. After countdown: backend signs `start_match()`. Lobby status → STARTED.
   `match_end_time = now + 60`.
4. While `match_end_time` not yet reached: when the off-chain game logic
   detects a player's claw drop, backend signs `pick_luggage(player, points)`
   where `points = multiplier * 100`. Each player picks at most once per
   match (on-chain enforced via `score == 0` precondition).
5. After 60s: backend signs `finalize_leaderboard()`.
6. Backend signs `distribute_prize()` with `remaining_accounts` =
   `leaderboard.entries[0..total_winners].player` in order. Pays top 50% from
   the pot, treasury gets 5% (or 8% if ≤2 players).
7. Backend signs `reset_leaderboard()` and
   `reset_lobby(new_lobby_id, new_entry_fee)`. Status → OPEN. Loop.

## Open questions

- Should the entry_fee actually be variable per match (`reset_lobby` takes a
  new value), or fixed forever after `create_lobby`? Currently flexible, may
  not be desired — easy to ignore the param if not needed.
- `leave_lobby` is currently restricted to "alone in lobby" (player_count == 1).
  Confirm this matches product intent.
- Compute budget on `distribute_prize` with 50 winners: estimated 8K CU,
  comfortable under default 200K. But tx ACCOUNT count limit may bite (50
  remaining_accounts + 5 fixed = 55). Should be fine, but verify on devnet.
