import { web3, Wallet, Provider, Program, setProvider, Idl, Address } from '@project-serum/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { CrossPile } from '../target/types/cross_pile';

export class Session {
    userKeypair: Keypair;
    idl: Idl;
    programId: PublicKey;
    seed: string;
    solConnection: Connection;
    walletWrapper: Wallet;
    provider: Provider;
    program: Program<CrossPile>;

    constructor(program: Program<CrossPile>, env: string) {
        this.userKeypair = web3.Keypair.generate();;
        this.idl = program.idl;
        this.programId = program.programId;
        this.seed = "challenge";

        this.solConnection = new web3.Connection(env);
        this.walletWrapper = new Wallet(this.userKeypair);
        this.provider = new Provider(this.solConnection, this.walletWrapper, {
            preflightCommitment: 'recent',
            commitment: 'finalized'
        });
        this.program = new Program(program.idl, program.programId, this.provider);
    }

    async getBalance() {
        setProvider(this.provider);
        return await this.provider.connection.getBalance(this.userKeypair.publicKey, "confirmed");
    }

    async requestAirdrop(amount=1000000000) {
        setProvider(this.provider);

        await this.provider.connection.confirmTransaction(
            await this.provider.connection.requestAirdrop(this.userKeypair.publicKey, amount),
            "confirmed"
        );
    }

    async fetchAccount(account: Address) {
        let data = await this.program.account.challenge.fetch(account);
        return data;
    }
}

export class Initiator {
    session: Session;
    challengeAddress: PublicKey;
    challengeBump: any; // u8

    constructor(session: Session) {
        this.session = session;
    }

    async setChallengeAddress() {
        setProvider(this.session.provider);
        [this.challengeAddress, this.challengeBump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.session.seed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId
        );
    }

    /**
     * @param {any} amount
     */
    async newChallenge(amount) {
        setProvider(this.session.provider);

        await this.session.program.rpc.newChallenge(
            this.challengeBump, 
            amount, 
            {
                accounts: {
                    challenge: this.challengeAddress,
                    initiator: this.session.userKeypair.publicKey,
                    systemProgram: web3.SystemProgram.programId,
                }
            }
        );
    }
 }

export class Acceptor {
    session: Session;

    constructor(session: Session) {
        this.session = session;
    }

    /**
     * @param {any} challenge
     */
    async acceptChallenge(challengeAddress) {
        setProvider(this.session.provider);

        await this.session.program.rpc.acceptChallenge(
            {
                accounts: {
                    challenge: challengeAddress,
                    acceptor: this.session.userKeypair.publicKey,
                    systemProgram: web3.SystemProgram.programId,
                }
            }
        );
    }
}