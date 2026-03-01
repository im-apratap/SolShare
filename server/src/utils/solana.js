import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  clusterApiUrl,
  TransactionInstruction,
} from "@solana/web3.js";

const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb",
);

// Connect to Solana network (default: devnet)
const network = process.env.SOLANA_NETWORK || "devnet";
const connection = new Connection(clusterApiUrl(network), "confirmed");

// Fetch current SOL price in USD
export const getSolPriceInUSD = async () => {
  try {
    const response = await fetch(
      "https://api.binance.com/api/v3/ticker/price?symbol=SOLUSDT",
    );
    const data = await response.json();
    return parseFloat(data.price);
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    // Fallback price if API fails
    return 150.0;
  }
};

// In-memory cache for SOL price (avoid hammering external APIs)
let cachedSolPrice = { price: null, updatedAt: null };
const CACHE_TTL_MS = 30_000; // 30 seconds

export const getCachedSolPriceInUSD = async () => {
  const now = Date.now();
  if (
    cachedSolPrice.price !== null &&
    cachedSolPrice.updatedAt !== null &&
    now - cachedSolPrice.updatedAt < CACHE_TTL_MS
  ) {
    return { price: cachedSolPrice.price, updatedAt: cachedSolPrice.updatedAt };
  }

  const price = await getSolPriceInUSD();
  cachedSolPrice = { price, updatedAt: now };
  return { price, updatedAt: now };
};

// Build a SOL transfer transaction (unsigned).
// The mobile app must sign it with the user's wallet.
export const buildTransferTransaction = async (
  fromPubkey,
  toPubkey,
  amountInSOL,
  memo = null,
) => {
  const from = new PublicKey(fromPubkey);
  const to = new PublicKey(toPubkey);
  const lamports = Math.round(amountInSOL * 1000000000);

  const transaction = new Transaction();

  if (memo) {
    transaction.add(
      new TransactionInstruction({
        keys: [{ pubkey: from, isSigner: true, isWritable: true }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf-8"),
      }),
    );
  }

  transaction.add(
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports,
    }),
  );

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = from;

  const serializedTransaction = transaction
    .serialize({ requireAllSignatures: false })
    .toString("base64");

  return {
    transaction: serializedTransaction,
    blockhash,
    lastValidBlockHeight,
  };
};

// Build a batch transfer transaction — multiple transfers in one tx.
// Used when a debtor owes multiple creditors.
export const buildBatchTransferTransaction = async (
  fromPubkey,
  transfers,
  memo = null,
) => {
  const from = new PublicKey(fromPubkey);
  const transaction = new Transaction();

  if (memo) {
    transaction.add(
      new TransactionInstruction({
        keys: [{ pubkey: from, isSigner: true, isWritable: true }],
        programId: MEMO_PROGRAM_ID,
        data: Buffer.from(memo, "utf-8"),
      }),
    );
  }

  for (const { toPubkey, amountInSOL } of transfers) {
    const to = new PublicKey(toPubkey);
    const lamports = Math.round(amountInSOL * 1000000000);

    transaction.add(
      SystemProgram.transfer({
        fromPubkey: from,
        toPubkey: to,
        lamports,
      }),
    );
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash();

  transaction.recentBlockhash = blockhash;
  transaction.lastValidBlockHeight = lastValidBlockHeight;
  transaction.feePayer = from;

  const serializedTransaction = transaction
    .serialize({ requireAllSignatures: false })
    .toString("base64");

  return {
    transaction: serializedTransaction,
    blockhash,
    lastValidBlockHeight,
  };
};

// Verify that a transaction has been confirmed on-chain.
export const verifyTransaction = async (signature) => {
  try {
    const status = await connection.getSignatureStatus(signature);

    if (
      status?.value?.confirmationStatus === "confirmed" ||
      status?.value?.confirmationStatus === "finalized"
    ) {
      return {
        confirmed: true,
        confirmationStatus: status.value.confirmationStatus,
        slot: status.value.slot,
      };
    }

    return { confirmed: false };
  } catch (error) {
    return { confirmed: false, error: error.message };
  }
};

// Get SOL balance for a wallet.
export const getBalance = async (pubkey) => {
  const balance = await connection.getBalance(new PublicKey(pubkey));
  return balance / 1000000000;
};

export { connection };
