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

    /// Init the per-lobby Leaderboard PDA. Called once per round right
    /// after `create_lobby(lobby_id)` so each match has its own ranking.
    pub fn init_leaderboard(ctx: Context<InitLeaderboard>, lobby_id: u64) -> Result<()> {
        instructions::init_leaderboard::init_leaderboard(ctx, lobby_id)
    }

    /// A player joins the open lobby and pays the entry fee into the vault.
    pub fn join_lobby(ctx: Context<JoinLobby>, lobby_id: u64) -> Result<()> {
        instructions::join_lobby::join_lobby(ctx, lobby_id)
    }

    /// Backend locks the lobby — no more joins. Match runs off-chain.
    pub fn start_match(ctx: Context<StartMatch>, lobby_id: u64) -> Result<()> {
        instructions::start_match::start_match(ctx, lobby_id)
    }

    /// Backend records that `player` picked a luggage worth `points` points.
    /// Called once per drop into the box during an active match. Inserts
    /// the player's score and re-sorts the leaderboard. Each player can
    /// pick at most once per match.
    pub fn pick_luggage(
        ctx: Context<PickLuggage>,
        lobby_id: u64,
        player: Pubkey,
        points: u64,
    ) -> Result<()> {
        instructions::pick_luggage::pick_luggage(ctx, lobby_id, player, points)
    }

    /// Backend marks the leaderboard final once the match ends. Required
    /// before `distribute_prize` can run.
    pub fn finalize_leaderboard(
        ctx: Context<FinalizeLeaderboard>,
        lobby_id: u64,
    ) -> Result<()> {
        instructions::finalize_leaderboard::finalize_leaderboard(ctx, lobby_id)
    }

    /// Backend distributes the vault to the top half of the leaderboard +
    /// treasury rake. Sets lobby.status = SETTLED.
    ///
    /// remaining_accounts: winner wallets in leaderboard order.
    pub fn distribute_prize(ctx: Context<DistributePrize>, lobby_id: u64) -> Result<()> {
        instructions::distribute_prize::distribute_prize(ctx, lobby_id)
    }

    /// Player leaves the open lobby — refund minus a small spam fee.
    /// Backend-signed (JWT-verified server-side).
    pub fn leave_lobby(
        ctx: Context<LeaveLobby>,
        lobby_id: u64,
        player: Pubkey,
    ) -> Result<()> {
        instructions::leave_lobby::leave_lobby(ctx, lobby_id, player)
    }

    /// Refund all players from the vault when a match launch fails.
    /// remaining_accounts: player wallets in lobby.players[] order.
    pub fn refund_lobby(ctx: Context<RefundLobby>, lobby_id: u64) -> Result<()> {
        instructions::refund_lobby::refund_lobby(ctx, lobby_id)
    }

    /// Reset an existing lobby for re-use — vestigial safety hatch kept
    /// from the singleton-PDA era. In the multi-lobby model the back
    /// closes the lobby after each round and creates a fresh PDA for
    /// the next round; this stays callable for emergency operator use.
    /// `lobby_id` is the seed-key of the PDA to reset; `new_lobby_id` /
    /// `new_entry_fee` overwrite the data fields.
    pub fn reset_lobby(
        ctx: Context<ResetLobby>,
        lobby_id: u64,
        new_lobby_id: u64,
        new_entry_fee: u64,
    ) -> Result<()> {
        instructions::reset_lobby::reset_lobby(
            ctx,
            lobby_id,
            new_lobby_id,
            new_entry_fee,
        )
    }

    /// Reset the leaderboard for an existing PDA — vestigial safety
    /// hatch, see `reset_lobby` for context.
    pub fn reset_leaderboard(
        ctx: Context<ResetLeaderboard>,
        lobby_id: u64,
    ) -> Result<()> {
        instructions::reset_leaderboard::reset_leaderboard(ctx, lobby_id)
    }

    /// Close the lobby + vault + leaderboard PDAs to reclaim rent. The
    /// normal post-match flow in the multi-lobby model — each round
    /// burns through its own PDA set.
    pub fn close_lobby(ctx: Context<CloseLobby>, lobby_id: u64) -> Result<()> {
        instructions::close_lobby::close_lobby(ctx, lobby_id)
    }
}
