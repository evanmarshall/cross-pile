import * as anchor from '@project-serum/anchor';
import { Program } from "@project-serum/anchor";
import { PROGRAM_ID } from '@demox-labs/solrand';
import { PublicKey } from "@solana/web3.js";
import { CrossPile } from "../target/types/cross_pile";
import { Session, User } from "./sessions";
import { SolrandSession } from "./solrandSession";
import { Challenge } from "./challenge";
import * as spl from '@solana/spl-token';

const solrandId = new anchor.web3.PublicKey(PROGRAM_ID);

export class TimeLogger {
    startTime: number;
    lastTimeLogged: number;
    logs: any[];
    enabled: boolean = true;

    constructor() {
        this.startTime = new Date().getTime();
        this.lastTimeLogged = this.startTime;
        this.logs = [];
    }

    log(event: string) {
        if (this.enabled) {
            let time = new Date().getTime();
            let timeElapsedSinceStart = time - this.startTime;
            let timeElapsedSinceLastTime = time - this.lastTimeLogged;
            let logObject = {
                timeElapsedSinceStart: timeElapsedSinceStart,
                timeElapsedSinceLastLog: timeElapsedSinceLastTime,
                eventName: event
            };
            this.logs.push(logObject);
            this.lastTimeLogged = time;
            console.table(logObject)
        }
    }

    outputAllLogs() {
        if (this.enabled) {
            console.table(this.logs);
        }
    }

    disable() {
        this.enabled = false;
    }
}

export function instantiateSessions(
    numSessionsToCreate: number,
    program: Program<CrossPile>,
    env: string,
    timeLogger: TimeLogger
    ): Session[]
    {
        let sessions = [];
        for (var i = 0; i < numSessionsToCreate; i++) {
            sessions.push(new Session(program, env, timeLogger));
        }
        return sessions;
    }

export async function createChallengesWithAddressAndBump(
    initiators: User[],
    solrandSessions: SolrandSession[],
    ): Promise<Challenge[]>
    {
        let challenges: Challenge[] = [];
        for (let i = 0; i < initiators.length; i++) {
            let challenge = new Challenge(
                initiators[i].session.userKeypair.publicKey,
                solrandSessions[i].userSession.reqAccount);
            await challenge.assignAddressAndBump();
            challenges.push(challenge);
        }

        return challenges;
    }

export function newChallenges(
    initiators: User[],
    solrandSessions: SolrandSession[],
    initiatorWagerTokenAmount: Number,
    expectedChallenges: Challenge[]
    ): Promise<string>[]
    {
        const initiatorWagerTokenAmountBigNumber = new anchor.BN(initiatorWagerTokenAmount);
        let newChallengeTransactions: Promise<string>[] = [];

        for (let i = 0; i < initiators.length; i++) {
            let initiator = initiators[i];
            let solrandSession = solrandSessions[i];
            let expectedChallenge = expectedChallenges[i];

            let newChallengeTx = initiator.newChallenge(expectedChallenge, initiatorWagerTokenAmountBigNumber, solrandId, solrandSession.userSession.reqAccount);

            newChallengeTransactions.push(newChallengeTx);
        }

        return newChallengeTransactions;
    }

export function createMintsInParallel(
    numMints: number,
    mintSessionCreator: Session,
    ): Promise<PublicKey>[]
    {
        let mintCreationPromises: Promise<PublicKey>[] = [];
        for (let i = 0; i < numMints; i++) {
            let mintPromise = spl.createMint(
                mintSessionCreator.provider.connection,
                mintSessionCreator.userKeypair,
                mintSessionCreator.userKeypair.publicKey,
                null, // don't need a freeze authority for the example mint
                9, // decimal places 9, could change this to 1 if we wanted this mint to be explicitly for an NFT
                anchor.web3.Keypair.generate(),
            );
            mintCreationPromises.push(mintPromise);
        }

        return mintCreationPromises;
    }

export enum CommitmentLevel {
    PROCESSED = "processed",
    CONFIRMED = "confirmed",
    FINALIZED = "finalized"
}