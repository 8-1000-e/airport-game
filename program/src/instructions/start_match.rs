use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

pub fn start_match(ctx: Context<StartMatch>, _lobby_id: u64) -> Result<()> {
    let mut lobby = ctx.accounts.lobby.load_mut()?;

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
#[instruction(lobby_id: u64)]
pub struct StartMatch<'info> {
    #[account(
        mut,
        seeds = [LOBBY_SEED, lobby_id.to_le_bytes().as_ref()],
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    pub authority: Signer<'info>,
}
