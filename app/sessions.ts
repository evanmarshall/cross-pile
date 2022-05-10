import { web3, Wallet, Provider, Program, setProvider, Idl, BN, AnchorProvider } from '@project-serum/anchor';
import { Keypair, PublicKey, Connection } from '@solana/web3.js';
import { CrossPile } from '../target/types/cross_pile';
import * as spl from '@solana/spl-token';
import { TimeLogger, CommitmentLevel } from './utils';
import { Challenge } from './challenge';
import { PROGRAM_ID } from '@demox-labs/solrand';

const solrandId = new web3.PublicKey(PROGRAM_ID);

export class Session {
    userKeypair: Keypair;
    idl: Idl;
    programId: PublicKey;
    seed: string;
    solConnection: Connection;
    walletWrapper: Wallet;
    provider: Provider;
    program: Program<CrossPile>;
    timeLogger: TimeLogger;
    tokensSource: spl.Account;

    constructor(program: Program<CrossPile>, env: string, timeLogger: TimeLogger) {
        this.timeLogger = timeLogger;
        this.userKeypair = web3.Keypair.generate();;
        this.idl = program.idl;
        this.programId = program.programId;
        this.seed = "challenge";

        this.solConnection = new web3.Connection(env);
        this.walletWrapper = new Wallet(this.userKeypair);
        this.provider = new AnchorProvider(this.solConnection, this.walletWrapper, {
            preflightCommitment: 'recent',
            commitment: CommitmentLevel.CONFIRMED
        });
        this.program = new Program(program.idl, program.programId, this.provider);
        timeLogger.log("created Session");
    }

    async getBalance() {
        this.timeLogger.log("getting balance for " + this.userKeypair.publicKey);
        setProvider(this.provider);
        return await this.provider.connection.getBalance(this.userKeypair.publicKey, 'processed');
    }

    async requestAirdrop(amount=10_000_000_000) {
        setProvider(this.provider);

        this.timeLogger.log("requesting airdrop of " + amount + " for " + this.userKeypair.publicKey.toString());
        await this.provider.connection.confirmTransaction(
            await this.provider.connection.requestAirdrop(this.userKeypair.publicKey, amount),
            CommitmentLevel.FINALIZED // need finalized here before we can use this balance
        );
        this.timeLogger.log("airdrop complete for " + this.userKeypair.publicKey.toString());
    }

    async getOrCreateAssociatedTokenAccount(tokensMintPublicKey: PublicKey, mintAuthority: Keypair): Promise<spl.Account> {
        setProvider(this.provider);
        return await spl.getOrCreateAssociatedTokenAccount(
            this.provider.connection,
            mintAuthority,
            tokensMintPublicKey,
            this.userKeypair.publicKey
        );
    }

    async fundTokens(tokenFundAmount: number, mintOfTokens: PublicKey, mintAuthority: Keypair) {
        this.timeLogger.log("funding tokens");
        setProvider(this.provider);

        this.tokensSource = await spl.getOrCreateAssociatedTokenAccount(
            this.provider.connection,
            this.userKeypair,
            mintOfTokens,
            this.userKeypair.publicKey,
        );

        this.timeLogger.log("tokens source account created");

        const mintTx = await spl.mintTo(
            this.provider.connection,
            this.userKeypair,
            mintOfTokens,
            this.tokensSource.address,
            mintAuthority,
            tokenFundAmount
        );

        await this.provider.connection.confirmTransaction(mintTx, CommitmentLevel.FINALIZED);

        this.tokensSource = await spl.getOrCreateAssociatedTokenAccount(
            this.provider.connection,
            this.userKeypair,
            mintOfTokens,
            this.userKeypair.publicKey,
        );
        this.timeLogger.log("tokens funded: " + Number(this.tokensSource.amount).toString());
        this.timeLogger.log("tokens source account funded");
    }
}

