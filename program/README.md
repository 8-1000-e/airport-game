# airport-carousel-lobby

Solana / Anchor program that runs the multiplayer lobby + escrow + leaderboard
+ payout flow for the airport-carousel game.

**Singleton PDAs reused across matches.** A single Lobby, Vault, and
Leaderboard are created once at deploy time and reset between matches via
`reset_lobby` + `reset_leaderboard`.

## Accounts (singletons)

| PDA           | Seeds                              | Holds                                  |
|---------------|------------------------------------|----------------------------------------|
| `Lobby`       | `[b"lobby"]`                       | players list, status, entry fee, lobby_id (match counter) |
| `Vault`       | `[b"vault", lobby.key()]`          | escrowed entry fees                    |
| `Leaderboard` | `[b"leaderboard", lobby.key()]`    | per-player score, sorted desc, finalized flag |

## Instructions

### Bootstrap (called once after deploy)

- **`create_lobby(lobby_id, entry_fee)`** — initializes Lobby + Vault.
- **`init_leaderboard()`** — initializes the Leaderboard PDA.

### Per-match flow

1. _Backend signals lobby open via off-chain UI._
2. **`join_lobby()`** — each player signs and pays `lobby.entry_fee`. Up to
   `MAX_PLAYERS` (50).
3. **`start_match()`** — backend locks the lobby (status → STARTED).
4. _(off-chain)_ — match runs. When a player drops a luggage in the box the
   backend calls **`pick_luggage(player, points)`** — a new entry is
   inserted and bubble-sorted to keep score DESC. Each player can only
   pick **once** per match; a second call rejects with `AlreadyPicked`
   (security check: the entry's score must be 0 before the pick).
5. **`finalize_leaderboard()`** — once the match ends, backend marks the
   leaderboard final so no more `pick_luggage` calls are accepted and
   `distribute_prize` is unblocked.
6. **`distribute_prize()`** — pays the top half of the leaderboard, 95% of
   pot split equally (8% treasury for ≤2-player matches). Tie-break: same
   score at the cutoff splits the slot. Sets status → SETTLED.
7. **`reset_leaderboard()`** — clears entries, `finalized = false`.
8. **`reset_lobby(new_lobby_id, new_entry_fee)`** — sweeps vault dust to
   authority, clears players, status → OPEN, increments match counter.

Now you're back at step 2.

### Edge cases

- **`leave_lobby(player)`** — open-lobby refund minus a 0.0001 SOL spam fee.
  Backend-signed on the player's behalf. Only allowed when the player is
  the sole occupant (`player_count == 1`); once a 2nd player joins, the
  pre-match countdown starts and everyone is committed.
- **`refund_lobby()`** — bulk refund all players when a match launch fails
  (e.g. game server crash before scoring). `remaining_accounts` must match
  `lobby.players[]` in order.
- **`close_lobby()`** — permanent tear-down (emergency / migration).
  Closes all 3 PDAs.

## Anti-scam

- **Singleton PDA ownership** — `Account<'info, Leaderboard>` etc. enforce
  the right program owns each account.
- **Finalization gate** — `distribute_prize` requires `leaderboard.finalized`.
- **Wallet match** — every winner wallet in `remaining_accounts` is verified
  against `leaderboard.entries[i].player` at the same index.
- **Player must have joined** — `pick_luggage` rejects calls whose `player`
  is not in `lobby.players[]`.
- **Sorted order maintained** — `pick_luggage` bubble-sorts after every
  update, so the leaderboard is always in score DESC order by the time
  `distribute_prize` reads it.
- **Treasury check** — `treasury` must equal `lobby.authority`.
- **Reset gate** — `reset_lobby` requires `status == SETTLED`.

## Build

```bash
cd program
anchor build
```

Replace the placeholder program ID `AirP1aceho1der1111...` in `Anchor.toml`
and `lib.rs` after generating the keypair:

```bash
solana-keygen new -o target/deploy/airport_carousel_lobby-keypair.json
anchor keys list
```

## State sizes (with `MAX_PLAYERS = 50`)

```
Lobby       = 1675 bytes (8 disc + 8 id + 32 auth + 8 fee + 1 count + 32×50 players + 1 status + 8 started + 8 end_time + 1 bump)
Vault       =   49 bytes
Leaderboard = 2043 bytes (8 disc + 32 lobby + 1 finalized + 1 count + 40×50 entries + 1 bump)
```

Both fit well under Solana's 10 KB account limit. Rent cost ≈ 0.026 SOL
total for the singletons (paid once at bootstrap).

