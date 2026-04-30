use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Remove a player from an open lobby and refund their entry fee. Signed
/// by the backend authority on behalf of the player (verified via JWT
/// server-side). Only allowed when player is alone in the lobby.
///
/// remaining_accounts[0] = player wallet (writable, receives refund)
pub fn leave_lobby(ctx: Context<LeaveLobby>, player: Pubkey) -> Result<()> {
    let entry_fee = {
        let lobby = ctx.accounts.lobby.load()?;
        require!(lobby.status == STATUS_OPEN, LobbyError::LobbyNotOpen);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
        require!(lobby.player_count == 1, LobbyError::CannotLeaveWithOthers);
        lobby.entry_fee
    };

    let rem = ctx.remaining_accounts;
    require!(rem.len() >= 1, LobbyError::NotEnoughAccounts);
    require_keys_eq!(rem[0].key(), player, LobbyError::LeaderboardMismatch);

    let refund = entry_fee.saturating_sub(LEAVE_FEE);
    let fee = entry_fee - refund;
    ctx.accounts.vault.sub_lamports(entry_fee)?;
    rem[0].add_lamports(refund)?;
    ctx.accounts.authority.add_lamports(fee)?;

    {
        let mut lobby = ctx.accounts.lobby.load_mut()?;
        let count = lobby.player_count as usize;
        let idx = lobby.players[..count]
            .iter()
            .position(|p| p == &player)
            .ok_or(LobbyError::NotInLobby)?;
        for i in idx..(count - 1) {
            lobby.players[i] = lobby.players[i + 1];
        }
        lobby.players[count - 1] = Pubkey::default();
        lobby.player_count -= 1;
    }

    let vault = &mut ctx.accounts.vault;
    vault.total_pot = vault.total_pot.saturating_sub(entry_fee);

    Ok(())
}

#[derive(Accounts)]
pub struct LeaveLobby<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED],
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        mut,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
