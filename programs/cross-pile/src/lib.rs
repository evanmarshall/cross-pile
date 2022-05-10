use anchor_lang::prelude::*;
use std::mem::size_of;
use anchor_spl::token::{Mint, Token, TokenAccount};

declare_id!("BCEjUoZJcUJXPhmaLpKPUpXEX8roYXUSwrMD9UrVACow");

#[program]
pub mod cross_pile {
    use super::*;

    pub fn new_challenge(
        ctx: Context<NewChallenge>,
        challenge_bump: u8,
        _initiator_tokens_vault_bump: u8,
        initiator_wager_token_amount: u64,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        challenge.initiator = ctx.accounts.initiator.to_account_info().key.clone();
        challenge.initiator_tokens_mint = ctx.accounts.initiator_tokens_mint.to_account_info().key.clone();
        challenge.initiator_tokens_vault = ctx.accounts.initiator_tokens_vault.to_account_info().key.clone();
        challenge.initiator_wager_token_amount = initiator_wager_token_amount;
        challenge.bump = challenge_bump;
        challenge.acceptor_wager_approved = false;
        challenge.requester = ctx.accounts.requester.to_account_info().key.clone();

        // move the tokens in the wager from the initiator's token source to the token vault
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx
                        .accounts
                        .initiator_tokens_source
                        .to_account_info(),
                    to: ctx
                        .accounts
                        .initiator_tokens_vault
                        .to_account_info(),
                    authority: ctx.accounts.initiator.to_account_info(),
                },
            ),
            initiator_wager_token_amount,
        )?;

        // solrand piece
        {
            // Transfer authority for the oracle requester to the challenge PDA
            let cpi_accounts = solrand::cpi::accounts::TransferAuthority {
                requester: ctx.accounts.requester.to_account_info(),
                authority: ctx.accounts.initiator.to_account_info(),
                new_authority: ctx.accounts.challenge.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info()
            };

            let cpi_context = CpiContext::new(
                ctx.accounts.solrand_program.clone(),
                cpi_accounts
            );

            solrand::cpi::transfer_authority(cpi_context)?;
        }

        Ok(())
    }

    pub fn accept_challenge(
        ctx: Context<AcceptChallenge>,
        _acceptor_tokens_vault_bump: u8,
        acceptor_wager_token_amount: u64,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        challenge.acceptor = *ctx.accounts.acceptor.to_account_info().key;
        challenge.acceptor_tokens_mint = ctx.accounts.acceptor_tokens_mint.to_account_info().key.clone();
        challenge.acceptor_tokens_vault = ctx.accounts.acceptor_tokens_vault.to_account_info().key.clone();
        challenge.acceptor_wager_token_amount = acceptor_wager_token_amount;

        // move the tokens in the wager from the acceptor's token source to the token vault
        anchor_spl::token::transfer(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx
                        .accounts
                        .acceptor_tokens_source
                        .to_account_info(),
                    to: ctx
                        .accounts
                        .acceptor_tokens_vault
                        .to_account_info(),
                    authority: ctx.accounts.acceptor.to_account_info(),
                },
            ),
            acceptor_wager_token_amount,
        )?;

        Ok(())
    }

    pub fn approve_acceptor_wager(
        ctx: Context<ApproveAcceptorWager>,
    ) -> Result<()> {
        let challenge = &mut ctx.accounts.challenge;
        challenge.acceptor_wager_approved = true;
        // solrand section
        {
            // Use challenge PDA to Request Random From Oracle
            let cpi_accounts = solrand::cpi::accounts::RequestRandom {
                requester: ctx.accounts.requester.to_account_info(),
                authority: challenge.to_account_info(),
                oracle: ctx.accounts.oracle.to_account_info(),
                system_program: ctx.accounts.system_program.to_account_info()
            };

            let challenge_bump = challenge.bump;
            let challenge_seeds = &[
                b"challenge".as_ref(),
                ctx.accounts.challenge.initiator.as_ref(),
                ctx.accounts.challenge.requester.as_ref(),
                &[challenge_bump]
            ];

            let signer = &[
                &challenge_seeds[..]
            ];

            let cpi_context = CpiContext::new_with_signer(
                ctx.accounts.solrand_program.clone(),
                cpi_accounts,
                signer
            );

            solrand::cpi::request_random(cpi_context)?;
        }
        Ok(())
    }

    pub fn decline_acceptor_wager(
        ctx: Context<DeclineAcceptorWager>,
    ) -> Result<()> {
        {
            let challenge = &ctx.accounts.challenge;

            let challenge_seeds = &[
                    b"challenge".as_ref(),
                    ctx.accounts.challenge.initiator.as_ref(),
                    ctx.accounts.challenge.requester.as_ref(),
                    &[challenge.bump]
                ];

            // refund the acceptor's wagered tokens back into their account
            anchor_spl::token::transfer(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::Transfer {
                        from: ctx.accounts.acceptor_tokens_vault.to_account_info(),
                        to: ctx.accounts.acceptor_own_tokens_taker.to_account_info(),
                        authority: ctx
                            .accounts
                            .challenge
                            .to_account_info(),
                    },
                    &[&challenge_seeds[..]],
                ),
                ctx.accounts.challenge.acceptor_wager_token_amount,
            )?;

            // close escrow account
            anchor_spl::token::close_account(
                CpiContext::new_with_signer(
                    ctx.accounts.token_program.to_account_info(),
                    anchor_spl::token::CloseAccount {
                        account: ctx
                            .accounts
                            .acceptor_tokens_vault
                            .to_account_info(),
                        destination: ctx.accounts.acceptor.to_account_info(),
                        authority: ctx
                            .accounts
                            .challenge
                            .to_account_info(),
                    },
                    &[&challenge_seeds[..]],
            ))?;
        }

        {
            let challenge = &mut ctx.accounts.challenge;
            // reset all acceptor fields on challenge PDA
            challenge.acceptor_wager_approved = false;
            challenge.acceptor = Pubkey::default();
            challenge.acceptor_tokens_mint = Pubkey::default();
            challenge.acceptor_tokens_vault = Pubkey::default();
            challenge.acceptor_wager_token_amount = 0;
        }

        Ok(())
    }

    pub fn reveal_winner(
        ctx: Context<RevealWinner>,
    ) -> Result<()> {
        // Determine winner from random number
        let requester = &mut ctx.accounts.requester;
        let mut initiator_tokens_taker = ctx.accounts.acceptor_other_tokens_taker.to_account_info();
        let mut acceptor_tokens_taker = ctx.accounts.acceptor_own_tokens_taker.to_account_info();

        // Take first byte (u8) and check if even
        // If the random number is even, then the initiator wins & the acceptor loses.
        if requester.random[0] % 2 == 0 {
            initiator_tokens_taker = ctx.accounts.initiator_own_tokens_taker.to_account_info();
            acceptor_tokens_taker = ctx.accounts.initiator_other_tokens_taker.to_account_info();
        }

        // transfer loser's tokens vault to winner's other tokens taker account
        // ie the winner is receiving the loser's bet
        let challenge_seeds = &[
            b"challenge",
            ctx.accounts.challenge.initiator.as_ref(),
            ctx.accounts.challenge.requester.as_ref(),
            &[ctx.accounts.challenge.bump]
        ];
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.initiator_tokens_vault.to_account_info(),
                    to: initiator_tokens_taker,
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
            ),
            ctx.accounts.challenge.initiator_wager_token_amount,
        )?;

        // transfer winner's tokens vault to winner's own tokens taker account
        // ie the winner is recouping their own bet
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.acceptor_tokens_vault.to_account_info(),
                    to: acceptor_tokens_taker,
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
            ),
            ctx.accounts.challenge.acceptor_wager_token_amount,
        )?;

        // Close the escrow accounts
        anchor_spl::token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::CloseAccount {
                    account: ctx
                        .accounts
                        .initiator_tokens_vault
                        .to_account_info(),
                    destination: ctx.accounts.initiator.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
        ))?;

        anchor_spl::token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::CloseAccount {
                    account: ctx
                        .accounts
                        .acceptor_tokens_vault
                        .to_account_info(),
                    destination: ctx.accounts.acceptor.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
        ))?;

        Ok(())
    }

    pub fn cancel_before_acceptor<'info>(
        ctx: Context<CancelBeforeAcceptor>
    ) -> Result<()> {
        // If the challenge has been accepted, then the accounts of the acceptor must be passed in,
        // so cancel_after_acceptor must be used.
        require!(ctx.accounts.challenge.acceptor == Pubkey::default(), ErrorCode::IncorrectRemainingAccounts);
        let challenge_seeds = &[
            b"challenge",
            ctx.accounts.challenge.initiator.as_ref(),
            ctx.accounts.challenge.requester.as_ref(),
            &[ctx.accounts.challenge.bump]
        ];

        // return escrowed initiator tokens back to source
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.initiator_tokens_vault.to_account_info(),
                    to: ctx.accounts.initiator_own_tokens_taker.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
            ),
            ctx.accounts.challenge.initiator_wager_token_amount,
        )?;

        // Close the escrow account
        anchor_spl::token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::CloseAccount {
                    account: ctx
                        .accounts
                        .initiator_tokens_vault
                        .to_account_info(),
                    destination: ctx.accounts.initiator.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
        ))?;

        Ok(())
    }

    pub fn cancel_after_acceptor<'info>(
        ctx: Context<CancelAfterAcceptor>
    ) -> Result<()> {
        let challenge_seeds = &[
            b"challenge",
            ctx.accounts.challenge.initiator.as_ref(),
            ctx.accounts.challenge.requester.as_ref(),
            &[ctx.accounts.challenge.bump]
        ];

        // return escrowed initiator tokens back to source
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.initiator_tokens_vault.to_account_info(),
                    to: ctx.accounts.initiator_own_tokens_taker.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
            ),
            ctx.accounts.challenge.initiator_wager_token_amount,
        )?;

        // Close the escrow account
        anchor_spl::token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::CloseAccount {
                    account: ctx
                        .accounts
                        .initiator_tokens_vault
                        .to_account_info(),
                    destination: ctx.accounts.initiator.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
        ))?;
        
        // return escrowed acceptor tokens back to source
        anchor_spl::token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::Transfer {
                    from: ctx.accounts.acceptor_tokens_vault.to_account_info(),
                    to: ctx.accounts.acceptor_own_tokens_taker.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
            ),
            ctx.accounts.challenge.acceptor_wager_token_amount,
        )?;

        // Close the escrow account
        anchor_spl::token::close_account(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                anchor_spl::token::CloseAccount {
                    account: ctx
                        .accounts
                        .acceptor_tokens_vault
                        .to_account_info(),
                    destination: ctx.accounts.acceptor.to_account_info(),
                    authority: ctx
                        .accounts
                        .challenge
                        .to_account_info(),
                },
                &[&challenge_seeds[..]],
        ))?;

        Ok(())
    }
}

