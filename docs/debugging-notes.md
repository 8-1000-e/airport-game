# Debugging notes

## edition2024 / rustc 1.84 conflict in `anchor build` (2026-04-30)

### Symptoms

- `anchor build` reports
  `feature 'edition2024' is required` while parsing a transitive dep's manifest.
- Later, after pinning some deps,
  `rustc 1.84.1-dev is not supported by ... requires rustc 1.85.0`.
- `rustc --version` shows 1.95+ (system) but it makes no difference.

### Root cause

`anchor build` invokes `cargo-build-sbf`, which uses **Solana platform-tools'
bundled rustc**, NOT the system one. Platform-tools v1.48 (current at the
time) shipped rustc 1.84.1. Several common transitive deps had recent
versions requiring `edition2024` (rust 1.85+):

- toml_datetime ≥ 1.1.1+spec-1.1.0
- toml_edit ≥ 0.25.11+spec-1.1.0
- toml_parser ≥ 1.1.2+spec-1.1.0
- indexmap ≥ 2.14.0
- unicode-segmentation ≥ 1.13.2
- … (each new fresh resolve revealed a new one)

These are pulled in by `anchor-lang 0.32.1` via:
```
borsh-derive → proc-macro-crate → toml_edit → toml_datetime / toml_parser
```

### What we tried (in order, each failed)

1. `rustup update stable` (system rustc → 1.95). No effect — wrong toolchain.
2. `anchor build -- --tools-version v1.50`. Tag didn't exist.
3. Downgrading `anchor-lang` to `=0.30.1`. Different but related build errors.
4. `cargo update -p toml_datetime --precise 0.6.X`. Cargo refused — major
   version mismatch (the chain wants 1.x).
5. `cargo update -p "toml_datetime@1.1.1+spec-1.1.0" --precise 1.0.0+spec-1.1.0`
   (note the FULL version with `+spec-1.1.0` suffix — required when there
   are multiple toml_datetime versions in the lock).

### What worked

Pinning each blocking dep one at a time:

```bash
cargo generate-lockfile
cargo update -p "toml_edit@0.25.11+spec-1.1.0"   --precise 0.25.4+spec-1.1.0
cargo update -p "toml_datetime@1.1.1+spec-1.1.0" --precise 1.0.0+spec-1.1.0
cargo update -p toml_parser                      --precise 1.0.9+spec-1.1.0
cargo update -p indexmap                         --precise 2.13.0
# … each anchor build failure revealed the next crate to pin
```

Eventually we just **copied red-light's known-good Cargo.lock**:

```bash
cp /Users/emile/Documents/TNTX/red-light/Cargo.lock \
   /Users/emile/Documents/TNTX/airport-game/program/Cargo.lock
```

That worked end-to-end.

### Gotcha

When `cargo update -p NAME` reports
`error: specification 'NAME' is ambiguous; help: re-run with one of
NAME@<v1>, NAME@<v2>`, you must use the FULL version including any
`+suffix` build metadata in the package selector. Quoting is needed because
of the `+`.

### Permanent fix when available

Once Solana ships platform-tools with rustc 1.85+ (probably v1.49 or v1.50),
delete this Cargo.lock and let cargo re-resolve to latest.

---

## SBF stack overflow on large Anchor accounts (2026-04-30)

### Symptoms

```
Error: Function _ZN..._GT_25try_deserialize_unchecked... Stack offset of
4112 exceeded max offset of 4096 by 16 bytes, please minimize large stack
variables. Estimated function frame size: 4224 bytes.
```

Plus similar errors on `try_accounts` of every instruction touching the
big account, and on `__global` instruction wrappers.

### Root cause

SBF (Solana BPF) has a 4 KB hard stack limit per function frame. Anchor's
`Account<'info, T>` calls `T::try_deserialize_unchecked` which Borsh-
deserializes the bytes into a stack-allocated `T`. With
`MAX_PLAYERS = 30+`, our `Lobby` (~1 KB) and `Leaderboard` (~1.2 KB+) plus
deserializer overhead exceeded the limit.

### What we tried

1. **`Box<Account<'info, T>>`** — only moves the FINAL allocation to heap;
   the deserializer still uses the stack. Boxed `Account` wrappers fixed
   the `try_accounts` errors but NOT the `try_deserialize_unchecked` ones.

### What worked

Convert both `Lobby` and `Leaderboard` to `#[account(zero_copy(unsafe))]`,
add `#[repr(C)]`, use `AccountLoader<'info, T>`, and access via `.load()` /
`.load_mut()` / `.load_init()` in handlers.

See the `anchor-zero-copy-large-accounts` skill at
`~/.claude/skills/brain-dump/extracted/anchor-zero-copy-large-accounts/SKILL.md`
for the full conversion checklist.

### Gotchas hit during conversion

- `bool` is not Pod-compatible. Use `u8` (0/1) and constants like
  `STATUS_FINALIZED: u8 = 1`. `finalized: bool` → `finalized: u8`.
- The macro `#[account(zero_copy)]` (without `unsafe`) tries to auto-derive
  bytemuck::Pod and FAILS on legitimate layouts because bytemuck is
  conservative about padding inference. Use
  `#[account(zero_copy(unsafe))]` + explicit `#[repr(C)]` + manual
  `_padding: [u8; N]` field to force alignment.
- `LeaderboardEntry` has `Pubkey` (1-aligned, 32 bytes) + `u64` (8-aligned).
  Inside the struct, score lands at offset 32 which is 8-aligned by
  coincidence ✓ no inner padding. Total 40 bytes, 8-aligned.
- `Leaderboard` needs 5 bytes of `_padding` between
  `bump: u8` and `entries: [LeaderboardEntry; 50]` to land entries at an
  8-aligned offset.
- `AccountLoader::load()` returns a `Ref<T>` that holds the RefCell borrow.
  In handlers that read AND write, you MUST drop the read borrow (via
  scope `{ … }` or `drop(state)`) before calling `load_mut()`. Holding
  both panics at runtime, not compile time.
- `seeds = [SEED]` constraint with `bump = lobby.load()?.bump` — the
  `?` works because Anchor's expansion supports it.
- `close = authority` works on `AccountLoader`, identical to `Account`.

---

## Front-end Buffer polyfill for `@solana/web3.js` in Vite (2026-04-30)

### Symptoms

`Uncaught ReferenceError: Buffer is not defined` when importing
`@solana/web3.js` in a Vite browser project.

### Fix

```ts
// vite.config.ts
import { defineConfig } from "vite";
export default defineConfig({
  define: { global: "globalThis" },
  resolve: { alias: { buffer: "buffer" } },
  optimizeDeps: { include: ["buffer", "@solana/web3.js"] },
});
```

```ts
// at the top of the file that uses web3.js
import { Buffer } from "buffer";
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;
```

Plus `npm install buffer`.

For the React port in `front-dev`, this isn't needed — front-dev's existing
`useSolPrice` hook already runs in a Next.js context that has Buffer
polyfilled.

---

## Cargo.toml multi-versioned package selector (2026-04-30)

When `cargo update -p NAME --precise X` errors with
`specification 'NAME' is ambiguous`, it means the lock has multiple
versions of the same crate. Use the full spec INCLUDING any `+suffix`
build metadata:

```bash
cargo update -p "toml_datetime@1.1.1+spec-1.1.0" --precise 1.0.0+spec-1.1.0
```

Quotes are needed in zsh/bash because `+` is not special in shell but
sometimes shell escaping rules around `@` get confused.
