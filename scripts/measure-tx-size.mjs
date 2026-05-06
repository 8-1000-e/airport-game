// Measure concrete transaction sizes for distribute_prize and refund_lobby.
// Solana hard cap: 1232 bytes per transaction (1280 MTU - 40 IPv6 - 8 UDP).
import {
  PublicKey,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  AddressLookupTableAccount,
  SystemProgram,
  Keypair,
} from "@solana/web3.js";

const PROGRAM_ID = new PublicKey("DSxQtZoKFeF7xzpcSCTNgxocf8kazFEtvT2iC5GY3iMk");
const LOBBY_SEED = Buffer.from("lobby");
const VAULT_SEED = Buffer.from("vault");
const LEADERBOARD_SEED = Buffer.from("leaderboard");

const TX_LIMIT = 1232;

const authority = Keypair.generate();
const treasury = authority.publicKey; // same as authority in this program
const [lobbyPda] = PublicKey.findProgramAddressSync(
  [LOBBY_SEED, authority.publicKey.toBuffer()],
  PROGRAM_ID
);
const [vaultPda] = PublicKey.findProgramAddressSync(
  [VAULT_SEED, lobbyPda.toBuffer()],
  PROGRAM_ID
);
const [leaderboardPda] = PublicKey.findProgramAddressSync(
  [LEADERBOARD_SEED, lobbyPda.toBuffer()],
  PROGRAM_ID
);

// Anchor 8-byte discriminators (sha256("global:<name>")[..8]).
// Reading them straight from the compiled IDL.
import { readFileSync } from "node:fs";
const idl = JSON.parse(
  readFileSync(
    new URL(
      "../program/target/idl/airport_carousel_lobby.json",
      import.meta.url
    )
  )
);
function discFor(name) {
  const ix = idl.instructions.find((i) => i.name === name);
  if (!ix) throw new Error(`no ix ${name}`);
  return Buffer.from(ix.discriminator);
}

const fakeBlockhash = "11111111111111111111111111111111"; // 32 base58 chars

function buildDistributePrizeTx(nWinners) {
  const winners = Array.from({ length: nWinners }, () =>
    Keypair.generate().publicKey
  );
  const keys = [
    { pubkey: lobbyPda, isSigner: false, isWritable: true },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: leaderboardPda, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ...winners.map((p) => ({ pubkey: p, isSigner: false, isWritable: true })),
  ];
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: discFor("distribute_prize"),
  });
  const tx = new Transaction({
    feePayer: authority.publicKey,
    recentBlockhash: fakeBlockhash,
  }).add(ix);
  // compileMessage + serialize a 64-byte zero sig per signer (we don't need to
  // really sign — we just need the byte count).
  const msg = tx.compileMessage();
  const msgBytes = msg.serialize();
  // Wire format: shortvec(num_sigs) + sigs (64 each) + message
  const numSigs = msg.header.numRequiredSignatures;
  const sigOverhead = encodeShortVecLen(numSigs) + numSigs * 64;
  return sigOverhead + msgBytes.length;
}

function buildRefundLobbyTx(nPlayers) {
  const players = Array.from({ length: nPlayers }, () =>
    Keypair.generate().publicKey
  );
  const keys = [
    { pubkey: lobbyPda, isSigner: false, isWritable: true },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ...players.map((p) => ({ pubkey: p, isSigner: false, isWritable: true })),
  ];
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: discFor("refund_lobby"),
  });
  const tx = new Transaction({
    feePayer: authority.publicKey,
    recentBlockhash: fakeBlockhash,
  }).add(ix);
  const msg = tx.compileMessage();
  const msgBytes = msg.serialize();
  const numSigs = msg.header.numRequiredSignatures;
  const sigOverhead = encodeShortVecLen(numSigs) + numSigs * 64;
  return sigOverhead + msgBytes.length;
}

function encodeShortVecLen(n) {
  // Solana shortvec: 1 byte if n < 128, 2 bytes if < 16384, else 3.
  if (n < 0x80) return 1;
  if (n < 0x4000) return 2;
  return 3;
}

