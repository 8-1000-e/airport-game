use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Permanently close the singleton Lobby/Vault/Leaderboard PDAs. Emergency /
/// migration only — normal post-match flow uses `reset_lobby` + `reset_leaderboard`.
///
/// Authority-gated. Status check intentionally absent: this is the migration
/// escape hatch (e.g. when the on-chain account size no longer matches the
/// program's struct after a layout change), so it must work regardless of
/// match state. Bumps are recomputed by Anchor's `find_program_address`
/// rather than read from account data — so the leaderboard is never
/// deserialized, which is critical when its on-chain size predates the
/// current Leaderboard layout (would otherwise fail `load()`).
pub fn close_lobby(ctx: Context<CloseLobby>, _lobby_id: u64) -> Result<()> {
    {
        let lobby = ctx.accounts.lobby.load()?;
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );
    }

    // Manually close the leaderboard PDA (raw lamport sweep + zero + reassign).
    // We can't use `close = authority` on it because Anchor's `close` constraint
    // requires Account/AccountLoader, both of which would `load()` the data —
    // and on a post-layout-change migration the existing on-chain bytes don't
    // fit the current `Leaderboard` struct, so `load()` blows up. Doing the
    // close inline lets us reclaim the rent without ever interpreting the data.
    let lb_info = ctx.accounts.leaderboard.to_account_info();
    let auth_info = ctx.accounts.authority.to_account_info();
    let lb_lamports = lb_info.lamports();
    **auth_info.try_borrow_mut_lamports()? = auth_info
        .lamports()
        .checked_add(lb_lamports)
        .ok_or(LobbyError::VaultUnderflow)?;
    **lb_info.try_borrow_mut_lamports()? = 0;
    lb_info.resize(0)?;
    lb_info.assign(&anchor_lang::system_program::ID);
    Ok(())
}

#[derive(Accounts)]
#[instruction(lobby_id: u64)]
pub struct CloseLobby<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED, lobby_id.to_le_bytes().as_ref()],
        bump,
        close = authority,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        mut,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump,
        close = authority,
    )]
    pub vault: Account<'info, Vault>,

    /// CHECK: Closed manually in the handler (see comment there). Validated
    /// via seeds + auto bump; data layout is intentionally not interpreted
    /// because the on-chain account may predate the current Leaderboard
    /// struct size (migration scenario).
    #[account(
        mut,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump,
    )]
    pub leaderboard: UncheckedAccount<'info>,

    #[account(mut)]
    pub authority: Signer<'info>,
}
