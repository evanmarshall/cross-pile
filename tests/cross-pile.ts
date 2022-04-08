import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { MockOracleSession, SOLRAND_IDL, PROGRAM_ID } from '@demox-labs/solrand';
import { CrossPile } from '../target/types/cross_pile';
import { randomBytes } from 'crypto';
import { assert, expect } from "chai";
import { ChallengerSession, ChallengeeSession } from "../app/sessions.js";

describe('cross-pile', () => {

    const program = anchor.workspace.CrossPile as Program<CrossPile>;

    const ENV = 'http://localhost:8899';
    const AIRDROP = 1000000000;
    const FEE = 15000; // In lamports, defined in lib.rs

    const challengerKeypair = anchor.web3.Keypair.generate();
    const challengerSession = new ChallengerSession(challengerKeypair, program.idl, program.programId, ENV);
    const challengeeKeypair = anchor.web3.Keypair.generate();
    const challengeeSession = new ChallengeeSession(challengeeKeypair, program.idl, program.programId, ENV);


    // anchor.setProvider(provider);
    console.log("-----------------------------------");
    console.log("Set Up Complete");
    console.log("-----------------------------------");

    it('setup', async () => {
        await challengerSession.requestAirdrop();
        await challengeeSession.requestAirdrop();
    });

    it('creates a new challenger', async () => {
        const wagerAmount = new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL);
        const wagerAmountNum = wagerAmount.toNumber();
        await challengerSession.setAccounts();
        console.log('Challenge created 1 ');
        await challengerSession.newChallenge(wagerAmount);

        console.log('Challenge created 2');
        let challengeData = await challengerSession.fetchChallenge(challengerSession.challenge);

        console.log(challengeData);

        console.log('Challenge accepted 3');
        await challengeeSession.acceptChallenge(challengerSession.challenge);

        console.log('Challenge 4');
        challengeData = await challengerSession.fetchChallenge(challengerSession.challenge);

        console.log(challengeData);


        // expect(challenge.data.challengeInitiator.toString(), "New challenger is owned by instantiating user.")
        //     .equals(initiator.key.publicKey.toString());
        // expect(challenge.data.challengee.toString(), "Challengee set to default public key.")
        //     .equals(anchor.web3.PublicKey.default.toString());
        // expect(challenge.data.wagerAmount.toNumber()).equals(wagerAmountNum);
    });

    xit('accepts a challenger', async () => {
        // const [owner, challengee] = await createUsers(2);
        // // const program = await programForUser(challengee);
        // // let challenges = await program.account.challenge.all();
        // // for (let i = 0; i < challenges.length; i++) {
        // //     console.log(challenges[i].account.challengee.toString());
        // // }

        // const challenge = await createChallenge(owner, new anchor.BN(10 * anchor.web3.LAMPORTS_PER_SOL));
        // const challengeAccepted = await acceptChallenge(challenge, challengee);

        // expect(challengeAccepted.data.challengeInitiator.toString(), "Challenger owner remains instantiator.")
        //     .equals(owner.key.publicKey.toString());
        // expect(challenge.data.challengee.toString(), "Challengee now set to accepting user's public key.")
        //     .equals(challengee.key.publicKey.toString());
    });

    // it('Set up tests', async () => {
    //     console.log('User Pubkey: ', userKeyPair.publicKey.toString());
    //     await provider.connection.confirmTransaction(
    //         await provider.connection.requestAirdrop(userKeyPair.publicKey, airdropAmount),
    //         "confirmed"
    //     );

    //     console.log('User 2 Pubkey: ', user2KeyPair.publicKey.toString());
    //     await provider.connection.confirmTransaction(
    //         await provider.connection.requestAirdrop(user2KeyPair.publicKey, airdropAmount),
    //         "confirmed"
    //     );

    //     console.log('Oracle Pubkey', oracle.publicKey.toString());
    //     await provider.connection.confirmTransaction(
    //         await provider.connection.requestAirdrop(oracle.publicKey, airdropAmount),
    //         "confirmed"
    //     );

    //     [reqAccount, reqBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("r-seed"), userKeyPair.publicKey.toBuffer()],
    //         solrandId
    //         );

    //     [reqVaultAccount, reqVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("v-seed"), userKeyPair.publicKey.toBuffer()],
    //         solrandId,
    //         );

    //     await solrandProgram.rpc.initialize(
    //         reqBump,
    //         reqVaultBump,
    //         {
    //             accounts: {
    //                 requester: reqAccount,
    //                 vault: reqVaultAccount,
    //                 authority: userKeyPair.publicKey,
    //                 oracle: oraclePubkey,
    //                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    //                 systemProgram: anchor.web3.SystemProgram.programId,
    //             },
    //             signers: [userKeyPair],
    //         }
    //     );
    // });

    // it('Create a coin!', async () => {
    //     [coinAccount, coinBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("coin-seed"), userKeyPair.publicKey.toBuffer()],
    //         program.programId
    //         );

    //     [vaultAccount, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
    //         [Buffer.from("vault-seed"), userKeyPair.publicKey.toBuffer()],
    //         program.programId
    //         );

    //     console.log('Coin account: ', coinAccount.toString());
    //     console.log('Req account: ', reqAccount.toString());
    //     console.log('Vault account: ', vaultAccount.toString());

    //     await program.rpc.createCoin(
    //         coinBump,
    //         reqBump,
    //         vaultBump,
    //         amount,
    //         {
    //             accounts: {
    //                 coin: coinAccount,
    //                 vault: vaultAccount,
    //                 requester: reqAccount,
    //                 initiator: userKeyPair.publicKey,
    //                 acceptor: user2KeyPair.publicKey,
    //                 oracle: oraclePubkey,
    //                 oracleVault: reqVaultAccount,
    //                 solrandProgram: solrandId,
    //                 rent: anchor.web3.SYSVAR_RENT_PUBKEY,
    //                 systemProgram: anchor.web3.SystemProgram.programId,
    //             },
    //             signers: [userKeyPair],
    //         }
    //     );

    //     let userBalance = await getBalance(provider, userKeyPair.publicKey);
    //     assert(userBalance < airdropAmount);

    //     console.log('User Balance: ', userBalance);

    //     await provider.connection.confirmTransaction(
    //         await provider.connection.requestAirdrop(reqVaultAccount, 1000000000),
    //         "confirmed"
    //     );
    // });

    // it('Approve a flip', async () => {
    //     anchor.setProvider(provider2);
    //     await user2Program.rpc.approveFlip(
    //         {
    //             accounts: {
    //                 authority: user2KeyPair.publicKey,
    //                 vault: vaultAccount,
    //                 initiator: userKeyPair.publicKey,
    //                 requester: reqAccount,
    //                 oracle: oraclePubkey,
    //                 oracleVault: reqVaultAccount,
    //                 solrandProgram: solrandId,
    //                 systemProgram: anchor.web3.SystemProgram.programId,
    //             },
    //             remainingAccounts: [
    //                 {
    //                     pubkey: coinAccount,
    //                     isWritable: true,
    //                     isSigner: false,
    //                 },
    //             ],
    //             signers: [user2KeyPair],
    //         },
    //     );

    //     let user2Balance = await getBalance(provider2, user2KeyPair.publicKey);
    //     assert(user2Balance < airdropAmount + amount.toNumber());

    //     console.log('User 2 Balance: ', user2Balance);
    // });

    // it('Oracle responds to request', async () => {
    //     let randomNumber = randomBytes(64);
    //     randomNumber[0] = 0; // Force winner to be acceptor

    //     let requester = { publicKey: reqAccount };

    //     await oracleSession.publishRandom(requester, randomNumber);
    // });

    // it('Reveal the result', async () => {
    //     anchor.setProvider(provider2);
    //     await user2Program.rpc.revealCoin(
    //         {
    //             accounts: {
    //                 initiator: userKeyPair.publicKey,
    //                 acceptor: user2KeyPair.publicKey,
    //                 vault: vaultAccount,
    //                 requester: reqAccount,
    //                 authority: user2KeyPair.publicKey,
    //                 solrandProgram: solrandId,
    //                 systemProgram: anchor.web3.SystemProgram.programId,
    //             },
    //             remainingAccounts: [
    //                 {
    //                     pubkey: coinAccount,
    //                     isWritable: true,
    //                     isSigner: false,
    //                 },
    //             ],
    //             signers: [user2KeyPair],
    //         },
    //     );
        
    //     let userBalance = await getBalance(provider, userKeyPair.publicKey);
    //     let user2Balance = await getBalance(provider2, user2KeyPair.publicKey);

    //     console.log('User Balance: ', userBalance);
    //     console.log('User 2 Balance: ', user2Balance);

    //     assert(userBalance < airdropAmount + amount.toNumber());
    //     assert(user2Balance >= airdropAmount + amount.toNumber() - 3 * 5000); // account for transaction cost
    // });
});
