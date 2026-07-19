import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { SolShare } from "../target/types/sol_share";
import { expect } from "chai";

describe("sol_share", () => {
  anchor.setProvider(anchor.AnchorProvider.env());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const program = anchor.workspace.solShare as Program<SolShare>;
  
  const authority = provider.wallet.publicKey;
  const groupId = "test_group_123";
  const user1 = anchor.web3.Keypair.generate();
  const user2 = anchor.web3.Keypair.generate();
  
  // Find PDAs
  const [groupVaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("group_vault"), Buffer.from(groupId)],
    program.programId
  );
  
  const [user1VaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("user_vault"), Buffer.from(groupId), user1.publicKey.toBuffer()],
    program.programId
  );
  
  const [user2VaultPDA] = anchor.web3.PublicKey.findProgramAddressSync(
    [Buffer.from("user_vault"), Buffer.from(groupId), user2.publicKey.toBuffer()],
    program.programId
  );
  
  before(async () => {
    // Airdrop SOL to test users
    const airdrop1 = await provider.connection.requestAirdrop(user1.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    const airdrop2 = await provider.connection.requestAirdrop(user2.publicKey, 10 * anchor.web3.LAMPORTS_PER_SOL);
    
    const latestBlockHash = await provider.connection.getLatestBlockhash();
    
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdrop1,
    });
    
    await provider.connection.confirmTransaction({
      blockhash: latestBlockHash.blockhash,
      lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
      signature: airdrop2,
    });
  });
  
  it("Initializes a new group", async () => {
    await program.methods
      .initializeGroup(groupId)
      .accounts({
        groupVault: groupVaultPDA,
        authority: authority,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .rpc();
      
    const groupState = await program.account.groupVault.fetch(groupVaultPDA);
    expect(groupState.groupId).to.equal(groupId);
    expect(groupState.totalDeposited.toNumber()).to.equal(0);
    expect(groupState.authority.toString()).to.equal(authority.toString());
  });
  
  it("Registers users to the group", async () => {
    await program.methods
      .registerUser(groupId)
      .accounts({
        userVault: user1VaultPDA,
        user: user1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user1])
      .rpc();
      
    const user1State = await program.account.userVault.fetch(user1VaultPDA);
    expect(user1State.balance.toNumber()).to.equal(0);
    expect(user1State.user.toString()).to.equal(user1.publicKey.toString());
    
    await program.methods
      .registerUser(groupId)
      .accounts({
        userVault: user2VaultPDA,
        user: user2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user2])
      .rpc();
  });
  
  it("Allows user1 to deposit SOL", async () => {
    const depositAmount = new anchor.BN(2 * anchor.web3.LAMPORTS_PER_SOL);
    
    await program.methods
      .deposit(groupId, depositAmount)
      .accounts({
        groupVault: groupVaultPDA,
        userVault: user1VaultPDA,
        user: user1.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user1])
      .rpc();
      
    const groupState = await program.account.groupVault.fetch(groupVaultPDA);
    const user1State = await program.account.userVault.fetch(user1VaultPDA);
    
    expect(groupState.totalDeposited.toNumber()).to.equal(2 * anchor.web3.LAMPORTS_PER_SOL);
    expect(user1State.balance.toNumber()).to.equal(2 * anchor.web3.LAMPORTS_PER_SOL);
  });
  
  it("Allows the authority to record an expense (deducting from user1, adding to user2)", async () => {
    const expenseAmount = new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL);
    
    // user1 owes user2 0.5 SOL
    await program.methods
      .recordExpense(groupId, expenseAmount)
      .accounts({
        groupVault: groupVaultPDA,
        userVault: user1VaultPDA, // debtor
        creditorVault: user2VaultPDA, // creditor
        debtor: user1.publicKey,
        creditor: user2.publicKey,
        authority: authority,
      })
      .rpc();
      
    const user1State = await program.account.userVault.fetch(user1VaultPDA);
    const user2State = await program.account.userVault.fetch(user2VaultPDA);
    
    // User1 balance decreases by 0.5
    expect(user1State.balance.toNumber()).to.equal(1.5 * anchor.web3.LAMPORTS_PER_SOL);
    // User2 balance increases by 0.5
    expect(user2State.balance.toNumber()).to.equal(0.5 * anchor.web3.LAMPORTS_PER_SOL);
  });
  
  it("Allows user2 to withdraw their positive balance", async () => {
    const withdrawAmount = new anchor.BN(0.5 * anchor.web3.LAMPORTS_PER_SOL);
    
    const preBalance = await provider.connection.getBalance(user2.publicKey);
    
    await program.methods
      .withdraw(groupId, withdrawAmount)
      .accounts({
        groupVault: groupVaultPDA,
        userVault: user2VaultPDA,
        user: user2.publicKey,
        systemProgram: anchor.web3.SystemProgram.programId,
      })
      .signers([user2])
      .rpc();
      
    const postBalance = await provider.connection.getBalance(user2.publicKey);
    
    const user2State = await program.account.userVault.fetch(user2VaultPDA);
    expect(user2State.balance.toNumber()).to.equal(0);
    
    // Note: User2 balance should be greater than before minus some tiny transaction fee
    expect(postBalance).to.be.greaterThan(preBalance);
  });
});
