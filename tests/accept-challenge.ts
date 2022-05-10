import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { MockOracleSession, SOLRAND_IDL, PROGRAM_ID } from '@demox-labs/solrand';
import { SolrandSession } from '../app/solrandSession';
import { CrossPile } from '../target/types/cross_pile';
import { Session, User } from "../app/sessions";
import * as spl from '@solana/spl-token';
import { PublicKey } from '@solana/web3.js';
import { expect } from 'chai';
import { TimeLogger, CommitmentLevel, instantiateSessions, createMintsInParallel, createChallengesWithAddressAndBump, newChallenges } from '../app/utils';
import { Challenge } from '../app/challenge';

const timeLogger = new TimeLogger();
timeLogger.disable();
const program = anchor.workspace.CrossPile as Program<CrossPile>;
const ENV = 'http://localhost:8899';
const uuid = Math.floor(Math.random() * 2**50);

describe('accept-challenge', () => {
    timeLogger.log("beginning accept-challenge tests");

    after(() => {
        timeLogger.log("all accept-challenge tests finished");
        timeLogger.outputAllLogs();
    });

    const solrandId = new anchor.web3.PublicKey(PROGRAM_ID);
    const oracleKeypair = anchor.web3.Keypair.generate();
    const oracleSession = new MockOracleSession(oracleKeypair, SOLRAND_IDL, solrandId, ENV);

    let initiatorSessions = instantiateSessions(1, program, ENV, timeLogger);
    let acceptorSessions = instantiateSessions(1, program, ENV, timeLogger);
    let solrandSessions = initiatorSessions.map((session) => new SolrandSession(session.userKeypair, SOLRAND_IDL, solrandId, oracleKeypair.publicKey, ENV, uuid));

    let allUserSessions = initiatorSessions.concat(acceptorSessions);

    const thirdPartySession = new Session(program, ENV, timeLogger);

    const mintAuthority = thirdPartySession.userKeypair;
    let mint1: PublicKey;
    let mint2: PublicKey;

    let expectedChallenges: Challenge[];
    let initiators: User[];
    let acceptors: User[];

    const initialTokenFundAmount = 2000;
    const initiatorWagerTokenAmount = 1000;
    it('Set up tests', async() => {
        await Promise.all([
            thirdPartySession.requestAirdrop(),
            allUserSessions.map((session) => session.requestAirdrop()),
            oracleSession.provider.connection.confirmTransaction(
                await oracleSession.provider.connection.requestAirdrop(oracleKeypair.publicKey, 10000000000),
            ),
            solrandSessions.map((session) => session.setAccounts())
        ]);

        timeLogger.log("creating mints and initializing solrand accounts");

        let mintPromises = createMintsInParallel(2, thirdPartySession);
        await Promise.all([
            ...mintPromises,
            solrandSessions.map((session) => session.initializeAccount())
        ]).then((values) => {
            mint1 = values[0] as PublicKey;
            mint2 = values[1] as PublicKey;
        });
        timeLogger.log("mints created, solrand initialized");

        await Promise.all(
            initiatorSessions.map((session) => session.fundTokens(initialTokenFundAmount, mint1, mintAuthority)).concat(
            acceptorSessions.map((session) => session.fundTokens(initialTokenFundAmount, mint2, mintAuthority)))
        );

        initiators = initiatorSessions.map((initiatorSession) => new User(initiatorSession));
        acceptors = acceptorSessions.map((acceptorSession) => new User(acceptorSession));

        expectedChallenges = await createChallengesWithAddressAndBump(program.programId, initiators, solrandSessions);

        await Promise.all(
            newChallenges(initiators, solrandSessions, initiatorWagerTokenAmount, expectedChallenges)
        );
    });

    describe('accept_challenge', () => {
        it('accepts a challenge', async () => {
            let testIndex = 0;
            let initiator = initiators[testIndex];
            let acceptor = acceptors[testIndex];
            let expectedChallenge = expectedChallenges[testIndex];

            const acceptorWagerTokenAmountBigNumber = new anchor.BN(37);
            const acceptorWagerTokenAmount = acceptorWagerTokenAmountBigNumber.toNumber();

            timeLogger.log("new challenge created for accepts a challenge test");
    
            // accept the challenge
            let acceptTx = await acceptor.acceptChallenge(
                expectedChallenge.address,
                acceptorWagerTokenAmountBigNumber
                );

            await acceptor.session.provider.connection.confirmTransaction(
                acceptTx,
                CommitmentLevel.FINALIZED
            );

            let challengeData;
            let acceptorTokenSourceAccount;
            let acceptorTokensVault;
            await Promise.all([
                program.account.challenge.fetch(expectedChallenge.address),
                acceptor.session.getOrCreateAssociatedTokenAccount(acceptor.session.tokensSource.mint, mintAuthority),
                spl.getAccount(
                    acceptor.session.provider.connection,
                    acceptor.tokensVaultAddress
                )
            ]).then((values) => {
                challengeData = values[0];
                acceptorTokenSourceAccount = values[1];
                acceptorTokensVault = values[2];
            });
            let actualChallenge = new Challenge(program.programId, null, null, challengeData);
            expectedChallenge.initiatorTokensMint = mint1;
            expectedChallenge.initiatorTokensVault = initiator.tokensVaultAddress;
            expectedChallenge.initiatorWagerTokenAmount = initiatorWagerTokenAmount;
            expectedChallenge.acceptor = acceptor.session.userKeypair.publicKey;
            expectedChallenge.acceptorTokensVault = acceptor.tokensVaultAddress;
            expectedChallenge.acceptorTokensMint = mint2;
            expectedChallenge.acceptorWagerTokenAmount = acceptorWagerTokenAmount;

            expectedChallenge.isEquivalentTo(actualChallenge);
            expect(Number(acceptorTokenSourceAccount.amount), "Token source should be initial amount minus the amount bet in the wager.")
                .equals(initialTokenFundAmount - acceptorWagerTokenAmount);
            expect(Number(acceptorTokensVault.amount), "Acceptor tokens vault should have the wager amount deposited in it.")
                .equals(Number(acceptorWagerTokenAmount));
        });
    });
});