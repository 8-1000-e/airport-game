use anchor_lang::prelude::*;
use crate::constants::*;
use crate::errors::*;
use crate::state::*;
use crate::PrizeDistributed;

/// Distribution:
///   - Top half = floor(player_count / 2) slots, equal shares of 95% of pot
///   - Ties at the cutoff split the last slot
///   - Treasury gets 5% (or 8% for ≤2 players, 100% if no winners)
pub fn distribute_prize(ctx: Context<DistributePrize>) -> Result<()> {
    // Read all the data we need from the zero-copy accounts up front.
    let (player_count, lobby_id) = {
        let lobby = ctx.accounts.lobby.load()?;
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
        (lobby.player_count, lobby.lobby_id)
    };

    let leaderboard = ctx.accounts.leaderboard.load()?;
    require!(
        leaderboard.finalized == 1,
        LobbyError::LeaderboardNotFinalized
    );

    let lb_count = leaderboard.entry_count as usize;
    let desired_cutoff = player_count as usize / 2;
    let cutoff = desired_cutoff.min(lb_count);

    let total_pot = ctx.accounts.vault.total_pot;

    // No winners → treasury takes all
    if cutoff == 0 {
        drop(leaderboard);
        ctx.accounts.vault.sub_lamports(total_pot)?;
        ctx.accounts.treasury.add_lamports(total_pot)?;
        let vault_mut = &mut ctx.accounts.vault;
        vault_mut.total_pot = 0;
        let mut lobby_mut = ctx.accounts.lobby.load_mut()?;
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

    let fee_bps: u64 = if player_count <= 2 { 800 } else { PLATFORM_FEE_BPS };
    let treasury_cut = total_pot * fee_bps / 10_000;
    let winner_pool = total_pot - treasury_cut;
    let prize_per_slot = winner_pool / cutoff as u64;

    // Detect tie at cutoff (same score)
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

    let rem = ctx.remaining_accounts;
    require!(rem.len() >= total_winners, LobbyError::NotEnoughAccounts);
    for i in 0..total_winners {
        require_keys_eq!(
            rem[i].key(),
            leaderboard.entries[i].player,
            LobbyError::LeaderboardMismatch
        );
    }
    drop(leaderboard); // release the read borrow before mutating lobby below

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

    {
        let mut lobby_mut = ctx.accounts.lobby.load_mut()?;
        lobby_mut.status = STATUS_SETTLED;
    }

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
        bump = lobby.load()?.bump,
    )]
    pub lobby: AccountLoader<'info, Lobby>,

    #[account(
        mut,
        seeds = [VAULT_SEED, lobby.key().as_ref()],
        bump = vault.bump,
    )]
    pub vault: Account<'info, Vault>,

    #[account(
        seeds = [LEADERBOARD_SEED, lobby.key().as_ref()],
        bump = leaderboard.load()?.bump,
    )]
    pub leaderboard: AccountLoader<'info, Leaderboard>,

    /// Must equal lobby.authority — guards against rake redirection.
    /// CHECK: key match enforced in handler.
    #[account(mut)]
    pub treasury: UncheckedAccount<'info>,

    pub authority: Signer<'info>,
}
