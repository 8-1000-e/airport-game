# Decisions log (append-only)

## 2026-04-30 — Use existing `useSolPrice` hook in front-dev integration

Instead of duplicating `priceFeed.ts` for the React port of the game, the
front-dev component imports `useSolPrice` from
`@/components/games/shared/hooks/useSolPrice`. Same Pyth Lazer / Magicblock
ER WebSocket source as red-light. Avoids two Buffer-polyfill setups in the
same repo.

## 2026-04-30 — Singleton PDAs reused across matches

Initial design (mirroring red-light) created a fresh Lobby/Vault/Leaderboard
per match keyed by `lobby_id`. Switched to singleton PDAs:
- `Lobby` seeds = `[b"lobby"]`
- `Vault` seeds = `[b"vault", lobby.key()]`
- `Leaderboard` seeds = `[b"leaderboard", lobby.key()]`

Reset between matches via `reset_lobby(new_lobby_id, new_entry_fee)` +
`reset_leaderboard()`. `lobby_id` field is a match counter incremented on
reset; emitted in PrizeDistributed events for off-chain tracking.

**Rationale**: simpler client integration (no PDA derivation per match);
saves rent (only pay once); only one match runs at a time anyway since the
backend gates joins to status == OPEN.

**Trade-off**: only one match in flight per program deployment. Multi-region
or multi-tenant operators would need to deploy multiple instances.

## 2026-04-30 — Per-pick on-chain scoring (`pick_luggage`)

Originally the design was `submit_results(entries: Vec<LeaderboardEntry>)` at
match end. Switched to incremental `pick_luggage(player, points)` called by
the backend after every claw drop during the match. Bubble-sort up keeps the
array in score DESC order without a full sort at submit time.

**Rationale**: easier to debug (live scoreboard during match), removes the
"sort then submit" coordination on the backend, fewer compute units in the
final settlement tx.

**Trade-off**: each pick is its own on-chain tx. If picks happen in tight
bursts (multiple players within seconds), the backend needs to handle tx
sequencing / nonce management.

## 2026-04-30 — One pick per player per match

`pick_luggage` rejects with `AlreadyPicked` if the player's leaderboard entry
already has `score != 0`. Reduces both program complexity and gameplay scope:
players queue up, watch the carousel, time their one shot.

The `picks: u8` counter field was removed from `LeaderboardEntry` since it's
always 1; tiebreak is now pure score equality.

## 2026-04-30 — Plain Anchor leaderboard (no BOLT)

red-light uses a BOLT ECS `leaderboard` component with manually-parsed bytes
in `distribute_prize`. We use a regular Anchor `#[account(zero_copy(unsafe))]`
struct + `AccountLoader` instead. No BOLT dependency; cleaner anti-scam
checks (`Account<Leaderboard>` enforces ownership by the program; entry
verification reads typed fields, not raw byte offsets).

## 2026-04-30 — `leave_lobby` only when alone

A player can only `leave_lobby()` while they're the sole occupant
(`player_count == 1`). Once a 2nd player joins, the backend starts a 60s
pre-match countdown and everyone is committed. `CannotLeaveWithOthers` error.

## 2026-04-30 — On-chain match end-time gate

`Lobby` stores `match_end_time = started_at + MATCH_DURATION_SECS` and
`pick_luggage` rejects after that timestamp with `MatchWindowExpired`. This
guards against the backend forgetting to call `finalize_leaderboard` and
late picks slipping in.

## 2026-04-30 — `MAX_PLAYERS = 50` (zero-copy required)

Started at 10 (mirroring red-light). User wanted 30, then 50. At 30+ players
the SBF stack overflows during Borsh deserialization of the Lobby and
Leaderboard structs. Both converted to `#[account(zero_copy(unsafe))]` +
`#[repr(C)]` with explicit padding fields to keep `LeaderboardEntry`
8-byte aligned. See [debugging-notes.md](debugging-notes.md).

Lobby = 1675 bytes, Leaderboard = 2043 bytes — well under the 10 MB account
limit. Heap usage ~4 KB during instructions, well under 32 KB default.

## 2026-04-30 — Flat program layout (no `programs/<name>/` nesting)

Standard Anchor workspace puts each program in `programs/<name>/`. We
flattened to just `program/src/...` because there's only one program. Anchor
config: `[workspace] members = ["."]` in `Anchor.toml`, single `[package]`
in `Cargo.toml` (no `[workspace]`).

## 2026-04-30 — Cargo.lock copied from red-light to bypass rust 1.84 issue

Solana platform-tools v1.48 ships rustc 1.84.1, which doesn't support the
`edition2024` Cargo feature. Several transitive deps of `anchor-lang 0.32.1`
auto-resolved to versions requiring edition2024 (toml_datetime 1.1.1+spec,
toml_edit 0.25.11+spec, toml_parser 1.1.2+spec, indexmap 2.14, …). We pinned
each via `cargo update --precise` until the build worked, then ultimately
copied red-light's `Cargo.lock` wholesale to lock in known-good versions.

Should be replaced with a project-specific lock once Solana ships
platform-tools with rustc 1.85+.
