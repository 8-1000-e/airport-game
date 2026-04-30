use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;

/// Backend records that `player` just picked a luggage worth `points` points.
/// One pick per player per match — the security check is "score must be 0
/// before this call". A second call from the same player therefore rejects
/// with `AlreadyPicked`.
///
/// Picks are also rejected past `lobby.match_end_time`, even if the backend
/// hasn't called `finalize_leaderboard` yet.
pub fn pick_luggage(
    ctx: Context<PickLuggage>,
    player: Pubkey,
    points: u64,
) -> Result<()> {
    {
        let lobby = ctx.accounts.lobby.load()?;
        require!(lobby.status == STATUS_STARTED, LobbyError::LobbyNotStarted);
        require_keys_eq!(
            ctx.accounts.authority.key(),
            lobby.authority,
            LobbyError::Unauthorized
        );

        let now = Clock::get()?.unix_timestamp;
        require!(now < lobby.match_end_time, LobbyError::MatchWindowExpired);

        let players_in_lobby = &lobby.players[..lobby.player_count as usize];
        require!(
            players_in_lobby.iter().any(|p| p == &player),
            LobbyError::EntryPlayerNotInLobby
        );
    }

    let mut leaderboard = ctx.accounts.leaderboard.load_mut()?;
    require!(
        leaderboard.finalized == 0,
        LobbyError::LeaderboardAlreadyFinalized
    );

    let count = leaderboard.entry_count as usize;

    // Security: an existing entry with score != 0 means already picked.
    let existing = leaderboard.entries[..count]
        .iter()
        .position(|e| e.player == player);

    let mut idx = match existing {
        Some(i) => {
            require!(
                leaderboard.entries[i].score == 0,
                LobbyError::AlreadyPicked
            );
            leaderboard.entries[i].score = points;
            i
        }
        None => {
            require!(count < MAX_PLAYERS, LobbyError::TooManyEntries);
            leaderboard.entries[count] = LeaderboardEntry {
                player,
                score: points,
            };
            leaderboard.entry_count += 1;
            count
        }
    };

    // Bubble up to maintain score DESC order.
    while idx > 0 {
        let cur_score = leaderboard.entries[idx].score;
        let prev_score = leaderboard.entries[idx - 1].score;
        if cur_score > prev_score {
            leaderboard.entries.swap(idx - 1, idx);
            idx -= 1;
        } else {
            break;
        }
    }

    Ok(())
}

#[derive(Accounts)]
pub struct PickLuggage<'info> {
    #[account(
        seeds = [LOBBY_SEED],
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        mut,
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump = leaderboard.load()?.bump,
    )]
    pub leaderboard: AccountLoader<'info, Leaderboard>,

    pub authority: Signer<'info>,
}
