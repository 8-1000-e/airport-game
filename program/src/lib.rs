use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

pub use instructions::*;
pub use state::LeaderboardEntry;

// Placeholder — gets replaced by `anchor keys sync` once the program
// keypair is generated under target/deploy/.
declare_id!("DSxQtZoKFeF7xzpcSCTNgxocf8kazFEtvT2iC5GY3iMk");

#[event]
pub struct PrizeDistributed {
    pub lobby_id: u64,
    pub total_pot: u64,
    pub treasury_cut: u64,
    pub winner_count: u8,
    pub winner_pubkeys: Vec<Pubkey>,
    pub winner_amounts: Vec<u64>,
}

#[program]
pub mod airport_carousel_lobby {
    use super::*;

    /// One-time bootstrap of the singleton Lobby + Vault PDAs.
    pub fn create_lobby(ctx: Context<CreateLobby>, lobby_id: u64, entry_fee: u64) -> Result<()> {
        instructions::create_lobby::create_lobby(ctx, lobby_id, entry_fee)
    }

    /// One-time bootstrap of the singleton Leaderboard PDA.
    pub fn init_leaderboard(ctx: Context<InitLeaderboard>) -> Result<()> {
        instructions::init_leaderboard::init_leaderboard(ctx)
    }

    /// A player joins the open lobby and pays the entry fee into the vault.
    pub fn join_lobby(ctx: Context<JoinLobby>) -> Result<()> {
        instructions::join_lobby::join_lobby(ctx)
    }

    /// Backend locks the lobby — no more joins. Match runs off-chain.
    pub fn start_match(ctx: Context<StartMatch>) -> Result<()> {
        instructions::start_match::start_match(ctx)
    }

    /// Backend records that `player` picked a luggage worth `points` points.
    /// Called once per drop into the box during an active match. Inserts
    /// the player's score and re-sorts the leaderboard. Each player can
    /// pick at most once per match.
    pub fn pick_luggage(
        ctx: Context<PickLuggage>,
        player: Pubkey,
        points: u64,
    ) -> Result<()> {
        instructions::pick_luggage::pick_luggage(ctx, player, points)
    }

    /// Backend marks the leaderboard final once the match ends. Required
    /// before `distribute_prize` can run.
    pub fn finalize_leaderboard(ctx: Context<FinalizeLeaderboard>) -> Result<()> {
        instructions::finalize_leaderboard::finalize_leaderboard(ctx)
    }

    /// Backend distributes the vault to the top half of the leaderboard +
    /// treasury rake. Sets lobby.status = SETTLED.
    ///
    /// remaining_accounts: winner wallets in leaderboard order.
    pub fn distribute_prize(ctx: Context<DistributePrize>) -> Result<()> {
        instructions::distribute_prize::distribute_prize(ctx)
    }

    /// Player leaves the open lobby — refund minus a small spam fee.
    /// Backend-signed (JWT-verified server-side).
    pub fn leave_lobby(ctx: Context<LeaveLobby>, player: Pubkey) -> Result<()> {
        instructions::leave_lobby::leave_lobby(ctx, player)
    }

    /// Refund all players from the vault when a match launch fails.
    /// remaining_accounts: player wallets in lobby.players[] order.
    pub fn refund_lobby(ctx: Context<RefundLobby>) -> Result<()> {
        instructions::refund_lobby::refund_lobby(ctx)
    }

    /// Reset the lobby for the next match. Lobby must be SETTLED. Sweeps
    /// any vault dust to the authority before zeroing the pot. The backend
    /// passes `new_lobby_id` (typically previous + 1) and may change
    /// `new_entry_fee`.
    pub fn reset_lobby(
        ctx: Context<ResetLobby>,
        new_lobby_id: u64,
        new_entry_fee: u64,
    ) -> Result<()> {
        instructions::reset_lobby::reset_lobby(ctx, new_lobby_id, new_entry_fee)
    }

    /// Reset the leaderboard so it can be reused for the next match. Must
    /// be paired with `reset_lobby` between rounds.
    pub fn reset_leaderboard(ctx: Context<ResetLeaderboard>) -> Result<()> {
        instructions::reset_leaderboard::reset_leaderboard(ctx)
    }

    /// Permanently close the singleton PDAs. Emergency / migration only —
    /// normal post-match flow uses `reset_lobby` + `reset_leaderboard`.
    pub fn close_lobby(ctx: Context<CloseLobby>) -> Result<()> {
        instructions::close_lobby::close_lobby(ctx)
    }
}
