# Setup

## Tooling versions

- Solana CLI: 2.3.13 (Agave fork) with `platform-tools v1.48`, bundled rustc
  1.84.1 (this is the version that breaks edition2024 deps — see
  [debugging-notes.md](debugging-notes.md))
- System rust: 1.95+ (via `rustup update stable`) — irrelevant for
  `anchor build` but used for `cargo check`
- Anchor: 0.32.1 (locked via `=0.32.1` in `program/Cargo.toml`)
- Node / Vite: see `airport-game/package.json`
- Next / React: see `front-dev/package.json` (existing project, not touched
  by us)

## Game build (canvas + Vite)

```bash
cd airport-game
npm install
npm run dev    # local dev at http://localhost:5173
```

## Anchor program build

```bash
cd airport-game/program

# First time only:
# (Cargo.lock should already be present — copied from red-light)
ls Cargo.lock || echo "MISSING — copy from red-light"

anchor build
# → target/deploy/airport_carousel_lobby.so
# → target/deploy/airport_carousel_lobby-keypair.json
# → target/idl/airport_carousel_lobby.json

# After first build, sync the program ID once:
anchor keys sync
anchor build  # rebuild with the real declare_id
```

## Anchor program deploy (devnet)

```bash
cd airport-game/program
anchor deploy --provider.cluster devnet --provider.wallet ~/.config/solana/id.json
```

## Front-dev integration

The card and game live at:
- `front-dev/src/components/dashboard/right/airport-carousel.tsx` (card)
- `front-dev/src/components/games/airport-carousel/` (game module)

Wired into:
- `front-dev/src/components/dashboard/right/spotlight.tsx` —
  `onchainGames = [RedlightCard, AirportCarouselCard, SoloonCard]`
- `front-dev/src/components/dashboard/main/onchain.tsx` — direct render

Cover image expected at
`front-dev/public/assets-game/airport-carousel/cover.jpg` (folder created,
file not yet supplied — card will show broken image until added).

No new front-dev dependencies were added (uses existing `useSolPrice`,
Framer Motion, Next, etc.).

## Git remotes

- airport-game: `git@github.com:8-1000-e/airport-game.git`,
  branches `main`, `3d-model`, `fresh-start`. Currently working on `fresh-start`.
- red-light: separate repo, used only as reference (do not modify).
- front-dev: separate repo, modified locally on its current branch — review
  the diff before committing.

## Recovering from a broken Cargo.lock

If `anchor build` ever starts failing on edition2024 again:

```bash
cd airport-game/program
rm Cargo.lock
cp /Users/emile/Documents/TNTX/red-light/Cargo.lock ./Cargo.lock
cargo check                       # verify it resolves
anchor build
```

Or follow the version-pinning recipe in
[debugging-notes.md](debugging-notes.md).
