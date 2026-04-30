use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Remove a player from an open lobby and refund their entry fee. Signed
/// by the backend authority on behalf of the player (verified via JWT
/// server-side).
///
/// remaining_accounts[0] = player wallet (writable, receives refund)
pub fn leave_lobby(ctx: Context<LeaveLobby>, player: Pubkey) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;

    require!(lobby.status == STATUS_OPEN, LobbyError::LobbyNotOpen);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );

    // A player can only leave while they're the sole occupant of the lobby —
    // once a 2nd player joins, the 60s pre-match countdown starts and
    // everyone is committed.
    require!(lobby.player_count == 1, LobbyError::CannotLeaveWithOthers);

    let count = lobby.player_count as usize;
    let idx = lobby.players[..count]
        .iter()
        .position(|p| p == &player)
        .ok_or(LobbyError::NotInLobby)?;

    let rem = ctx.remaining_accounts;
    require!(rem.len() >= 1, LobbyError::NotEnoughAccounts);
    require_keys_eq!(rem[0].key(), player, LobbyError::LeaderboardMismatch);

    // Refund entry_fee minus leave fee — leave fee goes to authority
    let refund = lobby.entry_fee.saturating_sub(LEAVE_FEE);
    let fee = lobby.entry_fee - refund;
    ctx.accounts.vault.sub_lamports(lobby.entry_fee)?;
    rem[0].add_lamports(refund)?;
    ctx.accounts.authority.add_lamports(fee)?;

    for i in idx..(count - 1) {
        lobby.players[i] = lobby.players[i + 1];
    }
    lobby.players[count - 1] = Pubkey::default();
    lobby.player_count -= 1;

    let vault = &mut ctx.accounts.vault;
    vault.total_pot = vault.total_pot.saturating_sub(lobby.entry_fee);

    Ok(())
}

#[derive(Accounts)]
pub struct LeaveLobby<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED],
        bump = lobby.bump,
    )]
    pub lobby: Account<'info, Lobby>,

    #[account(
        mut,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
