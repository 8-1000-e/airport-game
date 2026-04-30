use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;
use crate::PrizeDistributed;

/// Distribution:
///   - Top half = floor(player_count / 2) slots, equal shares of 95% of pot
///   - Ties at the cutoff (same `score` as the entry at the cutoff) split
///     the last slot
///   - Treasury always gets 5% (100% if no winners)
///
/// Anti-scam: every wallet in `remaining_accounts` is verified against
/// `leaderboard.entries[i].player` at the same index. The leaderboard itself
/// is also verified to belong to this program (Anchor `Account<Leaderboard>`)
/// and to be finalized (i.e. `finalize_leaderboard` has been called).
pub fn distribute_prize(ctx: Context<DistributePrize>) -> Result<()> {
    let lobby = &ctx.accounts.lobby;

    require!(lobby.status == STATUS_STARTED, LobbyError::LobbyNotStarted);
    require_keys_eq!(
        ctx.accounts.authority.key(),
        lobby.authority,
        LobbyError::Unauthorized
    );
    require_keys_eq!(
        ctx.accounts.treasury.key(),
        lobby.authority,
        LobbyError::InvalidTreasury
    );

    let leaderboard = &ctx.accounts.leaderboard;
    require!(leaderboard.finalized, LobbyError::LeaderboardNotFinalized);

    let player_count = lobby.player_count;
    let lb_count = leaderboard.entry_count as usize;
    let lobby_id = lobby.lobby_id;

    // Cutoff = top floor(player_count/2) — but we can't pay more winners
    // than the leaderboard knows about (players who never picked don't have
    // an entry).
    let desired_cutoff = player_count as usize / 2;
    let cutoff = desired_cutoff.min(lb_count);

    let total_pot = ctx.accounts.vault.total_pot;

    // If no winners, treasury takes everything
    if cutoff == 0 {
        ctx.accounts.vault.sub_lamports(total_pot)?;
        ctx.accounts.treasury.add_lamports(total_pot)?;
        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.total_pot = 0;
        let lobby_mut = &mut ctx.accounts.lobby;
        lobby_mut.status = STATUS_SETTLED;
        emit!(PrizeDistributed {
            lobby_id,
            total_pot,
            treasury_cut: total_pot,
            winner_count: 0,
            winner_pubkeys: Vec::new(),
            winner_amounts: Vec::new(),
        });
        return Ok(());
    }

    // Dynamic fee: 2-player matches (1 winner) pay higher % to cover tx fees.
    //   player_count <= 2 → 8%
    //   player_count >= 3 → PLATFORM_FEE_BPS (5%)
    let fee_bps: u64 = if player_count <= 2 { 800 } else { PLATFORM_FEE_BPS };
    let treasury_cut = total_pot * fee_bps / 10_000;
    let winner_pool = total_pot - treasury_cut;
    let prize_per_slot = winner_pool / cutoff as u64;

    // Detect tie at cutoff (same score as the last winning entry)
    let last_idx = cutoff - 1;
    let last_score = leaderboard.entries[last_idx].score;

    let mut tied_count: usize = 1;
    {
        let mut i = cutoff;
        while i < lb_count {
            if leaderboard.entries[i].score == last_score {
                tied_count += 1;
                i += 1;
            } else {
                break;
            }
        }
    }

    let total_winners = cutoff - 1 + tied_count;

    // Verify remaining_accounts match leaderboard.entries[i].player
    let rem = ctx.remaining_accounts;
    require!(rem.len() >= total_winners, LobbyError::NotEnoughAccounts);
    for i in 0..total_winners {
        require_keys_eq!(
            rem[i].key(),
            leaderboard.entries[i].player,
            LobbyError::LeaderboardMismatch
        );
    }

    let tied_prize = prize_per_slot / tied_count as u64;

    let mut winner_pubkeys = Vec::with_capacity(total_winners);
    let mut winner_amounts = Vec::with_capacity(total_winners);

    for i in 0..(cutoff - 1) {
        ctx.accounts.vault.sub_lamports(prize_per_slot)?;
        rem[i].add_lamports(prize_per_slot)?;
        winner_pubkeys.push(rem[i].key());
        winner_amounts.push(prize_per_slot);
    }
    for i in 0..tied_count {
        let idx = (cutoff - 1) + i;
        ctx.accounts.vault.sub_lamports(tied_prize)?;
        rem[idx].add_lamports(tied_prize)?;
        winner_pubkeys.push(rem[idx].key());
        winner_amounts.push(tied_prize);
    }

    ctx.accounts.vault.sub_lamports(treasury_cut)?;
    ctx.accounts.treasury.add_lamports(treasury_cut)?;

    let paid: u64 = winner_amounts.iter().sum::<u64>() + treasury_cut;
    let vault_mut = &mut ctx.accounts.vault;
    vault_mut.total_pot = vault_mut.total_pot.saturating_sub(paid);

    let lobby_mut = &mut ctx.accounts.lobby;
    lobby_mut.status = STATUS_SETTLED;

    emit!(PrizeDistributed {
        lobby_id,
        total_pot,
        treasury_cut,
        winner_count: total_winners as u8,
        winner_pubkeys,
        winner_amounts,
    });

    Ok(())
}

#[derive(Accounts)]
pub struct DistributePrize<'info> {
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

    #[account(
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump = leaderboard.bump,
    )]
    pub leaderboard: Account<'info, Leaderboard>,

    /// Must equal lobby.authority — guards against rake redirection.
    /// CHECK: key match enforced in handler.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub authority: Signer<'info>,
}
