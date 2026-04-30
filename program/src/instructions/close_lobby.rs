use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Permanently close the singleton Lobby/Vault/Leaderboard PDAs. Use only
/// for emergency tear-down or version migration — normal post-match flow
/// uses `reset_lobby` + `reset_leaderboard` instead.
pub fn close_lobby(ctx: Context<CloseLobby>) -> Result<()> {
    let lobby = &ctx.accounts.lobby;
    require!(lobby.status == STATUS_SETTLED, LobbyError::AlreadySettled);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );
    Ok(())
}

#[derive(Accounts)]
pub struct CloseLobby<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED],
        bump = lobby.bump,
        close = authority,
    )]
    pub lobby: Account<'info, Lobby>,

    #[account(
        mut,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump = vault.bump,
        close = authority,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        mut,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump = leaderboard.bump,
        close = authority,
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