#[derive(Accounts)]
pub struct CancelBeforeAcceptor<'info> {
    #[account(
        mut,
        constraint = initiator.key() == challenge.initiator @ ErrorCode::Unauthorized
    )]
    pub initiator: Signer<'info>,
    #[account(mut, close = initiator)]
    pub challenge: Account<'info, Challenge>,
    #[account(
        mut,
        constraint = initiator_tokens_vault.key() == challenge.initiator_tokens_vault,
    )]
    initiator_tokens_vault: Box<Account<'info, TokenAccount>>,
    // account to receive initiator's own bet back into
    #[account(
        mut,
        constraint = initiator_own_tokens_taker.owner == challenge.initiator,
    )]
    initiator_own_tokens_taker: Box<Account<'info, TokenAccount>>,

    // application level accounts
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct CancelAfterAcceptor<'info> {
    #[account(
        mut,
        constraint = initiator.key() == challenge.initiator @ ErrorCode::Unauthorized
    )]
    pub initiator: Signer<'info>,
    #[account(mut, close = initiator)]
    pub challenge: Account<'info, Challenge>,
    #[account(
        mut,
        constraint = initiator_tokens_vault.key() == challenge.initiator_tokens_vault,
    )]
    initiator_tokens_vault: Box<Account<'info, TokenAccount>>,
    // account to receive initiator's own bet back into
    #[account(
        mut,
        constraint = initiator_own_tokens_taker.owner == challenge.initiator,
    )]
    initiator_own_tokens_taker: Box<Account<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = challenge.acceptor == acceptor.key()
    )]
    /// CHECK: constraint makes sure that the acceptor of the challenge is the account passed in here
    acceptor: AccountInfo<'info>,
    #[account(
        mut,
        constraint = acceptor_tokens_vault.key() == challenge.acceptor_tokens_vault,
    )]
    acceptor_tokens_vault: Box<Account<'info, TokenAccount>>,
    // account to receive initiator's own bet back into
    #[account(
        mut,
        constraint = acceptor_own_tokens_taker.owner == challenge.acceptor,
    )]
    acceptor_own_tokens_taker: Box<Account<'info, TokenAccount>>,

    // application level accounts
    pub token_program: Program<'info, Token>,
}

