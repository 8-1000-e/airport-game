use anchor_lang::prelude::*;
use crate::constants::MAX_PLAYERS;

/// Lobby metadata. Seeds: ["lobby"]. Singleton — reused match-to-match.
/// **Zero-copy account** so the players array doesn't blow the SBF stack.
#[account(zero_copy(unsafe))]
#[repr(C)]
pub struct Lobby {
    pub lobby_id: u64,
    pub authority: Pubkey,
    pub entry_fee: u64,
    pub started_at: i64,
    pub match_end_time: i64,
    pub player_count: u8,
    /// 0 = Open, 1 = Started, 2 = Settled.
    pub status: u8,
    pub bump: u8,
    pub _padding: [u8; 5],
    /// Registered player wallets. Indexes beyond `player_count` are zeroed.
    pub players: [Pubkey; MAX_PLAYERS],
}

impl Lobby {
    /// 8 (disc) + 8 (id) + 32 (auth) + 8 (fee) + 8 (started) + 8 (end_time)
    /// + 1 (count) + 1 (status) + 1 (bump) + 5 (pad) + 32*MAX (players).
    pub const LEN: usize =
        8 + 8 + 32 + 8 + 8 + 8 + 1 + 1 + 1 + 5 + (32 * MAX_PLAYERS);
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

/// One entry in a Leaderboard. Zero-copy / Pod compatible.
#[zero_copy(unsafe)]
#[repr(C)]
#[derive(Default)]
pub struct LeaderboardEntry {
    pub player: Pubkey,
    /// Score from the player's single pick this match. `score == 0` means
    /// the player hasn't picked yet.
    pub score: u64,
}

impl LeaderboardEntry {
    /// 32 (player) + 8 (score) = 40.
    pub const SIZE: usize = 32 + 8;
}

/// Per-lobby leaderboard. Seeds: ["leaderboard", lobby.key()].
///
/// **Zero-copy account.** With many entries the struct is too big to
/// Borsh-deserialize onto the SBF stack (4 KB limit), so we map the bytes
/// directly via `AccountLoader::load() / load_mut()`.
#[account(zero_copy(unsafe))]
#[repr(C)]
pub struct Leaderboard {
    pub lobby: Pubkey,
    /// 0 = not finalized, 1 = finalized. (bool isn't Pod-compatible.)
    pub finalized: u8,
    /// Number of valid entries (players who actually scored).
    pub entry_count: u8,
    pub bump: u8,
    /// Pad up to the 8-byte alignment required by `LeaderboardEntry`.
    pub _padding: [u8; 5],
    pub entries: [LeaderboardEntry; MAX_PLAYERS],
}

impl Leaderboard {
    /// 8 (disc) + 32 (lobby) + 1 (finalized) + 1 (count) + 1 (bump) + 5 pad
    /// + ENTRY_SIZE*MAX (entries).
    pub const LEN: usize =
        8 + 32 + 1 + 1 + 1 + 5 + (LeaderboardEntry::SIZE * MAX_PLAYERS);
}
