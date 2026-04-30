use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// One-time bootstrap of the Leaderboard PDA. Called once after `create_lobby`.
/// Subsequent matches reuse this same Leaderboard via `reset_leaderboard`.
pub fn init_leaderboard(ctx: Context<InitLeaderboard>) -> Result<()> {
    let lobby = &ctx.accounts.lobby;
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );

    let leaderboard = &mut ctx.accounts.leaderboard;
    leaderboard.lobby = lobby.key();
    leaderboard.finalized = false;
    leaderboard.entry_count = 0;
    leaderboard.entries = [LeaderboardEntry::default(); MAX_PLAYERS];
    leaderboard.bump = ctx.bumps.leaderboard;

    Ok(())
}

#[derive(Accounts)]
pub struct InitLeaderboard<'info> {
    #[account(
        seeds = [LOBBY_SEED],
        bump = lobby.bump,
    )]
    pub lobby: Account<'info, Lobby>,

    #[account(
        init,
        payer = authority,
        space = Leaderboard::LEN,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump,
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
