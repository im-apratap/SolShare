import { transact } from "@solana-mobile/mobile-wallet-adapter-protocol-web3js";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import * as Linking from "expo-linking";

// Ensure Buffer is available globally for web3.js
if (typeof global.Buffer === "undefined") {
  global.Buffer = Buffer;
}

export const APP_IDENTITY = {
  name: "SolShare",
  uri: "https://im-apratap.github.io/solshare", // Optional: Your website
  icon: "favicon.ico", // Optional: Path to icon relative to uri
};

// DEVNET endpoint
export const SOLANA_CLUSTER = "devnet";
export const connection = new Connection(
  "https://api.devnet.solana.com",
  "confirmed",
);

/**
 * Generates a Solscan URL for a transaction signature.
 * @param txSignature - The transaction signature
 * @param cluster - The Solana cluster (defaults to devnet)
 * @returns The Solscan URL
 */
export function getSolscanUrl(
  txSignature: string,
  cluster: string = SOLANA_CLUSTER,
): string {
  const baseUrl = "https://solscan.io/tx";
  if (cluster === "mainnet-beta" || cluster === "mainnet") {
    return `${baseUrl}/${txSignature}`;
  }
  return `${baseUrl}/${txSignature}?cluster=${cluster}`;
}

/**
 * Opens the Solscan page for a transaction in the device's browser.
 * @param txSignature - The transaction signature
 */
export async function openSolscanTx(txSignature: string): Promise<void> {
  const url = getSolscanUrl(txSignature);
  await Linking.openURL(url);
}

/**
 * Prompts the user to connect their Solana Mobile Wallet (e.g. Phantom, Solflare).
 * Returns their public key as a string.
 */
export async function connectWallet(): Promise<string> {
  return await transact(async (wallet) => {
    // Attempt to authorize
    const authorizationResult = await wallet.authorize({
      cluster: "devnet",
      identity: APP_IDENTITY,
    });

    return authorizationResult.accounts[0].address;
  });
}

/**
 * Asks the wallet to sign and optionally send a transaction.
 * Since our backend validates the signature before broadcasting,
 * we just want to SIGN the transaction here, but MWA `signTransactions`
 * is supported by most wallets.
 *
 * @param base64Transaction - The base64 fully constructed transaction from the backend.
 * @returns The base64 signed transaction from the wallet.
 */
export async function signTransactionOnDevice(
  base64Transaction: string,
): Promise<string> {
  return await transact(async (wallet) => {
    // 1. Authorize session
    await wallet.authorize({
      cluster: "devnet",
      identity: APP_IDENTITY,
    });

    // 2. Decode the base64 transaction
    const txBuffer = Buffer.from(base64Transaction, "base64");

    // Determine if it's a VersionedTransaction or legacy Transaction.
    // In our backend, we use VersionedTransaction (often the default for modern `@solana/web3.js` or via buildTransferTransaction)
    // Wait, let's treat it as VersionedTransaction first or detect it.
    let transaction;
    try {
      transaction = VersionedTransaction.deserialize(new Uint8Array(txBuffer));
    } catch {
      transaction = Transaction.from(new Uint8Array(txBuffer));
    }

    // 3. Request Signature from Wallet
    const signedTransactions = await wallet.signTransactions({
      transactions: [transaction],
    });

    const signedTx = signedTransactions[0];

    // 4. Return the signed transaction as base64
    if (signedTx instanceof VersionedTransaction) {
      return Buffer.from(signedTx.serialize()).toString("base64");
    } else {
      return Buffer.from(
        signedTx.serialize({
          requireAllSignatures: false,
          verifySignatures: false,
        }),
      ).toString("base64");
    }
  });
}