export class User {
    session: Session;
    tokensVaultAddress: PublicKey;
    tokensVaultBump: any; // u8
    acceptorTokensVaultSeed: string = "acceptor_tokens_vault";
    initiatorTokensVaultSeed: string = "initiator_tokens_vault";
    ownTokensTakerAccount: spl.Account;
    otherTokensTakerAccount: spl.Account;
    opponentOwnTokensTakerAccount: spl.Account;
    opponentOtherTokensTakerAccount: spl.Account;

    constructor(session: Session) {
        this.session = session;
    }

    async getChallengeAddressAndBump(): Promise<[PublicKey, any]> {
        return await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.session.seed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId,
        );
    }

    async newChallenge(
        challenge: Challenge,
        amountOfTokens: BN,
        solrandId: PublicKey,
        solrandRequester: PublicKey
        ): Promise<string> {
        setProvider(this.session.provider);

        [this.tokensVaultAddress, this.tokensVaultBump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.initiatorTokensVaultSeed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId,
        );
        
        this.session.timeLogger.log("creating new challenge: " + challenge.address.toString());
        this.session.timeLogger.log("wager amount: " + Number(amountOfTokens).toString());
        this.session.timeLogger.log("token source amount: " + this.session.tokensSource.amount);
        return await this.session.program.methods.newChallenge(
            challenge.bump,
            this.tokensVaultBump,
            amountOfTokens
            )
            .accounts({
                challenge: challenge.address,
                initiatorTokensVault: this.tokensVaultAddress,
                initiatorTokensMint: this.session.tokensSource.mint,
                initiator: this.session.userKeypair.publicKey,
                initiatorTokensSource: this.session.tokensSource.address,
                requester: solrandRequester,
                solrandProgram: solrandId,
                systemProgram: web3.SystemProgram.programId,
                rent: web3.SYSVAR_RENT_PUBKEY,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    async acceptChallenge(
        challengeAddress: PublicKey,
        wagerTokenAmount: BN
        ): Promise<string> {
        setProvider(this.session.provider);

        [this.tokensVaultAddress, this.tokensVaultBump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.acceptorTokensVaultSeed), this.session.userKeypair.publicKey.toBuffer()],
            this.session.programId,
        );

        return await this.session.program.methods.acceptChallenge(
            this.tokensVaultBump,
            wagerTokenAmount
            )
            .accounts({
                acceptor: this.session.userKeypair.publicKey,
                challenge: challengeAddress,
                acceptorTokensVault: this.tokensVaultAddress,
                acceptorTokensMint: this.session.tokensSource.mint,
                acceptorTokensSource: this.session.tokensSource.address,
                systemProgram: web3.SystemProgram.programId,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
                rent: web3.SYSVAR_RENT_PUBKEY,
            })
            .rpc();
    }

    async approveAcceptorWager(
        challengeAddress: PublicKey,
        solrandRequester: PublicKey,
        oracle: PublicKey
    ): Promise<string> {
        setProvider(this.session.provider);

        return await this.session.program.methods.approveAcceptorWager()
            .accounts({
                initiator: this.session.userKeypair.publicKey,
                challenge: challengeAddress,
                requester: solrandRequester,
                oracle: oracle,
                solrandProgram: solrandId,
                systemProgram: web3.SystemProgram.programId,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    async declineAcceptorWager(
        challengeAddress: PublicKey,
        acceptor: PublicKey,
        acceptorTokensVault: PublicKey,
        acceptorOwnTokensTaker: PublicKey
    ): Promise<string> {
        setProvider(this.session.provider);

        return await this.session.program.methods.declineAcceptorWager()
            .accounts({
                caller: this.session.userKeypair.publicKey,
                challenge: challengeAddress,
                acceptor: acceptor,
                acceptorTokensVault: acceptorTokensVault,
                acceptorOwnTokensTaker: acceptorOwnTokensTaker,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    async revealWinner(
        challengeAddress: PublicKey,
        initiatorTokensVault: PublicKey,
        otherTokensMintPublicKey: PublicKey,
        initiatorPubKey: PublicKey,
        acceptorTokensVault: PublicKey,
        acceptorPubKey: PublicKey,
        solrandId: PublicKey,
        solrandRequester: PublicKey,
        ): Promise<string>
    {
        setProvider(this.session.provider);
        let selfIsAcceptor = this.session.userKeypair.publicKey.toString() === acceptorPubKey.toString();
        let otherPubkey = selfIsAcceptor ? initiatorPubKey : acceptorPubKey;

        this.ownTokensTakerAccount = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            this.session.tokensSource.mint,
            this.session.userKeypair.publicKey,
        );

        this.otherTokensTakerAccount = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            otherTokensMintPublicKey,
            this.session.userKeypair.publicKey,
        );

        this.opponentOwnTokensTakerAccount = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            otherTokensMintPublicKey,
            otherPubkey
        );

        this.opponentOtherTokensTakerAccount = await spl.getOrCreateAssociatedTokenAccount(
            this.session.provider.connection,
            this.session.userKeypair,
            this.session.tokensSource.mint,
            otherPubkey
        );

        let acceptorOwnTokensTaker = this.ownTokensTakerAccount.address;
        let acceptorOtherTokensTaker = this.otherTokensTakerAccount.address;
        let initiatorOwnTokensTaker = this.opponentOwnTokensTakerAccount.address;
        let initiatorOtherTokensTaker = this.opponentOtherTokensTakerAccount.address;

        if (!selfIsAcceptor) {
            acceptorOwnTokensTaker = this.opponentOwnTokensTakerAccount.address;
            acceptorOtherTokensTaker = this.opponentOtherTokensTakerAccount.address;
            initiatorOwnTokensTaker = this.ownTokensTakerAccount.address;
            initiatorOtherTokensTaker = this.otherTokensTakerAccount.address;
        }

        return await this.session.program.methods.revealWinner()
            .accounts({
                challenge: challengeAddress,
                initiator: initiatorPubKey,
                acceptor: acceptorPubKey,
                initiatorTokensVault: initiatorTokensVault,
                acceptorTokensVault: acceptorTokensVault,
                acceptorOwnTokensTaker: acceptorOwnTokensTaker,
                acceptorOtherTokensTaker: acceptorOtherTokensTaker,
                initiatorOwnTokensTaker: initiatorOwnTokensTaker,
                initiatorOtherTokensTaker: initiatorOtherTokensTaker,
                requester: solrandRequester,
                solrandProgram: solrandId,
                systemProgram: web3.SystemProgram.programId,
                tokenProgram: spl.TOKEN_PROGRAM_ID,
            })
            .rpc();
    }

    async cancelBeforeAcceptor(
        challengeAddress: PublicKey,
    ) : Promise<string>
    {
        return await this.session.program.methods.cancelBeforeAcceptor()
            .accounts({
                initiator: this.session.userKeypair.publicKey,
                challenge: challengeAddress,
                initiatorTokensVault: this.tokensVaultAddress,
                initiatorOwnTokensTaker: this.session.tokensSource.address,
                tokenProgram: spl.TOKEN_PROGRAM_ID
            })
            .rpc();
    }

    async cancelAfterAcceptor(
        challengeAddress: PublicKey,
        acceptor: PublicKey,
        acceptorTokensVault: PublicKey,
        acceptorTokensSource: PublicKey
    ) : Promise<string>
    {
        return await this.session.program.methods.cancelAfterAcceptor()
            .accounts({
                initiator: this.session.userKeypair.publicKey,
                challenge: challengeAddress,
                initiatorTokensVault: this.tokensVaultAddress,
                initiatorOwnTokensTaker: this.session.tokensSource.address,
                acceptor: acceptor,
                acceptorTokensVault: acceptorTokensVault,
                acceptorOwnTokensTaker: acceptorTokensSource,
                tokenProgram: spl.TOKEN_PROGRAM_ID
            })
            .rpc();
    }
}