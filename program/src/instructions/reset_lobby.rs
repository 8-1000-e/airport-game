use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Reset the lobby for the next match. Must be SETTLED. Sweeps any vault
/// dust to the authority before zeroing `total_pot`.
pub fn reset_lobby(
    ctx: Context<ResetLobby>,
    _lobby_id: u64,
    new_lobby_id: u64,
    new_entry_fee: u64,
) -> Result<()> {
    {
        let lobby = ctx.accounts.lobby.load()?;
        require!(lobby.status == STATUS_SETTLED, LobbyError::LobbyNotSettled);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
    }

    // Sweep any dust out of the vault before resetting.
    let vault_acc_info = ctx.accounts.vault.to_account_info();
    let vault_rent_exempt = Rent::get()?.minimum_balance(Vault::LEN);
    let vault_lamports = vault_acc_info.lamports();
    if vault_lamports > vault_rent_exempt {
        let dust = vault_lamports - vault_rent_exempt;
        ctx.accounts.vault.sub_lamports(dust)?;
        ctx.accounts.authority.add_lamports(dust)?;
    }

    {
        let mut lobby = ctx.accounts.lobby.load_mut()?;
        lobby.lobby_id = new_lobby_id;
        lobby.entry_fee = new_entry_fee;
        lobby.player_count = 0;
        lobby.players = [Pubkey::default(); MAX_PLAYERS];
        lobby.status = STATUS_OPEN;
        lobby.started_at = 0;
        lobby.match_end_time = 0;
    }

    let vault = &mut ctx.accounts.vault;
    vault.total_pot = 0;

    Ok(())
}

#[derive(Accounts)]
#[instruction(lobby_id: u64)]
pub struct ResetLobby<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED, lobby_id.to_le_bytes().as_ref()],
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
