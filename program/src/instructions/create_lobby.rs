use anchor_lang::prelude::*;
use crate::constants::*;
use crate::state::*;

/// One-time bootstrap. Called once when the program is deployed (or after a
/// `close_lobby` wipe). Subsequent matches are run by calling `reset_lobby`
/// instead — the same Lobby/Vault/Leaderboard PDAs are reused.
pub fn create_lobby(ctx: Context<CreateLobby>, lobby_id: u64, entry_fee: u64) -> Result<()> {
    let lobby_key = ctx.accounts.lobby.key();
    let authority_key = ctx.accounts.authority.key();
    let lobby_bump = ctx.bumps.lobby;

    {
        let mut lobby = ctx.accounts.lobby.load_init()?;
        lobby.lobby_id = lobby_id;
        lobby.authority = authority_key;
        lobby.entry_fee = entry_fee;
        lobby.player_count = 0;
        lobby.players = [Pubkey::default(); MAX_PLAYERS];
        lobby.status = STATUS_OPEN;
        lobby.started_at = 0;
        lobby.match_end_time = 0;
        lobby.bump = lobby_bump;
        lobby._padding = [0; 5];
    }

    let vault = &mut ctx.accounts.vault;
    vault.lobby = lobby_key;
    vault.total_pot = 0;
    vault.bump = ctx.bumps.vault;

    Ok(())
}

#[derive(Accounts)]
pub struct CreateLobby<'info> {
    #[account(
        init,
        payer = authority,
        space = Lobby::LEN,
        seeds = [LOBBY_SEED, authority.key().as_ref()],
        bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        init,
        payer = authority,
        space = Vault::LEN,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    /// The backend server keypair — becomes the lobby authority.
    #[account(mut)]
    pub authority: Signer<'info>,

    pub system_program: Program<'info, System>,
}
