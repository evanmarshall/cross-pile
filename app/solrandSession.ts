import * as anchor from '@project-serum/anchor';
import { UserSession } from '@demox-labs/solrand';
import { Keypair, PublicKey } from '@solana/web3.js';

export class SolrandSession {
    userSession: UserSession;

    constructor(keypair: Keypair, solrandIDL: any, solrandId: PublicKey, oraclePublicKey: PublicKey, env: string, uuid: number)
    {
        this.userSession = new UserSession(keypair, solrandIDL, solrandId, oraclePublicKey, env, uuid);
    }

    async setAccounts() {
        return await this.userSession.setAccounts();
    }

    async initializeAccount(): Promise<anchor.web3.RpcResponseAndContext<anchor.web3.SignatureResult>> {
        anchor.setProvider(this.userSession.provider);
        
        let initTx = await this.userSession.program.methods.initialize(this.userSession.reqBump, this.userSession.uuid)
            .accounts({
                requester: this.userSession.reqAccount,
                authority: this.userSession.keypair.publicKey,
                oracle: this.userSession.oraclePubkey,
                rent: anchor.web3.SYSVAR_RENT_PUBKEY,
                systemProgram: anchor.web3.SystemProgram.programId
            })
            .signers([this.userSession.keypair])
            .rpc();
        
        return await this.userSession.provider.connection.confirmTransaction(initTx);//, CommitmentLevel.FINALIZED);
    }
}