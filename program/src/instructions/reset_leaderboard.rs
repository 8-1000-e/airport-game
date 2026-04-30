use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Reset the leaderboard so it can be reused for the next match. Must be
/// called between matches (after the previous distribute_prize and before
/// the next batch of pick_luggage calls).
pub fn reset_leaderboard(ctx: Context<ResetLeaderboard>) -> Result<()> {
    let lobby = &ctx.accounts.lobby;
    // We allow reset whether the lobby has already been reset to OPEN or is
    // still SETTLED — both are valid moments. The only state that's wrong is
    // STARTED (a match is in progress).
    require!(lobby.status != STATUS_STARTED, LobbyError::LobbyNotSettled);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );

    let leaderboard = &mut ctx.accounts.leaderboard;
    leaderboard.finalized = false;
    leaderboard.entry_count = 0;
    leaderboard.entries = [LeaderboardEntry::default(); MAX_PLAYERS];

    Ok(())
}

#[derive(Accounts)]
pub struct ResetLeaderboard<'info> {
    #[account(
        seeds = [LOBBY_SEED],
        bump = lobby.bump,
    )]
    pub lobby: Account<'info, Lobby>,

    #[account(
        mut,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump = leaderboard.bump,
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    pub authority: Signer<'info>,
}
