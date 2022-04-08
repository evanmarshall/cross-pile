import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { MockOracleSession, SOLRAND_IDL, PROGRAM_ID } from '@demox-labs/solrand';
import { CrossPile } from '../target/types/cross_pile';
import { randomBytes } from 'crypto';
import { assert, expect } from "chai";

describe('cross-pile', () => {
    const ENV = 'http://localhost:8899';
    const solrandId = new anchor.web3.PublicKey(PROGRAM_ID);

    function createProvider(keyPair) {
        let solConnection = new anchor.web3.Connection(ENV);
        let walletWrapper = new anchor.Wallet(keyPair);
        return new anchor.Provider(solConnection, walletWrapper, {
            preflightCommitment: 'recent',
        });
    }

    async function getBalance(prov, key) {
        anchor.setProvider(prov);
        return await prov.connection.getBalance(key, "confirmed");
    }

    const userKeyPair = anchor.web3.Keypair.generate();
    // const user2KeyPair = anchor.web3.Keypair.generate();
    // const oracle = anchor.web3.Keypair.generate();
    // const oracleSession = new MockOracleSession(oracle, SOLRAND_IDL, solrandId, ENV);

    let provider = createProvider(userKeyPair);
    // let provider2 = createProvider(user2KeyPair);

    const program = anchor.workspace.CrossPile as Program<CrossPile>;
    // const userProgram = new anchor.Program(program.idl, program.programId, provider);
    // const user2Program = new anchor.Program(program.idl, program.programId, provider2);

    // const oraclePubkey = oracle.publicKey;
    // const solrandProgram = new anchor.Program(SOLRAND_IDL, solrandId, provider);
    // const amount = new anchor.BN(100000000);
    // const airdropAmount = 10000000000; // Should be more than betting amount
    // let reqAccount, reqBump;
    // let reqVaultAccount, reqVaultBump;
    // let coinAccount, coinBump;
    // let vaultAccount, vaultBump;

    anchor.setProvider(provider);
    console.log("-----------------------------------");
    console.log("Set Up Complete");
    console.log("-----------------------------------");


    async function getAccountBalance(pubkey) {
        let account = await provider.connection.getAccountInfo(pubkey);
        return account?.lamports ?? 0;
    }

    async function createUser(airdropBalance) {
        airdropBalance = airdropBalance ?? 10 * anchor.web3.LAMPORTS_PER_SOL;
        let user = anchor.web3.Keypair.generate();
        let sig = await provider.connection.requestAirdrop(user.publicKey, airdropBalance);
        await provider.connection.confirmTransaction(sig);
      
        let wallet = new anchor.Wallet(user);
        let userProvider = new anchor.Provider(provider.connection, wallet, provider.opts);
      
        return {
          key: user,
          wallet,
          provider: userProvider,
        };
    }
      
    function createUsers(numUsers) {
        let promises = [];
        for (let i = 0; i < numUsers; i++) {
            promises.push(createUser(null));
        }
        
        return Promise.all(promises);
    }

    function programForUser(user) {
        return new anchor.Program(program.idl, program.programId, user.provider);
      }

    async function createChallenge(owner)
    {
        const [challengeAccount, bump] = await anchor.web3.PublicKey.findProgramAddress(
            ['challenge', owner.key.publicKey.toBytes()],
            program.programId
        );

        let userProgram = programForUser(owner);
        await userProgram.rpc.newChallenge(bump, {
            accounts: {
                challenge: challengeAccount,
                challengeInitiator: owner.key.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });

        console.log("-_- / Challenge created. pubkey:", challengeAccount.toString());

        let challengeData = await userProgram.account.challenge.fetch(challengeAccount);
        return { publicKey: challengeAccount, data: challengeData };
    }

    async function acceptChallenge(challenge, challengee)
    {
        let userProgram = await programForUser(challengee);
        await userProgram.rpc.acceptChallenge({
            accounts: {
                challenge: challenge.publicKey,
                challengeInitiator: challenge.data.challengeInitiator,
                challengee: challengee.key.publicKey,
                systemProgram: anchor.web3.SystemProgram.programId,
            },
        });

        console.log("\ -_- Challengee accepted challenger. Challenge pubkey:", challenge.publicKey.toString());

        let acceptedChallenge = await userProgram.account.challenge.fetch(challenge.publicKey);

        return { publicKey: challenge.publicKey, data: acceptedChallenge };
    }

    it('creates a new challenger', async () => {
        const initiator = await createUser(null);
        let challenge = await await createChallenge(initiator);

        expect(challenge.data.challengeInitiator.toString(), "New challenger is owned by instantiating user.")
            .equals(initiator.key.publicKey.toString());
        expect(challenge.data.challengee.toString(), "Challengee set to default public key.")
            .equals(anchor.web3.PublicKey.default.toString());
    });

    it('accepts a challenger', async () => {
        const [owner, challengee] = await createUsers(2);

        const challenge = await createChallenge(owner);
        const challengeAccepted = await acceptChallenge(challenge, challengee);

        expect(challengeAccepted.data.challengeInitiator.toString(), "Challenger owner remains instantiator.")
            .equals(owner.key.publicKey.toString());
        expect(challenge.data.challengee.toString(), "Challengee now set to accepting user's public key.")
            .equals(challengee.key.publicKey.toString());
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
