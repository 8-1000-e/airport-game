use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Mark the leaderboard as final so `distribute_prize` can run. The
/// leaderboard is already up-to-date thanks to `pick_luggage` calls during
/// the match — this is just the gate that says "no more picks accepted".
pub fn finalize_leaderboard(ctx: Context<FinalizeLeaderboard>) -> Result<()> {
    let lobby = &ctx.accounts.lobby;
    require!(lobby.status == STATUS_STARTED, LobbyError::LobbyNotStarted);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );

    let leaderboard = &mut ctx.accounts.leaderboard;
    require!(
        !leaderboard.finalized,
        LobbyError::LeaderboardAlreadyFinalized
    );
    leaderboard.finalized = true;

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeLeaderboard<'info> {
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
