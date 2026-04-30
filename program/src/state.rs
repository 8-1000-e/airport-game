use anchor_lang::prelude::*;
use crate::constants::MAX_PLAYERS;

/// Lobby metadata. Seeds: ["lobby", lobby_id_le_bytes].
/// Rent-exempt, owned by this program.
#[account]
pub struct Lobby {
    pub lobby_id: u64,
    /// Server keypair — the only one allowed to start/distribute/close.
    pub authority: Pubkey,
    /// Entry fee in lamports. Each `join_lobby` transfers this to the vault.
    pub entry_fee: u64,
    /// Number of registered players.
    pub player_count: u8,
    /// Registered player wallets. Indexes beyond `player_count` are zeroed.
    pub players: [Pubkey; MAX_PLAYERS],
    /// 0 = Open, 1 = Started, 2 = Settled. See `constants.rs`.
    pub status: u8,
    /// Unix timestamp when start_match was called for the current match
    /// (0 otherwise).
    pub started_at: i64,
    /// Unix timestamp at which the pick window closes (= started_at +
    /// MATCH_DURATION_SECS). 0 when no match is running. Read by
    /// pick_luggage to reject late picks.
    pub match_end_time: i64,
    pub bump: u8,
}

impl Lobby {
    /// 8 (disc) + 8 (id) + 32 (auth) + 8 (fee) + 1 (count) + 32*MAX (players)
    /// + 1 (status) + 8 (started) + 8 (end_time) + 1 (bump).
    pub const LEN: usize =
        8 + 8 + 32 + 8 + 1 + (32 * MAX_PLAYERS) + 1 + 8 + 8 + 1;
}

/// Vault PDA that physically holds the entry-fee lamports.
/// Seeds: ["vault", lobby.key()]. Owned by this program so we can
/// sub_lamports() directly in distribute_prize.
#[account]
pub struct Vault {
    pub lobby: Pubkey,
    pub total_pot: u64,
    pub bump: u8,
}

impl Vault {
    /// 8 (disc) + 32 (lobby) + 8 (pot) + 1 (bump) = 49.
    pub const LEN: usize = 8 + 32 + 8 + 1;
}

/// One entry in a Leaderboard. Stored inline in a fixed-size array — Anchor
/// serializes this with a stable byte layout.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, Default)]
pub struct LeaderboardEntry {
    pub player: Pubkey,
    /// Score from the player's single pick this match. `score == 0` means
    /// the player hasn't picked yet (the slot is reserved or just default).
    pub score: u64,
}

impl LeaderboardEntry {
    /// 32 (player) + 8 (score) = 40.
    pub const SIZE: usize = 32 + 8;
}

/// Per-lobby leaderboard. Seeds: ["leaderboard", lobby.key()].
///
/// The backend writes scores via `pick_luggage` calls during the match —
/// each call inserts/updates one player's score (each player picks at most
/// once) and bubble-sorts the array to keep score DESC order.
/// `finalize_leaderboard` flips the gate at match end.
///
/// Anti-scam still applies in `distribute_prize`: every winner wallet in
/// remaining_accounts must match `entries[i].player` at the same index.
#[account]
pub struct Leaderboard {
    pub lobby: Pubkey,
    /// Set to true by `finalize_leaderboard`. `distribute_prize` requires
    /// this so it can't run while picks are still being recorded.
    pub finalized: bool,
    /// Number of valid entries (players who actually scored). Players who
    /// joined but never picked anything are NOT in the leaderboard.
    pub entry_count: u8,
    pub entries: [LeaderboardEntry; MAX_PLAYERS],
    pub bump: u8,
}

impl Leaderboard {
    /// 8 (disc) + 32 (lobby) + 1 (finalized) + 1 (count)
    /// + ENTRY_SIZE*MAX (entries) + 1 (bump).
    pub const LEN: usize =
        8 + 32 + 1 + 1 + (LeaderboardEntry::SIZE * MAX_PLAYERS) + 1;
}