// PDA that holds the state of the challenge
#[account]
pub struct Challenge {
    pub initiator: Pubkey,
    pub initiator_tokens_mint: Pubkey,
    pub initiator_tokens_vault: Pubkey,
    pub initiator_wager_token_amount: u64,
    pub acceptor: Pubkey,
    pub acceptor_tokens_mint: Pubkey,
    pub acceptor_tokens_vault: Pubkey,
    pub acceptor_wager_token_amount: u64,
    pub acceptor_wager_approved: bool,
    pub requester: Pubkey,
    pub bump: u8,
}

// arguments list for new_challenge
#[derive(Accounts)]
#[instruction(initiator_wager_token_amount: u64)]
pub struct NewChallenge<'info> {
    #[account(mut)]
    pub initiator: Signer<'info>,

    // PDAs
    #[account(
        init,
        payer = initiator,
        space = 8 + size_of::<Challenge>(),
        seeds = [
            b"challenge",
            initiator.to_account_info().key.as_ref(),
            requester.key().as_ref(),
            ],
        bump
    )]
    pub challenge: Account<'info, Challenge>,

    // account to transfer initiator's wager tokens to
    #[account(
        init,
        payer = initiator,
        seeds = [
            b"initiator_tokens_vault".as_ref(),
            initiator.to_account_info().key.as_ref(),
            ],
        bump,
        token::mint=initiator_tokens_mint,
        token::authority=challenge,
    )]
    initiator_tokens_vault: Account<'info, TokenAccount>,

    // Mint of the wager that the person creating the challenge is putting up
    pub initiator_tokens_mint: Account<'info, Mint>,

    // Where to withdraw the intiator's wager tokens from
    #[account(
        mut,
        constraint = initiator_tokens_source.mint == initiator_tokens_mint.key(),
        constraint = initiator_tokens_source.amount > 0,
        constraint = initiator_tokens_source.owner == initiator.key()
    )]
    pub initiator_tokens_source: Account<'info, TokenAccount>,

    /// CHECK: The Requester is the account provided to Solrand, which should have been initialized by Solrand already
    #[account(mut)]
    pub requester: AccountInfo<'info>,

    /// CHECK: Checks done in solrand program
    pub solrand_program: AccountInfo<'info>,
    
    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
