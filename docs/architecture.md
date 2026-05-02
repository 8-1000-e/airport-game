# Architecture

## Three deliverables

```
TNTX/
├── airport-game/
│   ├── src/                  ← 2D canvas game (Vite + TS)
│   ├── program/              ← Anchor / Solana program
│   ├── docs/                 ← This folder
│   └── CLAUDE.md             ← Session memory
├── front-dev/                ← Existing TNTX frontend (separate repo)
│   └── src/components/games/airport-carousel/
│                             ← React port of the game (modal-mounted)
└── red-light/                ← Reference for lobby program patterns
```

## On-chain (program/)

Single Anchor program, three singleton PDAs:

```
[b"lobby"]                              → Lobby           (1675 bytes, zero_copy)
[b"vault", lobby.key()]                 → Vault           (49 bytes)
[b"leaderboard", lobby.key()]           → Leaderboard     (2043 bytes, zero_copy)
```

### Account layouts (with MAX_PLAYERS = 50)

```rust
#[account(zero_copy(unsafe))] #[repr(C)]
pub struct Lobby {                  // 1675 bytes incl. 8-byte disc
    pub lobby_id: u64,              //   8 — match counter
    pub authority: Pubkey,          //  32 — backend signer
    pub entry_fee: u64,             //   8 — lamports
    pub started_at: i64,            //   8 — current match start
    pub match_end_time: i64,        //   8 — pick window cutoff
    pub player_count: u8,           //   1
    pub status: u8,                 //   1 — 0=Open 1=Started 2=Settled
    pub bump: u8,                   //   1
    pub _padding: [u8; 5],          //   5
    pub players: [Pubkey; 50],      // 1600
}

#[account] // not zero_copy — small enough
pub struct Vault {
    pub lobby: Pubkey,              //  32
    pub total_pot: u64,             //   8 — escrowed entry fees
    pub bump: u8,                   //   1
}

#[zero_copy(unsafe)] #[repr(C)]
pub struct LeaderboardEntry {       // 40 bytes, 8-byte aligned
    pub player: Pubkey,             //  32
    pub score: u64,                 //   8 — 0 means "not picked yet"
}

#[account(zero_copy(unsafe))] #[repr(C)]
pub struct Leaderboard {            // 2043 bytes incl. 8-byte disc
    pub lobby: Pubkey,              //  32
    pub finalized: u8,              //   1 — 0/1 (no bool, not Pod)
    pub entry_count: u8,            //   1
    pub bump: u8,                   //   1
    pub _padding: [u8; 5],          //   5 — align entries to 8
    pub entries: [LeaderboardEntry; 50],  // 2000
}
```

### Instructions (12 total)

Bootstrap (once, after deploy):
- `create_lobby(lobby_id, entry_fee)` — backend
- `init_leaderboard()` — backend

Per-match cycle:
- `join_lobby()` — **player signs** (only place a player signs)
- `start_match()` — backend, status → STARTED, sets `match_end_time`
- `pick_luggage(player, points)` — backend, one per drop, bubble-sort up
- `finalize_leaderboard()` — backend, sets `finalized = 1`
- `distribute_prize()` — backend, top 50% paid via remaining_accounts in
  `leaderboard.entries[i].player` order, treasury 5%/8%
- `reset_leaderboard()` — backend, clears entries + finalized
- `reset_lobby(new_lobby_id, new_entry_fee)` — backend, sweeps vault dust to
  authority, clears players, status → OPEN

Edge cases:
- `leave_lobby(player)` — backend on player's behalf, only if alone in lobby
- `refund_lobby()` — backend, bulk refund all if launch fails before scoring
- `close_lobby()` — emergency tear-down

### Event

```rust
#[event]
pub struct PrizeDistributed {
    pub lobby_id: u64,
    pub total_pot: u64,
    pub treasury_cut: u64,
    pub winner_count: u8,
    pub winner_pubkeys: Vec<Pubkey>,
    pub winner_amounts: Vec<u64>,
}
```

### Anti-scam checks

- `Account<Leaderboard>` ownership enforced by Anchor (program owns the PDA).
- `pick_luggage` rejects entries whose player isn't in `lobby.players[]`.
- `pick_luggage` rejects re-picks (`score != 0` precondition).
- `pick_luggage` rejects past `match_end_time`.
- `distribute_prize` requires `leaderboard.finalized == 1`.
- `distribute_prize` matches `remaining_accounts[i].key() == leaderboard.entries[i].player`.
- `treasury` must equal `lobby.authority`.
- `refund_lobby` matches `remaining_accounts[i].key() == lobby.players[i]`.
- `reset_lobby` requires `status == SETTLED`.

## 2D canvas game (airport-game/src/)

Vite + TS, no React. Canvas2D rendering. Single animation loop.

Modules:
- `main.ts` — entry, animation loop, all state
- `priceFeed.ts` — Solana web3 + Pyth Lazer WebSocket subscription
- `chart.ts` — SOL/USD line chart inside the inner stadium platform; clipped
  to the stadium oval; "aurora" iridescent style ditched, currently a single
  green/cyan line that follows the active carousel direction
- `arrows.ts` — direction chevrons on the right arc; charge mechanic + flash
- `claw.ts` — industrial robotic arm: pivot + arm + housing + 2 prongs that
  pivot open/closed; rotates from idle (pointing left at carousel) to drop
  (pointing down at delivery box)
- `background.ts` — tiled airport floor with subtle ceiling-light pulses

The chart color and the chevrons are colored by `directionTarget`:
- `direction = -1` (up chevrons active) → cyan `#22d3ee`
- `direction = +1` (down chevrons active) → magenta `#ec4899`

## React port (front-dev/src/components/games/airport-carousel/)

- `airport-carousel.tsx` — React component owning the canvas. Uses
  `useSolPrice` hook from `front-dev/src/components/games/shared/hooks/`.
  PICK button + Quit button as React children floating over the canvas.
- `chart.ts`, `arrows.ts`, `claw.ts`, `background.ts` — copied as-is from
  airport-game (canvas-only, no DOM deps).
- `carousel.ts`, `luggage.ts` — extracted from `main.ts`. Take `ctx` as
  explicit parameter (not via module-level singleton).
- Card: `front-dev/src/components/dashboard/right/airport-carousel.tsx` —
  modeled on `RedlightCard` in the same folder. Listed in
  `spotlight.tsx`'s `onchainGames` array and rendered in `onchain.tsx`.
