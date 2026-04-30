use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Reset the lobby for the next match. Lobby must be SETTLED (i.e. the
/// previous match was either distributed or refunded). Any dust left in the
/// vault is swept to the authority before zeroing `total_pot`.
///
/// `new_lobby_id` is a fresh match identifier (typically previous + 1) used
/// for off-chain tracking and emitted in the next match's PrizeDistributed
/// event. `new_entry_fee` lets the operator change pricing between matches.
pub fn reset_lobby(
    ctx: Context<ResetLobby>,
    new_lobby_id: u64,
    new_entry_fee: u64,
) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;
    require!(lobby.status == STATUS_SETTLED, LobbyError::LobbyNotSettled);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );

    // Sweep any dust (rounding residual from the previous distribute_prize)
    // out of the vault before resetting.
    let vault_acc_info = ctx.accounts.vault.to_account_info();
    let vault_rent_exempt = Rent::get()?.minimum_balance(Vault::LEN);
    let vault_lamports = vault_acc_info.lamports();
    if vault_lamports > vault_rent_exempt {
        let dust = vault_lamports - vault_rent_exempt;
        ctx.accounts.vault.sub_lamports(dust)?;
        ctx.accounts.authority.add_lamports(dust)?;
    }

    // Reset lobby state
    lobby.lobby_id = new_lobby_id;
    lobby.entry_fee = new_entry_fee;
    lobby.player_count = 0;
    lobby.players = [Pubkey::default(); MAX_PLAYERS];
    lobby.status = STATUS_OPEN;
    lobby.started_at = 0;
    lobby.match_end_time = 0;

    // Reset vault bookkeeping
    let vault = &mut ctx.accounts.vault;
    vault.total_pot = 0;

    Ok(())
}

#[derive(Accounts)]
pub struct ResetLobby<'info> {
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
