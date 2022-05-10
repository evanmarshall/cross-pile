import { web3, workspace } from '@project-serum/anchor';
import { TypeDef } from '@project-serum/anchor/dist/cjs/program/namespace/types';
import { Keypair, PublicKey } from '@solana/web3.js';
import { expect } from 'chai';

// full ts class meant to mimic the challenge PDA
// pub initiator: Pubkey,
// pub initiator_tokens_mint: Pubkey,
// pub initiator_tokens_vault: Pubkey,
// pub initiator_wager_token_amount: u64,
// pub acceptor: Pubkey,
// pub acceptor_tokens_mint: Pubkey,
// pub acceptor_tokens_vault: Pubkey,
// pub acceptor_wager_token_amount: u64,
// pub acceptor_wager_approved: bool,
// pub requester: Pubkey,
// pub bump: u8,

export class Challenge {
    // part of initialization
    seed: string = "challenge";
    programId: PublicKey = workspace.CrossPile.programId;
    initiator: PublicKey;
    requester: PublicKey;

    // assignAddressAndBump
    address: PublicKey;
    bump: number;

    // set after new_challenge
    initiatorTokensMint: PublicKey;
    initiatorTokensVault: PublicKey;
    initiatorWagerTokenAmount: number;

    // set after accept_challenge
    // removed after decline_acceptor_wager
    acceptor: PublicKey;
    acceptorTokensVault: PublicKey;
    acceptorTokensMint: PublicKey;
    acceptorWagerTokenAmount: number;

    // set after approve_acceptor_wager, but initialized to false
    acceptorWagerApproved: boolean = false;

    constructor(userPublicKey?: PublicKey, requester?: PublicKey, challengeData?: TypeDef<any, any>, challengeAddress?: PublicKey)
    {
        if (userPublicKey !== null) {
            this.initiator = userPublicKey;

            this.initiatorTokensMint = PublicKey.default;
            this.initiatorTokensVault = PublicKey.default;
            this.initiatorWagerTokenAmount = 0;
            this.acceptor = PublicKey.default;
            this.acceptorTokensVault = PublicKey.default;
            this.acceptorTokensMint = PublicKey.default;
            this.acceptorWagerTokenAmount = 0;
        }

        if (challengeData !== null && challengeData !== undefined) {
            this.initiator = challengeData.initiator;
            this.bump = challengeData.bump;
            this.initiatorTokensMint = challengeData.initiatorTokensMint;
            this.initiatorTokensVault = challengeData.initiatorTokensVault;
            this.initiatorWagerTokenAmount = Number(challengeData.initiatorWagerTokenAmount);
            this.acceptor = challengeData.acceptor;
            this.acceptorTokensVault = challengeData.acceptorTokensVault;
            this.acceptorTokensMint = challengeData.acceptorTokensMint;
            this.acceptorWagerTokenAmount = Number(challengeData.acceptorWagerTokenAmount);
            this.acceptorWagerApproved = challengeData.acceptorWagerApproved;
        }
    }

    async assignAddressAndBump(): Promise<PublicKey> {
        let [address, bump] = await web3.PublicKey.findProgramAddress(
            [Buffer.from(this.seed), this.initiator.toBuffer()],
            this.programId,
        );
        this.address = address;
        this.bump = bump;
        return address;
    }

    isEquivalentTo(otherChallenge: Challenge) {
        expect(otherChallenge.initiator.toString(), "initiator").equals(this.initiator.toString());
        expect(otherChallenge.bump, "Bump").equals(this.bump);
        expect(otherChallenge.initiatorTokensMint.toString(), "initiatorTokensMint").equals(this.initiatorTokensMint.toString());
        expect(otherChallenge.initiatorTokensVault.toString(), "initiatorTokensVault").equals(this.initiatorTokensVault.toString());
        expect(otherChallenge.initiatorWagerTokenAmount, "initiatorWagerTokenAmount").equals(this.initiatorWagerTokenAmount);
        expect(otherChallenge.acceptor.toString(), "acceptor").equals(this.acceptor.toString());
        expect(otherChallenge.acceptorTokensVault.toString(), "acceptorTokensVault").equals(this.acceptorTokensVault.toString());
        expect(otherChallenge.acceptorTokensMint.toString(), "acceptorTokensMint").equals(this.acceptorTokensMint.toString());
        expect(otherChallenge.acceptorWagerTokenAmount, "acceptorWagerTokenAmount").equals(this.acceptorWagerTokenAmount);
        expect(otherChallenge.acceptorWagerApproved, "acceptorWagerApproved").equals(this.acceptorWagerApproved);
        expect(otherChallenge.requester, "requester").equals(this.requester);
    }
}