#[instruction(acceptor_wager_token_amount: u64)]
pub struct AcceptChallenge<'info> {
    #[account(
        mut,
    )]
    pub acceptor: Signer<'info>,
    #[account(
        mut,
        // ensure the challenge has not already been accepted
        constraint = challenge.acceptor == Pubkey::default()
    )]
    pub challenge: Account<'info, Challenge>,

    // account to transfer acceptor's wager tokens to
    #[account(
        init,
        payer = acceptor,
        seeds = [b"acceptor_tokens_vault".as_ref(), acceptor.to_account_info().key.as_ref()],
        bump,
        token::mint=acceptor_tokens_mint,
        token::authority=challenge,
    )]
    acceptor_tokens_vault: Account<'info, TokenAccount>,

    // Mint of the wager that the person accepting the challenge is putting up
    pub acceptor_tokens_mint: Account<'info, Mint>,

    // Where to withdraw the acceptor's wager tokens from
    #[account(
        mut,
        constraint = acceptor_tokens_source.mint == acceptor_tokens_mint.key(),
        // tried making this constraint > acceptor_token_wager_amount, but anchor complained about that
        constraint = acceptor_tokens_source.amount > 0,
        constraint = acceptor_tokens_source.owner == acceptor.key()
    )]
    pub acceptor_tokens_source: Account<'info, TokenAccount>,
    
    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct DeclineAcceptorWager<'info> {
    #[account(
        mut,
        constraint =
            caller.key() == challenge.initiator ||
            caller.key() == challenge.acceptor
            @ ErrorCode::Unauthorized
    )]
    pub caller: Signer<'info>,
    #[account(
        mut,
        // ensure the challenge has been accepted
        constraint = challenge.acceptor != Pubkey::default(),
        constraint = !challenge.acceptor_wager_approved @ ErrorCode::AcceptorWagerAlreadyApproved
    )]
    pub challenge: Account<'info, Challenge>,
    #[account(
        mut,
        constraint = acceptor.key() == challenge.acceptor.key()
    )]
    /// CHECK: checked with the constraint to make sure this acceptor account is the one attached to the challenge
    pub acceptor: AccountInfo<'info>,

    #[account(
        mut,
        constraint = acceptor_tokens_vault.mint == challenge.acceptor_tokens_mint,
    )]
    acceptor_tokens_vault: Box<Account<'info, TokenAccount>>,
    // account to receive acceptor's own bet back into
    #[account(
        mut,
        constraint = acceptor_own_tokens_taker.mint == challenge.acceptor_tokens_mint,
        constraint = acceptor_own_tokens_taker.owner == challenge.acceptor.key()
    )]
    acceptor_own_tokens_taker: Box<Account<'info, TokenAccount>>,

    // application level accounts
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct ApproveAcceptorWager<'info> {
    #[account(
        mut,
        // only the original initiator of the challenge may approve the wager
        constraint = challenge.initiator == initiator.key() @ ErrorCode::Unauthorized,
        constraint = !challenge.acceptor_wager_approved @ ErrorCode::AcceptorWagerAlreadyApproved
    )]
    pub initiator: Signer<'info>,
    #[account(
        mut,
        // ensure the challenge has been accepted
        constraint = challenge.acceptor != Pubkey::default()
    )]
    pub challenge: Account<'info, Challenge>,

    #[account(
        mut,
        constraint = requester.key() == challenge.requester.key()
    )]
    /// CHECK: The constraint checks that this requester is the same one that the challenge was initialized with
    pub requester: AccountInfo<'info>,
     #[account(mut)]
     /// CHECK: Checks done in Solrand program
     pub oracle: AccountInfo<'info>,
     /// CHECK: Checks done in program
     pub solrand_program: AccountInfo<'info>,
    
    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct RevealWinner<'info> {
    #[account(
        mut,
        close = initiator,
        constraint = challenge.acceptor_wager_approved @ ErrorCode::NotApproved,
    )]
    pub challenge: Account<'info, Challenge>,
    
    /// CHECK: Constraint ensures that the initiator is the same one who kicked off the challenge
    #[account(
        mut,
        constraint = initiator.key() == challenge.initiator.key()
    )]
    pub initiator: AccountInfo<'info>,
    /// CHECK: Constraint ensures that the acceptor is the same one who accepted the challenge
    #[account(
        mut,
        constraint = acceptor.key() == challenge.acceptor.key()
    )]
    pub acceptor: AccountInfo<'info>,

    #[account(
        mut,
        constraint = initiator_tokens_vault.key() == challenge.initiator_tokens_vault,
    )]
    initiator_tokens_vault: Box<Account<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = acceptor_tokens_vault.key() == challenge.acceptor_tokens_vault,
    )]
    acceptor_tokens_vault: Box<Account<'info, TokenAccount>>,

    // accounts to receive the bet back into
    // account to receive acceptor's own bet back into
    #[account(
        mut,
        constraint = acceptor_own_tokens_taker.owner == acceptor.key(),
    )]
    acceptor_own_tokens_taker: Box<Account<'info, TokenAccount>>,
    // account to receive initiator's bet into
    #[account(
        mut,
        constraint = acceptor_other_tokens_taker.mint == challenge.initiator_tokens_mint,
        constraint = acceptor_other_tokens_taker.owner == acceptor.key(),
    )]
    acceptor_other_tokens_taker: Box<Account<'info, TokenAccount>>,
    // account to receive initiator's own bet back into
    #[account(
        mut,
        constraint = initiator_own_tokens_taker.mint == challenge.initiator_tokens_mint,
        constraint = initiator_own_tokens_taker.owner == initiator.key(),
    )]
    initiator_own_tokens_taker: Box<Account<'info, TokenAccount>>,
    // account to receive acceptor's bet into
    #[account(
        mut,
        constraint = initiator_other_tokens_taker.mint == challenge.acceptor_tokens_mint,
        constraint = initiator_other_tokens_taker.owner == initiator.key(),
    )]
    initiator_other_tokens_taker: Box<Account<'info, TokenAccount>>,

    /// CHECK: Checks done in program
    #[account(
        mut,
        constraint = challenge.requester.key() == requester.key()
    )]
    pub requester: Account<'info, solrand::Requester>,
    /// CHECK: Checks done in program
    pub solrand_program: AccountInfo<'info>,

    // Application level accounts
    pub system_program: Program<'info, System>,
    pub token_program: Program<'info, Token>,
}

#[error_code]
pub enum ErrorCode {
    #[msg("You are not authorized to complete this transaction")]
    Unauthorized,
    #[msg("The challenge initiator has not approved the acceptor's wager.")]
    NotApproved,
    #[msg("The acceptor's wager has already been approved.")]
    AcceptorWagerAlreadyApproved,
    #[msg("Incorrect remaining accounts passed in.")]
    IncorrectRemainingAccounts
}