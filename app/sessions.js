const anchor = require('@project-serum/anchor');

class Session {
    constructor(keypair, idl, programId, env) {
        this.keypair = keypair;
        this.idl = idl;
        this.programId = programId;
        this.seed = "challenge";

        this.solConnection = new anchor.web3.Connection(env);
        this.walletWrapper = new anchor.Wallet(this.keypair);
        this.provider = new anchor.Provider(this.solConnection, this.walletWrapper, {
            preflightCommitment: 'recent',
            commitment: 'finalized'
        });
        this.program = new anchor.Program(idl, programId, this.provider);
    }

    async getBalance() {
        anchor.setProvider(this.provider);
        return await this.provider.connection.getBalance(this.keypair.publicKey, "confirmed");
    }

    async requestAirdrop(amount=1000000000) {
        anchor.setProvider(this.provider);

        await this.provider.connection.confirmTransaction(
            await this.provider.connection.requestAirdrop(this.keypair.publicKey, amount),
            "confirmed"
        );
    }

    async fetchChallenge(challengeAccount) {
        let data = await this.program.account.challenge.fetch(challengeAccount);
        return data;
    }
}

class ChallengerSession extends Session {
    constructor(keypair, idl, programId, env) {
        super(keypair, idl, programId, env);
    }

    async setAccounts() {
        anchor.setProvider(this.provider);
        [this.challenge, this.challengeBump] = await anchor.web3.PublicKey.findProgramAddress(
            [Buffer.from(this.seed), this.keypair.publicKey.toBuffer()],
            this.programId
        );
    }

    async newChallenge(amount) {
        anchor.setProvider(this.provider);

        await this.program.rpc.newChallenge(
            this.challengeBump, 
            amount, 
            {
                accounts: {
                    challenge: this.challenge,
                    challengeInitiator: this.keypair.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                }
            }
        );
    }
 }

class ChallengeeSession extends Session {
    constructor(keypair, idl, programId, env) {
        super(keypair, idl, programId, env);
    }

    async acceptChallenge(challenge) {
        anchor.setProvider(this.provider);

        await this.program.rpc.acceptChallenge(
            {
                accounts: {
                    challenge: challenge,
                    challengee: this.keypair.publicKey,
                    systemProgram: anchor.web3.SystemProgram.programId,
                }
            }
        );
    }
}

module.exports = { ChallengerSession, ChallengeeSession }