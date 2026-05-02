use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Refund all players their entry fee from the vault. Called by the backend
/// when a match launch fails after players have already paid.
///
/// remaining_accounts: player wallets in the same order as lobby.players[]
pub fn refund_lobby(ctx: Context<RefundLobby>) -> Result<()> {
    let (count, entry_fee, players) = {
        let lobby = ctx.accounts.lobby.load()?;
        require!(lobby.status != STATUS_SETTLED, LobbyError::AlreadySettled);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
        (
            lobby.player_count as usize,
            lobby.entry_fee,
            lobby.players,
        )
    };

    let rem = ctx.remaining_accounts;
    require!(rem.len() >= count, LobbyError::NotEnoughAccounts);

    for i in 0..count {
        require_keys_eq!(
            rem[i].key(),
            players[i],
            LobbyError::LeaderboardMismatch
        );
    }

    for i in 0..count {
        ctx.accounts.vault.sub_lamports(entry_fee)?;
        rem[i].add_lamports(entry_fee)?;
    }

    let vault_mut = &mut ctx.accounts.vault;
    vault_mut.total_pot = 0;

    let mut lobby_mut = ctx.accounts.lobby.load_mut()?;
    lobby_mut.status = STATUS_SETTLED;

    Ok(())
}

#[derive(Accounts)]
pub struct RefundLobby<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED, authority.key().as_ref()],
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        mut,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    pub authority: Signer<'info>,
}
