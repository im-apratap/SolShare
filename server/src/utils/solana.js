import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  clusterApiUrl,
  TransactionInstruction,
  Keypair,
} from "@solana/web3.js";
import * as anchor from "@coral-xyz/anchor";
import fs from "fs";
import path from "path";
import bs58 from "bs58";
import { fileURLToPath } from "url";
const MEMO_PROGRAM_ID = new PublicKey(
  "MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcQb",
);
const network = process.env.SOLANA_NETWORK || "devnet";
const connection = new Connection(clusterApiUrl(network), "confirmed");

// --- Anchor Setup ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const idlPath = path.join(__dirname, "sol_share.json");
const idl = JSON.parse(fs.readFileSync(idlPath, "utf-8"));
const PROGRAM_ID = new PublicKey(idl.address);

// Backend Wallet (Authority for PDA)
// In production, this should be a secure key loaded from env
let serverKeypair;
if (process.env.SERVER_PRIVATE_KEY) {
  serverKeypair = Keypair.fromSecretKey(bs58.decode(process.env.SERVER_PRIVATE_KEY));
} else {
  // Generate one for dev and warn
  console.warn("⚠️ No SERVER_PRIVATE_KEY found in env! Generating a temporary keypair for PDA authority...");
  serverKeypair = Keypair.generate();
  console.warn(`Server PubKey: ${serverKeypair.publicKey.toString()}`);
}
const serverWallet = new anchor.Wallet(serverKeypair);
const provider = new anchor.AnchorProvider(connection, serverWallet, {
  preflightCommitment: "confirmed",
});
const program = new anchor.Program(idl, provider);
// --------------------
export const getExchangeRates = async () => {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd,inr",
      { signal: controller.signal },
    );
    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();
    return {
      usd: parseFloat(data.solana.usd),
      inr: parseFloat(data.solana.inr),
    };
  } catch (error) {
    console.error("Error fetching SOL price:", error);
    return { usd: 150.0, inr: 12500.0 }; // Fallback values
  }
};
let cachedExchangeRates = { rates: null, updatedAt: null };
const CACHE_TTL_MS = 30_000;
export const getCachedExchangeRates = async () => {
  const now = Date.now();
  if (
    cachedExchangeRates.rates !== null &&
    cachedExchangeRates.updatedAt !== null &&
    now - cachedExchangeRates.updatedAt < CACHE_TTL_MS
  ) {
    return {
      rates: cachedExchangeRates.rates,
      updatedAt: cachedExchangeRates.updatedAt,
    };
  }
  const rates = await getExchangeRates();
  cachedExchangeRates = { rates, updatedAt: now };
  return { rates, updatedAt: now };
};
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
export const getBalance = async (pubkey) => {
  const balance = await connection.getBalance(new PublicKey(pubkey));
  return balance / 1000000000;
};

export const forceSettleGroupExpenses = async (groupId, settlements, memberMap) => {
  const results = [];
  
  const [groupVaultPDA] = PublicKey.findProgramAddressSync(
    [Buffer.from("group_vault"), Buffer.from(groupId)],
    PROGRAM_ID
  );

  for (const settlement of settlements) {
    try {
      const debtorPubKey = new PublicKey(memberMap[settlement.from].pubKey);
      const creditorPubKey = new PublicKey(memberMap[settlement.to].pubKey);
      
      const [debtorVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault"), Buffer.from(groupId), debtorPubKey.toBuffer()],
        PROGRAM_ID
      );
      
      const [creditorVaultPDA] = PublicKey.findProgramAddressSync(
        [Buffer.from("user_vault"), Buffer.from(groupId), creditorPubKey.toBuffer()],
        PROGRAM_ID
      );

      // Check if debtor vault has enough balance before attempting
      try {
        const debtorVault = await program.account.userVault.fetch(debtorVaultPDA);
        const amountLamports = new anchor.BN(Math.round(settlement.amount * 1000000000));
        
        if (debtorVault.balance.gte(amountLamports)) {
          // Force settle using the backend authority
          const tx = await program.methods
            .recordExpense(groupId, amountLamports)
            .accounts({
              groupVault: groupVaultPDA,
              userVault: debtorVaultPDA,
              creditorVault: creditorVaultPDA,
              debtor: debtorPubKey,
              creditor: creditorPubKey,
              authority: serverKeypair.publicKey,
            })
            .signers([serverKeypair])
            .rpc();
            
          results.push({
            settlement,
            success: true,
            txSignature: tx
          });
        } else {
          results.push({
            settlement,
            success: false,
            reason: "Insufficient funds in debtor's PDA vault"
          });
        }
      } catch (err) {
        results.push({
          settlement,
          success: false,
          reason: "Vault uninitialized or error fetching PDA: " + err.message
        });
      }
    } catch (e) {
      console.error("Error in forceSettleGroupExpenses:", e);
      results.push({ settlement, success: false, reason: e.message });
    }
  }
  return results;
};

export { connection, program };
