import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { SOLRAND_IDL, PROGRAM_ID } from '@demox-labs/solrand';
import { SolrandSession } from '../app/solrandSession';
import { CrossPile } from '../target/types/cross_pile';
import { Session, User } from "../app/sessions";
import * as spl from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { expect } from 'chai';
import { TimeLogger, CommitmentLevel, instantiateSessions } from '../app/utils';
import { Challenge } from '../app/challenge';

const timeLogger = new TimeLogger();
timeLogger.disable();
const program = anchor.workspace.CrossPile as Program<CrossPile>;
const ENV = 'http://localhost:8899';
const uuid = Math.floor(Math.random() * 2**50);

describe('new-challenge', () => {
    timeLogger.log("beginning new-challenge tests");

    after(() => {
        timeLogger.log("all new-challenge tests finished");
        timeLogger.outputAllLogs();
    });

    let initiator: User;
    let initiatorSession = instantiateSessions(1, program, ENV, timeLogger)[0];
    const solrandId = new anchor.web3.PublicKey(PROGRAM_ID);
    const oracleKeypair = anchor.web3.Keypair.generate();

    let solrandSession = new SolrandSession(initiatorSession.userKeypair, SOLRAND_IDL, solrandId, oracleKeypair.publicKey, ENV, uuid)

    const thirdPartySession = new Session(program, ENV, timeLogger);

    const mintAuthority = thirdPartySession.userKeypair;
    let mint: PublicKey;

    const initialTokenFundAmount = 2000;
    it('Set up tests', async() => {
        await Promise.all([
            thirdPartySession.requestAirdrop(),
            initiatorSession.requestAirdrop(),
            solrandSession.setAccounts()
        ]);

        timeLogger.log("creating mints and initializing solrand accounts");

        let mintPromise = spl.createMint(
            thirdPartySession.provider.connection,
            mintAuthority,
            thirdPartySession.userKeypair.publicKey,
            null, // don't need a freeze authority for the example mint
            9, // decimal places 9
            anchor.web3.Keypair.generate(),
            {
                commitment: CommitmentLevel.FINALIZED
            }
        );
        timeLogger.log("mint created");

        await Promise.all([
            mintPromise,
            solrandSession.initializeAccount()
        ]).then((values) => {
            mint = values[0];
        });

        await initiatorSession.fundTokens(initialTokenFundAmount, mint, mintAuthority);
    });

    describe('new_challenge', () => {
        before(async () => {
            initiator = new User(initiatorSession);
        });
        timeLogger.log("beginning new challenge");

        it('creates a new challenge', async () => {
            const wagerTokensAmount = 1000;
            const wagerTokensAmountBigNumber = new anchor.BN(wagerTokensAmount);

            let tokenSourceAccount = await initiator.session.getOrCreateAssociatedTokenAccount(initiator.session.tokensSource.mint, mintAuthority);
            timeLogger.log("initiator token source account amount right before challenge: " + tokenSourceAccount.amount);

            let expectedChallenge = new Challenge(initiator.session.userKeypair.publicKey, solrandSession.userSession.reqAccount);
            await expectedChallenge.assignAddressAndBump();

            let newChallengeTx = await initiator.newChallenge(expectedChallenge, wagerTokensAmountBigNumber, solrandId, solrandSession.userSession.reqAccount);
            timeLogger.log("challenge created");
            await initiator.session.provider.connection.confirmTransaction(
                newChallengeTx, CommitmentLevel.FINALIZED
            );
            timeLogger.log("challenge confirmed");
    
            let challengeData = await program.account.challenge.fetch(expectedChallenge.address);
            tokenSourceAccount = await initiator.session.getOrCreateAssociatedTokenAccount(initiator.session.tokensSource.mint, mintAuthority);

            const initiatorTokensVaultAccount = await spl.getAccount(
                initiator.session.provider.connection,
                initiator.tokensVaultAddress
            );

            expectedChallenge.initiatorTokensMint = mint;
            expectedChallenge.initiatorTokensVault = initiator.tokensVaultAddress;
            expectedChallenge.initiatorWagerTokenAmount = wagerTokensAmount;

            let actualChallenge = new Challenge(null, null, challengeData);

            expectedChallenge.isEquivalentTo(actualChallenge);
            expect(Number(tokenSourceAccount.amount))
                .equals(initialTokenFundAmount - wagerTokensAmount);
            expect(Number(initiatorTokensVaultAccount.amount))
                .equals(Number(wagerTokensAmount));
        });
    });
});