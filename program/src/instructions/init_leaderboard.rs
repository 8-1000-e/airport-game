use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// One-time bootstrap of the Leaderboard PDA. Called once after `create_lobby`.
/// Subsequent matches reuse this same Leaderboard via `reset_leaderboard`.
pub fn init_leaderboard(ctx: Context<InitLeaderboard>, _lobby_id: u64) -> Result<()> {
    let lobby_key = ctx.accounts.lobby.key();
    {
        let lobby = ctx.accounts.lobby.load()?;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
    }

    let mut leaderboard = ctx.accounts.leaderboard.load_init()?;
    leaderboard.lobby = lobby_key;
    leaderboard.finalized = 0;
    leaderboard.entry_count = 0;
    leaderboard.bump = ctx.bumps.leaderboard;
    leaderboard._padding = [0; 5];
    leaderboard.entries = [LeaderboardEntry::default(); MAX_PLAYERS];

    Ok(())
}

#[derive(Accounts)]
#[instruction(lobby_id: u64)]
pub struct InitLeaderboard<'info> {
    #[account(
        seeds = [LOBBY_SEED, lobby_id.to_le_bytes().as_ref()],
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        init,
        payer = authority,
        space = Leaderboard::LEN,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump,
    )]
    pub leaderboard: AccountLoader<'info, Leaderboard>,

    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
