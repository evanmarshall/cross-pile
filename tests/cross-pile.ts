import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { CrossPile } from '../target/types/cross_pile';
import { randomBytes } from 'crypto'

describe('cross-pile', () => {
    const ENV = 'http://localhost:8899';
    // const ENV = 'https://api.devnet.solana.com';

    function createProvider(keyPair) {
        let solConnection = new anchor.web3.Connection(ENV);
        let walletWrapper = new anchor.Wallet(keyPair);
        return new anchor.Provider(solConnection, walletWrapper, {
            preflightCommitment: 'recent',
        });
    }

    const userKeyPair = anchor.web3.Keypair.generate();
    const user2KeyPair = anchor.web3.Keypair.generate();
    const oracle = anchor.web3.Keypair.generate();

    let provider = createProvider(userKeyPair);
    let provider2 = createProvider(user2KeyPair);
    let oracleProvider = createProvider(oracle);

    const solRngIdl = JSON.parse('{"version":"0.0.0","name":"sol_rng","instructions":[{"name":"initialize","accounts":[{"name":"requester","isMut":true,"isSigner":false},{"name":"vault","isMut":true,"isSigner":false},{"name":"authority","isMut":true,"isSigner":true},{"name":"oracle","isMut":false,"isSigner":false},{"name":"rent","isMut":false,"isSigner":false},{"name":"systemProgram","isMut":false,"isSigner":false}],"args":[{"name":"requestBump","type":"u8"},{"name":"vaultBump","type":"u8"}]},{"name":"requestRandom","accounts":[{"name":"requester","isMut":true,"isSigner":false},{"name":"vault","isMut":true,"isSigner":false},{"name":"authority","isMut":true,"isSigner":true},{"name":"oracle","isMut":true,"isSigner":false},{"name":"systemProgram","isMut":false,"isSigner":false}],"args":[]},{"name":"publishRandom","accounts":[{"name":"oracle","isMut":false,"isSigner":true},{"name":"systemProgram","isMut":false,"isSigner":false}],"args":[{"name":"random","type":{"array":["u8",64]}},{"name":"pktId","type":{"array":["u8",32]}},{"name":"tlsId","type":{"array":["u8",32]}}]},{"name":"transferAuthority","accounts":[{"name":"requester","isMut":true,"isSigner":false},{"name":"authority","isMut":true,"isSigner":true},{"name":"newAuthority","isMut":true,"isSigner":false},{"name":"systemProgram","isMut":false,"isSigner":false}],"args":[]}],"accounts":[{"name":"Requester","type":{"kind":"struct","fields":[{"name":"authority","type":"publicKey"},{"name":"oracle","type":"publicKey"},{"name":"createdAt","type":"i64"},{"name":"count","type":"u64"},{"name":"lastUpdated","type":"i64"},{"name":"random","type":{"array":["u8",64]}},{"name":"pktId","type":{"array":["u8",32]}},{"name":"tlsId","type":{"array":["u8",32]}},{"name":"activeRequest","type":"bool"},{"name":"bump","type":"u8"}]}},{"name":"Vault","type":{"kind":"struct","fields":[{"name":"requester","type":"publicKey"},{"name":"bump","type":"u8"}]}}],"errors":[{"code":300,"name":"Unauthorized","msg":"You are not authorized to complete this transaction"},{"code":301,"name":"AlreadyCompleted","msg":"You have already completed this transaction"},{"code":302,"name":"InflightRequest","msg":"A request is already in progress. Only one request may be made at a time"},{"code":303,"name":"WrongOracle","msg":"The Oracle you make the request with must be the same as initialization"},{"code":304,"name":"RequesterLocked","msg":"You cannot change authority of a request awaiting a response"}],"metadata":{"address":"2LXeKGTxVXwGpxvqLFgHzJyG4CFHXtBCKHXB6LPPv4N4"}}');

    const program = anchor.workspace.CrossPile as Program<CrossPile>;
    const userProgram = new anchor.Program(program.idl, program.programId, provider);
    const user2Program = new anchor.Program(program.idl, program.programId, provider2);

    // const oraclePubkey = new anchor.web3.PublicKey('qkyoiJyAtt7dzaUTsiQYYyGRrnJL3AE1mP93bmFXpY8');
    const oraclePubkey = oracle.publicKey;
    const solRngId = new anchor.web3.PublicKey('2LXeKGTxVXwGpxvqLFgHzJyG4CFHXtBCKHXB6LPPv4N4');
    const solRngProgram = new anchor.Program(solRngIdl, solRngId, provider);
    let reqAccount, reqBump;
    let reqVaultAccount, reqVaultBump;
    let coinAccount, coinBump;
    let vaultAccount, vaultBump;
    let flipAccount, flipBump;

    anchor.setProvider(provider);

    it('Set up tests', async () => {
        console.log('User Pubkey: ', userKeyPair.publicKey.toString());
        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(userKeyPair.publicKey, 1000000000),
            "confirmed"
        );

        console.log('User 2 Pubkey: ', user2KeyPair.publicKey.toString());
        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(user2KeyPair.publicKey, 1000000000),
            "confirmed"
        );

        console.log('Oracle Pubkey', oracle.publicKey.toString());
        await provider.connection.confirmTransaction(
            await provider.connection.requestAirdrop(oracle.publicKey, 1000000000),
            "confirmed"
        );

        [reqAccount, reqBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("r-seed"), userKeyPair.publicKey.toBuffer()],
            solRngId
            );

        [reqVaultAccount, reqVaultBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("v-seed"), userKeyPair.publicKey.toBuffer()],
            solRngId,
            );

        await solRngProgram.rpc.initialize(
            reqBump,
            reqVaultBump,
            {
                accounts: {
                    requester: reqAccount,
                    vault: reqVaultAccount,
                    authority: userKeyPair.publicKey,
                    oracle: oraclePubkey,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                signers: [userKeyPair],
            }
        );
    });

    it('Create a coin!', async () => {
        [coinAccount, coinBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("coin-seed"), userKeyPair.publicKey.toBuffer()],
            program.programId
            );

        [vaultAccount, vaultBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from("vault-seed"), userKeyPair.publicKey.toBuffer()],
            program.programId
            );

        console.log('Coin account: ', coinAccount.toString());
        console.log('Req account: ', reqAccount.toString());
        console.log('Vault account: ', vaultAccount.toString());

        await program.rpc.createCoin(
            coinBump,
            reqBump,
            vaultBump,
            {
                accounts: {
                    coin: coinAccount,
                    vault: vaultAccount,
                    requester: reqAccount,
                    initiator: userKeyPair.publicKey,
                    acceptor: user2KeyPair.publicKey,
                    oracle: oraclePubkey,
                    oracleVault: reqVaultAccount,
                    solRngProgram: solRngId,
                    rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                signers: [userKeyPair],
            }
        );
    });

    it('Approve a flip', async () => {
        anchor.setProvider(provider2);
        await user2Program.rpc.approveFlip(
            {
                accounts: {
                    authority: user2KeyPair.publicKey,
                    vault: vaultAccount,
                    initiator: userKeyPair.publicKey,
                    requester: reqAccount,
                    oracle: oraclePubkey,
                    oracleVault: reqVaultAccount,
                    solRngProgram: solRngId,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                remainingAccounts: [
                    {
                        pubkey: coinAccount,
                        isWritable: true,
                        isSigner: false,
                    },
                ],
                signers: [user2KeyPair],
            },
        );
    });

    it('Oracle responds to request', async () => {
        let randomNumber = randomBytes(64);
        let pktId = randomBytes(32);
        let tlsId = randomBytes(32);

        anchor.setProvider(oracleProvider);
        await solRngProgram.rpc.publishRandom(
            randomNumber,
            pktId,
            tlsId, 
            {
                accounts: {
                    oracle: oracle.publicKey,
                    requester: reqAccount,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                remainingAccounts: [
                    {
                        pubkey: reqAccount,
                        isWritable: true,
                        isSigner: false,
                    },
                ],
                signers: [oracle],
            },
        );
    });

    it('Reveal the result', async () => {
        anchor.setProvider(provider2);
        await user2Program.rpc.revealCoin(
            {
                accounts: {
                    initiator: userKeyPair.publicKey,
                    acceptor: user2KeyPair.publicKey,
                    vault: vaultAccount,
                    requester: reqAccount,
                    authority: user2KeyPair.publicKey,
                    solRngProgram: solRngId,
                    systemProgram: anchor.web3.SystemProgram.programId,
                },
                remainingAccounts: [
                    {
                        pubkey: coinAccount,
                        isWritable: true,
                        isSigner: false,
                    },
                ],
                signers: [user2KeyPair],
            },
        );
    });
});
