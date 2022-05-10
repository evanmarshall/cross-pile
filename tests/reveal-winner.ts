import * as anchor from '@project-serum/anchor';
import { Program } from '@project-serum/anchor';
import { MockOracleSession, SOLRAND_IDL, PROGRAM_ID } from '@demox-labs/solrand';
import { SolrandSession } from '../app/solrandSession';
import { CrossPile } from '../target/types/cross_pile';
import { Session, User } from "../app/sessions";
import { PublicKey } from '@solana/web3.js';
import { expect } from 'chai';
import { TimeLogger, CommitmentLevel, instantiateSessions, createMintsInParallel, createChallengesWithAddressAndBump, newChallenges } from '../app/utils';
import { randomBytes } from 'crypto';
import { Challenge } from '../app/challenge';

const timeLogger = new TimeLogger();
timeLogger.disable();
const program = anchor.workspace.CrossPile as Program<CrossPile>;
const ENV = 'http://localhost:8899';
const uuid = Math.floor(Math.random() * 2**50);

describe('reveal-winner', () => {
    timeLogger.log("beginning reveal-winner tests");

    after(() => {
        timeLogger.log("all reveal-winner tests finished");
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

    describe('reveal_winner', () => {
        it('reveals a winner', async () => {
            let testIndex = 0;
            let initiator = initiators[testIndex];
            let acceptor = acceptors[testIndex];
            let solrandSession = solrandSessions[testIndex];
            let expectedChallenge = expectedChallenges[testIndex];

            const acceptorWagerTokenAmountBigNumber = new anchor.BN(37);
    
            await acceptor.acceptChallenge(
                expectedChallenge.address,
                acceptorWagerTokenAmountBigNumber
                );

            timeLogger.log("challenge accepted");

            // challenge accepted, now approve the acceptor's wager
            await initiator.approveAcceptorWager(
                expectedChallenge.address,
                solrandSession.userSession.reqAccount,
                oracleKeypair.publicKey
                );

            timeLogger.log("publishing non random number");
            let randomNumber = randomBytes(64);
            randomNumber[0] = 1; // Force winner to be acceptor

            let requester = { publicKey: solrandSession.userSession.reqAccount };

            await oracleSession.publishRandom(requester, randomNumber);
            timeLogger.log("non random number published");

            // acceptor's wager approved, now reveal the winner
            timeLogger.log("revealing winner");
            let revealTx = await acceptor.revealWinner(
                expectedChallenge.address,
                initiator.tokensVaultAddress,
                initiator.session.tokensSource.mint,
                initiator.session.userKeypair.publicKey,
                acceptor.tokensVaultAddress,
                acceptor.session.userKeypair.publicKey,
                solrandId,
                solrandSession.userSession.reqAccount,
                );
            await acceptor.session.provider.connection.confirmTransaction(
                revealTx,
                CommitmentLevel.FINALIZED
            );
            timeLogger.log("winner revealed");
            
            let acceptorOwnTokensTaker = await acceptor.session.getOrCreateAssociatedTokenAccount(
                acceptor.session.tokensSource.mint,
                mintAuthority
            );
            timeLogger.log("retrieved own tokens taker account");
            let acceptorOtherTokensTaker = await acceptor.session.getOrCreateAssociatedTokenAccount(
                mint1,
                mintAuthority
            );
            timeLogger.log("retrieved other tokens taker account");
            expect(Number(acceptorOwnTokensTaker.amount), "Token own taker should be full amount.")
                .equals(initialTokenFundAmount);
            expect(Number(acceptorOtherTokensTaker.amount), "Token other taker should be initiator bet amount.")
                .equals(initiatorWagerTokenAmount);
        });
    });
});