use anchor_lang::prelude::*;
use std::mem::size_of;

declare_id!("6urrPCjcrQ1xaxbAJGMTtvZfA9wbMqQbEArKnVUHhYTs");

#[program]
pub mod cross_pile {
    use super::*;

    const CROSS_PILE_PDA_SEED: &[u8] = b"cross_pile";

    pub fn create_coin(
        ctx: Context<CreateCoin>,
        coin_bump: u8,
        req_bump: u8,
        vault_bump: u8,
    ) -> ProgramResult {
        let authority_key = ctx.accounts.initiator.key();
        { 
            let coin = &mut ctx.accounts.coin.load_init()?;
            let clock: Clock = Clock::get().unwrap();
            
            coin.initiator = authority_key;
            coin.acceptor = ctx.accounts.acceptor.key();
            coin.is_flipping = false;
            coin.created_at = clock.unix_timestamp;
            coin.bump = coin_bump;

            let vault = &mut ctx.accounts.vault;
            vault.amount = 100000;
            vault.bump = vault_bump;
        }

        let cpi_accounts = sol_rng::cpi::accounts::TransferAuthority {
            requester: ctx.accounts.requester.to_account_info(),
            authority: ctx.accounts.initiator.to_account_info(),
            new_authority: ctx.accounts.coin.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info()
        };

        let cpi_context = CpiContext::new(
            ctx.accounts.sol_rng_program.clone(),
            cpi_accounts
        );

        sol_rng::cpi::transfer_authority(cpi_context)?;

        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.initiator.key(),
            &ctx.accounts.vault.key(),
            100000,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.initiator.to_account_info(),
                ctx.accounts.vault.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        Ok(())
    }


    pub fn approve_flip<'key, 'accounts, 'remaining, 'info>(
        ctx: Context<'key, 'accounts, 'remaining, 'info, ApproveFlip<'info>>
    ) -> ProgramResult {
        {
            let ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.authority.key(),
                &ctx.accounts.vault.key(),
                100000,
            );

            anchor_lang::solana_program::program::invoke(
                &ix,
                &[
                    ctx.accounts.authority.to_account_info(),
                    ctx.accounts.vault.to_account_info(),
                    ctx.accounts.system_program.to_account_info(),
                ],
            )?;
        }

        let coin_acc = &ctx.remaining_accounts[0];

        let cpi_accounts = sol_rng::cpi::accounts::RequestRandom {
            requester: ctx.accounts.requester.to_account_info(),
            vault: ctx.accounts.oracle_vault.clone(),
            authority: coin_acc.to_account_info(),
            oracle: ctx.accounts.oracle.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info()
        };

        let (_coin_authority, coin_bump) =
            Pubkey::find_program_address(&[b"coin-seed".as_ref(), ctx.accounts.initiator.key.as_ref()], &ctx.program_id);

        let coin_seeds = &[
            b"coin-seed".as_ref(),
            ctx.accounts.initiator.key.as_ref(),
            &[coin_bump]
        ];

        let signer = &[
            &coin_seeds[..]
        ];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.sol_rng_program.clone(),
            cpi_accounts,
            signer
        );

        sol_rng::cpi::request_random(cpi_context)?;

        Ok(())
    }

    pub fn reveal_coin<'key, 'accounts, 'remaining, 'info>(
        ctx: Context<'key, 'accounts, 'remaining, 'info, RevealCoin<'info>>
    ) -> ProgramResult {
        {
            let requester_loader: AccountLoader<sol_rng::Requester> = AccountLoader::try_from_unchecked(ctx.program_id, &ctx.accounts.requester).unwrap();
            let requester = requester_loader.load()?;
            let mut winner = ctx.accounts.initiator.clone();

            // Take first byte (u8) and check if even
            // Even random => acceptor wins & initiator loses
            if requester.random[0] % 2 == 0 {
                winner = ctx.accounts.acceptor.clone();
            }

            **winner.try_borrow_mut_lamports()? += ctx.accounts.vault.to_account_info().lamports();
            **ctx.accounts.vault.to_account_info().try_borrow_mut_lamports()? = 0;
        }

        // Transfer back ownership of requester
        let coin_acc = &ctx.remaining_accounts[0];

        let cpi_accounts = sol_rng::cpi::accounts::TransferAuthority {
            requester: ctx.accounts.requester.to_account_info(),
            authority: coin_acc.to_account_info(),
            new_authority: ctx.accounts.initiator.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info()
        };

        let (_coin_authority, coin_bump) =
            Pubkey::find_program_address(&[b"coin-seed".as_ref(), ctx.accounts.initiator.key.as_ref()], &ctx.program_id);

        let coin_seeds = &[
            b"coin-seed".as_ref(),
            ctx.accounts.initiator.key.as_ref(),
            &[coin_bump]
        ];

        let signer = &[
            &coin_seeds[..]
        ];

        let cpi_context = CpiContext::new_with_signer(
            ctx.accounts.sol_rng_program.clone(),
            cpi_accounts,
            signer
        );

        sol_rng::cpi::transfer_authority(cpi_context)?;

        return Ok(());
    }
}

#[derive(Accounts)]
#[instruction(coin_bump: u8, req_bump: u8, vault_bump: u8)]
pub struct CreateCoin<'info> {
    #[account(
        init, 
        seeds = [b"coin-seed".as_ref(), initiator.key().as_ref()],
        bump = coin_bump,
        payer = initiator,
        space = 8 + size_of::<Coin>()
    )]
    pub coin: AccountLoader<'info, Coin>,
    #[account(
        init, 
        seeds = [b"vault-seed".as_ref(), initiator.key().as_ref()],
        bump = vault_bump,
        payer = initiator,
        space = 8 + size_of::<Vault>()
    )]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub requester: AccountInfo<'info>,
    #[account(mut, signer)]
    pub initiator: AccountInfo<'info>,
    pub acceptor: AccountInfo<'info>,
    pub oracle: AccountInfo<'info>,
    pub oracle_vault: AccountInfo<'info>,
    pub sol_rng_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveFlip<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub vault: AccountInfo<'info>,
    pub initiator: AccountInfo<'info>,
    #[account(mut)]
    pub requester: AccountInfo<'info>,
    #[account(mut)]
    pub oracle: AccountInfo<'info>,
    #[account(mut)]
    pub oracle_vault: AccountInfo<'info>,
    pub sol_rng_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct RevealCoin<'info> {
    #[account(mut)]
    pub initiator: AccountInfo<'info>,
    #[account(mut)]
    pub acceptor: AccountInfo<'info>,
    #[account(mut)]
    pub vault: Account<'info, Vault>,
    #[account(mut)]
    pub requester: AccountInfo<'info>,
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub sol_rng_program: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[account(zero_copy)]
pub struct Coin {
    pub initiator: Pubkey,
    pub acceptor: Pubkey,
    pub is_flipping: bool,
    pub is_cross: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
pub struct Vault {
    pub amount: u64,
    pub bump: u8,
}