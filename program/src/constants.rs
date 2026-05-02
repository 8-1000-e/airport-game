// PDA seeds
pub const LOBBY_SEED: &[u8] = b"lobby";
pub const VAULT_SEED: &[u8] = b"vault";
pub const LEADERBOARD_SEED: &[u8] = b"leaderboard";

// Caps
pub const MAX_PLAYERS: usize = 100;

// Platform rake, in basis points (100 bps = 1%)
pub const PLATFORM_FEE_BPS: u64 = 500; // 5%

// Fee charged on leave to prevent join/leave spam (covers backend's tx fee)
pub const LEAVE_FEE: u64 = 200_000; // 0.0001 SOL

// Lobby status values
pub const STATUS_OPEN: u8 = 0;
pub const STATUS_STARTED: u8 = 1;
pub const STATUS_SETTLED: u8 = 2;

// Hard time window after `start_match` during which `pick_luggage` is
// accepted. Late picks are rejected on-chain even if the backend's clock
// drifts.
pub const MATCH_DURATION_SECS: i64 = 90;

/// Max number of `pick_luggage` calls accepted per player per match.
/// Score is cumulative — the leaderboard entry sums all picks.
pub const MAX_PICKS_PER_PLAYER: u8 = 3;
