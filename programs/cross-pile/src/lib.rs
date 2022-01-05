use anchor_lang::prelude::*;
use std::mem::size_of;

declare_id!("6urrPCjcrQ1xaxbAJGMTtvZfA9wbMqQbEArKnVUHhYTs");

/**
 * The Cross And Pile Program (P2P Heads or Tails)
 * 
 * Accounts:
 * requester: PDA owned by the SOL_RNG Program used to store data
 * oracle: The Oracle's account. Refer to Published Addreses.
 * oracle_vault: PDA owned by the SOL_RNG Program for paying Oracle
 * sol_rng_program: The Program Address for the SOL_RNG Program
 * coin: PDA owned by Cross & Pile used for storing data
 * vault: PDA owned by Cross & Pile used for escrowing sol and paying winner
 * initiator: The account creating the coin
 * acceptor: The account accepting the offer to flip
 * rent: The Rent Program
 * system_program: The System Program
 * 
 * Considerations:
 * 1. The CPI call to RequestRandom should happen only after or all funds are locked into the contract.
 * 2. Once a CPI call to RequestRandom is made, no funds should be allowed to be withdrawn.
 * 
 */


#[program]
pub mod cross_pile {
    use super::*;

    pub fn create_coin(
        ctx: Context<CreateCoin>,
        coin_bump: u8,
        req_bump: u8,
        vault_bump: u8,
        amount: u64,
    ) -> ProgramResult {
        let authority_key = ctx.accounts.initiator.key();
        // Set data for PDAs
        { 
            let coin = &mut ctx.accounts.coin.load_init()?;
            let clock: Clock = Clock::get().unwrap();
            
            coin.initiator = authority_key;
            coin.acceptor = ctx.accounts.acceptor.key();
            coin.is_flipping = false;
            coin.created_at = clock.unix_timestamp;
            coin.bump = coin_bump;

            let vault = &mut ctx.accounts.vault;
            vault.amount = amount;
            vault.bump = vault_bump;
        }

        // Transfer authority for the oracle requester to the Coin PDA
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

        // Transfer sol from Initiator to Vault PDA
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.initiator.key(),
            &ctx.accounts.vault.key(),
            amount,
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
        // Transfer sol from Acceptor to Vault PDA
        {
            let ix = anchor_lang::solana_program::system_instruction::transfer(
                &ctx.accounts.authority.key(),
                &ctx.accounts.vault.key(),
                ctx.accounts.vault.amount,
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

        // Use Coin PDA to Request Random From Oracle
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
        // Determine winner from random number & transfer prize
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
    pub vault: Account<'info, Vault>,
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

// Used for signing CPI to oracle
#[account(zero_copy)]
pub struct Coin {
    pub initiator: Pubkey,
    pub acceptor: Pubkey,
    pub is_flipping: bool,
    pub is_cross: bool,
    pub created_at: i64,
    pub bump: u8,
}

// Used for holding the sol balance and transfering to winner
#[account]
pub struct Vault {
    pub amount: u64,
    pub bump: u8,
}