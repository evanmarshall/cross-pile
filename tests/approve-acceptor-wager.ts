import * as anchor from '@project-serum/anchor';
import { AnchorError, Program } from '@project-serum/anchor';
import { MockOracleSession, SOLRAND_IDL, PROGRAM_ID } from '@demox-labs/solrand';
import { SolrandSession } from '../app/solrandSession';
import { CrossPile } from '../target/types/cross_pile';
import { Session, User } from "../app/sessions";
import { PublicKey } from '@solana/web3.js';
import { expect } from 'chai';
import { TimeLogger, CommitmentLevel, instantiateSessions, newChallenges, createChallengesWithAddressAndBump, createMintsInParallel } from '../app/utils';
import { Challenge } from '../app/challenge';

const timeLogger = new TimeLogger();
timeLogger.disable();
const program = anchor.workspace.CrossPile as Program<CrossPile>;
const ENV = 'http://localhost:8899';
const uuid = Math.floor(Math.random() * 2**50);

describe('approve-acceptor-wager', () => {
    timeLogger.log("beginning approve-acceptor-wager tests");

    after(() => {
        timeLogger.log("all approve-acceptor-wager tests finished");
        timeLogger.outputAllLogs();
    });

    const solrandId = new anchor.web3.PublicKey(PROGRAM_ID);
    const oracleKeypair = anchor.web3.Keypair.generate();
    const oracleSession = new MockOracleSession(oracleKeypair, SOLRAND_IDL, solrandId, ENV);

    let initiatorSessions = instantiateSessions(2, program, ENV, timeLogger);
    let acceptorSessions = instantiateSessions(2, program, ENV, timeLogger);
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
        timeLogger.log("running initial airdrops and solrand set accounts in parallel");
        await Promise.all([
            thirdPartySession.requestAirdrop(),
            allUserSessions.map((session) => session.requestAirdrop()),
            oracleSession.provider.connection.confirmTransaction(
                await oracleSession.provider.connection.requestAirdrop(oracleKeypair.publicKey, 10000000000),
            ),
            solrandSessions.map((session) => session.setAccounts())
        ]);

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

    describe('approve_acceptor_wager', () => {
        it('throws unauthorized error when account other than initiator calls it', async () => {
            let testIndex = 0;
            let acceptor = acceptors[testIndex];
            let solrandSession = solrandSessions[testIndex];
            let expectedChallenge = expectedChallenges[testIndex];

            const acceptorWagerTokenAmount = 37;
            const acceptorWagerTokenAmountBigNumber = new anchor.BN(acceptorWagerTokenAmount);

            timeLogger.log("accepting challenge");
            await acceptor.acceptChallenge(
                expectedChallenge.address,
                acceptorWagerTokenAmountBigNumber
                );

            timeLogger.log("challenge accepted");

            // challenge accepted, now accept the wager as the acceptor
            timeLogger.log("approving acceptor's wager");
            try {
                await acceptor.approveAcceptorWager(
                    expectedChallenge.address,
                    solrandSession.userSession.reqAccount,
                    oracleKeypair.publicKey
                    );
            } catch (err) {
                const errMsg = "You are not authorized to complete this transaction";
                let anchorError = err as AnchorError;
                expect(anchorError.message).include(errMsg);
            }
        });

        it('approves acceptor wager', async () => {
            let testIndex = 1;
            let initiator = initiators[testIndex];
            let acceptor = acceptors[testIndex];
            let solrandSession = solrandSessions[testIndex];
            let expectedChallenge = expectedChallenges[testIndex];

            const acceptorWagerTokenAmountBigNumber = new anchor.BN(37);
            const acceptorWagerTokenAmount = acceptorWagerTokenAmountBigNumber.toNumber();

            await acceptor.acceptChallenge(
                expectedChallenge.address,
                acceptorWagerTokenAmountBigNumber
                );

            timeLogger.log("challenge accepted");

            // challenge accepted, now accept the wager
            timeLogger.log("approving acceptor's wager");
            let approvalTx = await initiator.approveAcceptorWager(
                expectedChallenge.address,
                solrandSession.userSession.reqAccount,
                oracleKeypair.publicKey
                );
            await initiator.session.provider.connection.confirmTransaction(
                approvalTx,
                CommitmentLevel.FINALIZED
            );
            timeLogger.log("acceptor wager approved");
            timeLogger.log("expected challenge: " + expectedChallenge.address.toString());
            let challengeData = await program.account.challenge.fetch(expectedChallenge.address);
            timeLogger.log("challengeData: " + challengeData);
            let actualChallenge = new Challenge(program.programId, null, null, challengeData);
            expectedChallenge.initiatorTokensMint = mint1;
            expectedChallenge.initiatorTokensVault = initiator.tokensVaultAddress;
            expectedChallenge.initiatorWagerTokenAmount = initiatorWagerTokenAmount;
            expectedChallenge.acceptor = acceptor.session.userKeypair.publicKey;
            expectedChallenge.acceptorTokensVault = acceptor.tokensVaultAddress;
            expectedChallenge.acceptorTokensMint = mint2;
            expectedChallenge.acceptorWagerTokenAmount = acceptorWagerTokenAmount;
            expectedChallenge.acceptorWagerApproved = true;

            expectedChallenge.isEquivalentTo(actualChallenge);
        });
    });
});