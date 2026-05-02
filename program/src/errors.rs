use anchor_lang::prelude::*;

#[error_code]
pub enum LobbyError {
    #[msg("Lobby is not open for joining")]
    LobbyNotOpen,
    #[msg("Lobby is full")]
    LobbyFull,
    #[msg("Player already joined this lobby")]
    AlreadyJoined,
    #[msg("Lobby has not started yet")]
    LobbyNotStarted,
    #[msg("Lobby is already settled")]
    AlreadySettled,
    #[msg("Lobby must be settled before it can be reset")]
    LobbyNotSettled,
    #[msg("Only the lobby authority can perform this action")]
    Unauthorized,
    #[msg("Leaderboard has not been finalized yet — call finalize_leaderboard first")]
    LeaderboardNotFinalized,
    #[msg("Leaderboard is already finalized — call only once per match")]
    LeaderboardAlreadyFinalized,
    #[msg("Leaderboard entry references a player not in this lobby")]
    EntryPlayerNotInLobby,
    #[msg("Submitted entries exceed MAX_PLAYERS")]
    TooManyEntries,
    #[msg("Winner account does not match leaderboard entry at that index")]
    LeaderboardMismatch,
    #[msg("Not enough accounts passed for distribution")]
    NotEnoughAccounts,
    #[msg("Treasury account does not match lobby authority")]
    InvalidTreasury,
    #[msg("Vault balance insufficient for computed payout (should not happen)")]
    VaultUnderflow,
    #[msg("Player is not in this lobby")]
    NotInLobby,
    #[msg("Player has reached the per-match pick cap")]
    MaxPicksReached,
    #[msg("Cannot leave: another player is already in the lobby")]
    CannotLeaveWithOthers,
    #[msg("Match window has expired — picks are no longer accepted")]
    MatchWindowExpired,
}
