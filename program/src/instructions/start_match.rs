use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

pub fn start_match(ctx: Context<StartMatch>) -> Result<()> {
    let lobby = &mut ctx.accounts.lobby;

    require!(lobby.status == STATUS_OPEN, LobbyError::LobbyNotOpen);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );

    let now = Clock::get()?.unix_timestamp;
    lobby.status = STATUS_STARTED;
    lobby.started_at = now;
    lobby.match_end_time = now + MATCH_DURATION_SECS;

    Ok(())
}

#[derive(Accounts)]
pub struct StartMatch<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED],
        bump = lobby.bump,
    )]
    pub lobby: Account<'info, Lobby>,

    /// Must match lobby.authority — enforced in the handler.
    pub authority: Signer<'info>,
}
