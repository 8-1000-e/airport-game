import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";

// Polyfill Buffer for the browser (Solana web3 expects it on globalThis).
(globalThis as unknown as { Buffer: typeof Buffer }).Buffer = Buffer;

const ORACLE_PROGRAM = new PublicKey(
  "PriCems5tHihc6UDXDjzjeawomAwBduWMGAi8ZUjppd",
);
const SOL_FEED_ID = "6"; // Pyth Lazer SOL/USD
const PRICE_EXPONENT = 8;
const ER_WSS = "wss://devnet-eu.magicblock.app";
const ER_RPC = "https://devnet-eu.magicblock.app";
const HISTORY_MS = 120_000;

export interface PricePoint {
  price: number;
  timestamp: number;
}

function derivePricePda(): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("price_feed"),
      Buffer.from("pyth-lazer"),
      Buffer.from(SOL_FEED_ID),
    ],
    ORACLE_PROGRAM,
  )[0];
}

function parsePrice(data: Buffer): number | null {
  if (data.length < 81) return null;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const raw = Number(view.getBigUint64(73, true));
  return raw / Math.pow(10, PRICE_EXPONENT);
}

export interface PriceFeed {
  current(): number | null;
  history(): PricePoint[];
  stop(): void;
}

export function startPriceFeed(): PriceFeed {
  let price: number | null = null;
  let pts: PricePoint[] = [];

  const pda = derivePricePda();
  const conn = new Connection(ER_RPC, {
    wsEndpoint: ER_WSS,
    commitment: "confirmed",
  });

  const subId = conn.onAccountChange(
    pda,
    (accountInfo) => {
      const p = parsePrice(Buffer.from(accountInfo.data));
      if (p === null) return;
      const now = Date.now();
      price = p;
      const cutoff = now - HISTORY_MS;
      pts = pts.filter((pt) => pt.timestamp > cutoff);
      pts.push({ price: p, timestamp: now });
    },
    "confirmed",
  );

  return {
    current: () => price,
    history: () => pts,
    stop: () => {
      conn.removeAccountChangeListener(subId).catch(() => {});
    },
  };
}
