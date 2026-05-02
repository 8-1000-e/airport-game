use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Mark the leaderboard as final so `distribute_prize` can run.
pub fn finalize_leaderboard(ctx: Context<FinalizeLeaderboard>) -> Result<()> {
    {
        let lobby = ctx.accounts.lobby.load()?;
        require!(lobby.status == STATUS_STARTED, LobbyError::LobbyNotStarted);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
    }

    let mut leaderboard = ctx.accounts.leaderboard.load_mut()?;
    require!(
        leaderboard.finalized == 0,
        LobbyError::LeaderboardAlreadyFinalized
    );
    leaderboard.finalized = 1;

    Ok(())
}

#[derive(Accounts)]
pub struct FinalizeLeaderboard<'info> {
    #[account(
        seeds = [LOBBY_SEED, authority.key().as_ref()],
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        mut,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump = leaderboard.load()?.bump,
    )]
    pub leaderboard: AccountLoader<'info, Leaderboard>,

    pub authority: Signer<'info>,
}
