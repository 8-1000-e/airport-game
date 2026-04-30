use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Permanently close the singleton Lobby/Vault/Leaderboard PDAs. Emergency /
/// migration only — normal post-match flow uses `reset_lobby` + `reset_leaderboard`.
pub fn close_lobby(ctx: Context<CloseLobby>) -> Result<()> {
    let lobby = ctx.accounts.lobby.load()?;
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
        bump = lobby.load()?.bump,
        close = authority,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

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
        bump = leaderboard.load()?.bump,
        close = authority,
    )]
    pub leaderboard: AccountLoader<'info, Leaderboard>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
