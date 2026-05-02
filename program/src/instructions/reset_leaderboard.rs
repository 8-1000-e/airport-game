use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Reset the leaderboard so it can be reused for the next match. Must be
/// called between matches (after the previous distribute_prize and before
/// the next batch of pick_luggage calls).
pub fn reset_leaderboard(ctx: Context<ResetLeaderboard>) -> Result<()> {
    {
        let lobby = ctx.accounts.lobby.load()?;
        require!(lobby.status != STATUS_STARTED, LobbyError::LobbyNotSettled);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
    }

    let mut leaderboard = ctx.accounts.leaderboard.load_mut()?;
    leaderboard.finalized = 0;
    leaderboard.entry_count = 0;
    leaderboard.entries = [LeaderboardEntry::default(); MAX_PLAYERS];

    Ok(())
}

#[derive(Accounts)]
pub struct ResetLeaderboard<'info> {
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