function findBreakingPoint(buildFn, label) {
  console.log(`\n=== ${label} ===`);
  console.log(`tx limit = ${TX_LIMIT} bytes`);
  let lastFit = 0;
  let firstFail = null;
  for (let n = 1; n <= 100; n++) {
    let size;
    try {
      size = buildFn(n);
    } catch (e) {
      console.log(
        `  n=${String(n).padStart(3)}  serialize ERROR (${e.message.slice(
          0,
          40
        )}...) — legacy tx already busted`
      );
      continue;
    }
    const fits = size <= TX_LIMIT;
    if (fits) lastFit = n;
    if (!fits && firstFail === null) firstFail = { n, size };
    if (n <= 35 || n % 10 === 0) {
      console.log(
        `  n=${String(n).padStart(3)}  size=${String(size).padStart(
          4
        )} bytes  ${fits ? "OK" : "TOO BIG"}`
      );
    }
  }
  console.log(
    `\n  → max accounts that fit: ${lastFit}` +
      (firstFail
        ? `  (n=${firstFail.n} = ${firstFail.size} bytes, over by ${
            firstFail.size - TX_LIMIT
          })`
        : "")
  );
}

findBreakingPoint(buildDistributePrizeTx, "distribute_prize (N winners, legacy tx)");
findBreakingPoint(buildRefundLobbyTx, "refund_lobby (N players, legacy tx)");

// Versioned tx + Address Lookup Table: each account in the LUT costs
// 1 byte (its index) instead of 32 bytes in the static account list,
// but writable winners must stay static (LUT entries are read-only-friendly,
// writable lookups exist but each writable still costs 1 byte index +
// stays in writable_indexes array).

function buildDistributePrizeV0(nWinners, useLut) {
  const winners = Array.from({ length: nWinners }, () =>
    Keypair.generate().publicKey
  );

  const keys = [
    { pubkey: lobbyPda, isSigner: false, isWritable: true },
    { pubkey: vaultPda, isSigner: false, isWritable: true },
    { pubkey: leaderboardPda, isSigner: false, isWritable: false },
    { pubkey: treasury, isSigner: false, isWritable: true },
    { pubkey: authority.publicKey, isSigner: true, isWritable: false },
    ...winners.map((p) => ({ pubkey: p, isSigner: false, isWritable: true })),
  ];
  const ix = new TransactionInstruction({
    programId: PROGRAM_ID,
    keys,
    data: discFor("distribute_prize"),
  });

  let lookupTables = [];
  if (useLut) {
    // Pretend an ALT exists containing every winner. In the real flow you'd
    // create+extend an ALT once before distribute_prize and reuse it.
    const lutKey = Keypair.generate().publicKey;
    lookupTables = [
      new AddressLookupTableAccount({
        key: lutKey,
        state: {
          deactivationSlot: BigInt("18446744073709551615"),
          lastExtendedSlot: 0,
          lastExtendedSlotStartIndex: 0,
          authority: authority.publicKey,
          addresses: winners,
        },
      }),
    ];
  }

  const message = new TransactionMessage({
    payerKey: authority.publicKey,
    recentBlockhash: fakeBlockhash,
    instructions: [ix],
  }).compileToV0Message(lookupTables);

  const vtx = new VersionedTransaction(message);
  // Add a placeholder signature so the wire size includes 1 sig.
  vtx.signatures = [new Uint8Array(64)];
  return vtx.serialize().length;
}

console.log(
  "\n=== distribute_prize (N winners, v0 tx + ALT containing winners) ==="
);
console.log(`tx limit = ${TX_LIMIT} bytes`);
let lastFitV0 = 0;
let firstFailV0 = null;
for (let n = 1; n <= 100; n++) {
  let size;
  try {
    size = buildDistributePrizeV0(n, true);
  } catch (e) {
    console.log(`  n=${n}  serialize ERROR ${e.message.slice(0, 60)}`);
    continue;
  }
  const fits = size <= TX_LIMIT;
  if (fits) lastFitV0 = n;
  if (!fits && firstFailV0 === null) firstFailV0 = { n, size };
  if (n <= 5 || n % 10 === 0 || (firstFailV0 && n <= firstFailV0.n + 2)) {
    console.log(
      `  n=${String(n).padStart(3)}  size=${String(size).padStart(4)} bytes  ${
        fits ? "OK" : "TOO BIG"
      }`
    );
  }
}
console.log(
  `\n  → max winners with ALT: ${lastFitV0}` +
    (firstFailV0
      ? `  (n=${firstFailV0.n} = ${firstFailV0.size} bytes, over by ${
          firstFailV0.size - TX_LIMIT
        })`
      : "")
);
