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
        wrap_bump: u8,
    ) -> ProgramResult {
        msg!("Authority key {}", ctx.accounts.authority.key());
        msg!("Coin key {}", ctx.accounts.coin.key());
        // msg!("Req key {}", ctx.accounts.requester.key());

        let authority_key = ctx.accounts.authority.key();
        { 
            let coin = &mut ctx.accounts.coin.load_init()?;
            // let req = &mut ctx.accounts.requester.load_init()?;
            let clock: Clock = Clock::get().unwrap();
            
            coin.authority = authority_key;
            coin.is_flipping = false;
            coin.created_at = clock.unix_timestamp;
            coin.bump = coin_bump;
        }

        // let ix = anchor_lang::solana_program::system_instruction(
        //     &authority,
        //     &ctx.accounts.oracle.key(),
        //     ORACLE_FEE,
        // );

        // anchor_lang::solana_program::program::invoke(
        //     &ix,
        //     &[
        //         requester_account_info,
        //         ctx.accounts.authority.to_account_info(),
        //         ctx.accounts.oracle.clone(),
        //         ctx.accounts.system_program.to_account_info()
        //     ]
        // )?;

        // let (_coin_authority, _coin_authority_bump) =
        //     Pubkey::find_program_address(&[CROSS_PILE_PDA_SEED], &ctx.accounts.sol_rng_program.key());



        // let cpi_accounts = sol_rng::cpi::accounts::Initialize {
        //     requester: ctx.accounts.requester.to_account_info(),
        //     authority: ctx.accounts.oracle_wrapper.to_account_info(),
        //     oracle: ctx.accounts.oracle.clone(),
        //     rent: ctx.accounts.rent.to_account_info(),
        //     system_program: ctx.accounts.system_program.to_account_info()
        // };

        let cpi_accounts = sol_rng::cpi::accounts::TransferAuthority {
            requester: ctx.accounts.requester.to_account_info(),
            authority: ctx.accounts.authority.to_account_info(),
            new_authority: ctx.accounts.coin.to_account_info(),
            system_program: ctx.accounts.system_program.to_account_info()
        };


        // let ix = sol_rng::instruction::state::Initialize {
        //     requester: ctx.accounts.requester.to_account_info(),
        //     authority: ctx.accounts.coin.to_account_info(),
        //     oracle: ctx.accounts.oracle.clone(),
        //     rent: ctx.accounts.rent.to_account_info(),
        //     system_program: ctx.accounts.system_program.to_account_info()
        // };
        // let data = anchor_lang::InstructionData::data(&ix);

        // sol_rng::program::invoke();

        // sol_rng::program::


        // let seeds = &[
        //     b"wrap-seed".as_ref(),
        //     authority_key.as_ref(),
        //     &[wrap_bump]
        // ];

        // let req_seeds = &[
        //     b"r-seed".as_ref(),
        //     authority_key.as_ref(),
        //     &[req_bump]
        // ];

        // let signer = &[
        //     &seeds[..],
        //     &req_seeds[..]
        // ];

        let cpi_context = CpiContext::new(
            ctx.accounts.sol_rng_program.clone(),
            cpi_accounts
        );

        // let cpi_context = CpiContext::new_with_signer(
        //     ctx.accounts.sol_rng_program.clone(),
        //     cpi_accounts,
        //     signer
        // );

        // sol_rng::cpi::initialize(cpi_context, req_bump)?;
        sol_rng::cpi::transfer_authority(cpi_context)?;

        Ok(())
    }

    // pub fn request_flip(
    //     ctx: Context<RequestFlip>,
    // ) -> ProgramResult {
    //     Ok(())
    // }

    pub fn approve_flip(
        ctx: Context<ApproveFlip>
    ) -> ProgramResult {
        // let loader: Loader<Coin> = Loader::try_from_unchecked(ctx.program_id, &ctx.remaining_accounts[0]).unwrap();
        // let coin_info = loader.to_account_info();
        
        // **ctx.accounts.authority.try_borrow_mut_lamports()? -= 100000;
        // **ctx.accounts.oracle_wrapper.try_borrow_mut_lamports()? += 100000;
        msg!("1");

        // **ctx.accounts.authority.try_borrow_mut_lamports()? = ctx.accounts.authority
        //     .lamports()
        //     .checked_sub(100000)
        //     .ok_or(ProgramError::InvalidArgument)?;
        let ix = anchor_lang::solana_program::system_instruction::transfer(
            &ctx.accounts.authority.key(),
            &ctx.accounts.oracle_wrapper.key(),
            100000,
        );

        anchor_lang::solana_program::program::invoke(
            &ix,
            &[
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.oracle_wrapper.to_account_info(),
                ctx.accounts.system_program.to_account_info(),
            ],
        )?;

        msg!("2");
        
        // **ctx.accounts.oracle_wrapper.try_borrow_mut_lamports()? = ctx.accounts.oracle_wrapper
        //     .lamports()
        //     .checked_add(100000)
        //     .ok_or(ProgramError::InvalidArgument)?;

        // let mut coin = loader.load_mut()?;

        // coin.is_flipping = true;
        Ok(())
    }

    // pub type Result<T, E = Error> = Result<T, ProgramError>;

    pub fn flip_coin(
        ctx: Context<FlipCoin>,
        flip_bump: u8,
        amount: u64
    ) -> ProgramResult {
        msg!("Authority key {}", ctx.remaining_accounts.len());
        // let coin = &mut ctx.accounts.coin.load_mut()?;
        // let loader: Loader<Coin> = match Loader::try_from_unchecked(ctx.program_id, &ctx.remaining_accounts[0]).err().unwrap() {
        //     Ok(loader) => {
        //         return loader;
        //     }
        //     Err(e) => {
        //         msg!(e);
        //     }
        // };
        // let loader: AccountLoader<Coin> = AccountLoader::try_from_unchecked(ctx.program_id, &ctx.accounts.coin).unwrap();
        let loader: Loader<Coin> = Loader::try_from_unchecked(ctx.program_id, &ctx.remaining_accounts[0]).unwrap();
        // let thing: ProgramResult<AccountLoader<Coin>>= AccountLoader::try_from_unchecked(ctx.program_id, &ctx.remaining_accounts[0]);
        msg!("Remaining accounts {}", ctx.remaining_accounts.len());
        let mut coin = loader.load_mut()?;

        // let (_coin_authority, _coin_authority_bump) =
        //     Pubkey::find_program_address(&[CROSS_PILE_PDA_SEED], &ctx.accounts.sol_rng_program.key());
        // let coin_meta = AccountMeta::new(_coin_authority, false);

        // let ix = anchor_lang::solana_program::system_instruction::transfer(
        //     &ctx.accounts.p1.key(),
        //     &ctx.accounts.oracle.key(),
        //     100000,
        // );

        // anchor_lang::solana_program::program::invoke(
        //     &ix,
        //     &[
        //         coin_meta,
        //         ctx.accounts.authority.to_account_info(),
        //         ctx.accounts.oracle.clone(),
        //         ctx.accounts.system_program.to_account_info()
        //     ]
        // )?;
        

        // let flip = &mut ctx.accounts.flip;
        // flip.p_one = ctx.accounts.p_one.key();
        // flip.p_two = ctx.accounts.p_two.key();
        // flip.coin = ctx.accounts.coin.key();
        // flip.amount = amount;
        // flip.bump = flip_bump;

        // let coin = &mut ctx.accounts.coin.load_mut()?;
        // coin.flip = flip.key();
        // coin.is_flipping = true;

        // **ctx.accounts.p_one.try_borrow_mut_lamports()? -= amount;
        // **ctx.accounts.p_two.try_borrow_mut_lamports()? -= amount;
        // **flip.to_account_info().try_borrow_mut_lamports()? += 2 * amount;

        // let cpi_accounts = sol_rng::cpi::accounts::RequestRandom {
        //     requester: ctx.accounts.requester.to_account_info(),
        //     authority: ctx.accounts.p_one.to_account_info(),
        //     oracle: ctx.accounts.oracle.clone(),
        //     system_program: ctx.accounts.system_program.to_account_info()
        // };

        // let cpi_context = CpiContext::new(ctx.accounts.sol_rng_program.clone(), cpi_accounts);

        // sol_rng::cpi::request_random(cpi_context)?;

        Ok(())
    }

    pub fn show_coin(
        ctx: Context<ShowCoin>
    ) -> ProgramResult {

        let coin_loader: Loader<Coin> = Loader::try_from_unchecked(ctx.program_id, &ctx.remaining_accounts[0]).unwrap();
        let coin_key = coin_loader.key();
        let coin = coin_loader.load_mut()?;

        let flip = &mut ctx.accounts.flip;

        if coin.flip != flip.key() {
            return Err(ErrorCode::Unauthorized.into());
        }

        if flip.coin != coin_key {
            return Err(ErrorCode::Unauthorized.into());
        }
        
        let checker_key = ctx.accounts.checker.key();
        if (flip.p_one != checker_key) || (flip.p_two != checker_key) {
            return Err(ErrorCode::Unauthorized.into());
        }

        let other_key = ctx.accounts.other.key();
        if (flip.p_one != other_key) || (flip.p_two != other_key) {
            return Err(ErrorCode::Unauthorized.into());
        }

        **flip.to_account_info().try_borrow_mut_lamports()? -= flip.amount;
        **ctx.accounts.checker.try_borrow_mut_lamports()? += flip.amount;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(coin_bump: u8, req_bump: u8, wrap_bump: u8)]
pub struct CreateCoin<'info> {
    #[account(
        init, 
        seeds = [b"coin-seed".as_ref(), authority.key().as_ref()],
        bump = coin_bump,
        payer = authority,
        space = 8 + size_of::<Coin>()
    )]
    pub coin: AccountLoader<'info, Coin>,
    #[account(
        init, 
        seeds = [b"wrap-seed".as_ref(), authority.key().as_ref()],
        bump = wrap_bump,
        payer = authority,
        space = 8 + size_of::<OracleWrapper>()
    )]
    pub oracle_wrapper: Account<'info, OracleWrapper>,
    #[account(mut)]
    pub requester: AccountInfo<'info>,
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    pub oracle: AccountInfo<'info>,
    pub sol_rng_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct ApproveFlip<'info> {
    #[account(mut, signer)]
    pub authority: AccountInfo<'info>,
    #[account(mut)]
    pub oracle_wrapper: AccountInfo<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(flip_bump: u8)]
pub struct FlipCoin<'info> {
    #[account(mut, signer)]
    pub p1: AccountInfo<'info>,
    #[account(mut, signer)]
    pub p2: AccountInfo<'info>,
    pub oracle: AccountInfo<'info>,
    pub requester: AccountInfo<'info>,
    pub sol_rng_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

// #[derive(Accounts)]
// #[instruction(flip_bump: u8)]
// pub struct FlipCoin<'info> {
//     #[account(
//         init, 
//         seeds = [b"flip-seed".as_ref(), p_one.key().as_ref(), p_two.key().as_ref()],
//         bump = flip_bump,
//         payer = p_one,
//         space = 8 + size_of::<Flip>()
//     )]
//     pub flip: Account<'info, Flip>,
//     pub coin: AccountLoader<'info, Coin>,
//     #[account(mut, signer)]
//     pub p_one: AccountInfo<'info>,
//     #[account(mut, signer)]
//     pub p_two: AccountInfo<'info>,
//     pub oracle: AccountInfo<'info>,
//     pub requester: AccountInfo<'info>,
//     pub sol_rng_program: AccountInfo<'info>,
//     pub rent: Sysvar<'info, Rent>,
//     pub system_program: Program<'info, System>,
// }

#[derive(Accounts)]
pub struct ShowCoin<'info> {
    #[account(mut, signer)]
    pub checker: AccountInfo<'info>,
    #[account(mut)]
    pub other: AccountInfo<'info>,
    pub flip: Account<'info, Flip>,
}

#[account(zero_copy)]
pub struct Coin {
    pub authority: Pubkey,
    pub flip: Pubkey,
    pub is_flipping: bool,
    pub is_cross: bool,
    pub created_at: i64,
    pub bump: u8,
}

#[account]
pub struct OracleWrapper {
    pub bump: u8,
}

#[account]
pub struct Flip {
    pub p_one: Pubkey,
    pub p_two: Pubkey,
    pub coin: Pubkey,
    pub amount: u64,
    pub created_at: i64,
    pub flipped_at: i64,
    pub bump: u8,
}

// impl<'info> CreateCoin<'info> {
//     fn into_initialize_context(&self) -> CpiContext<'_, '_, '_, 'info, sol_rng::Initialize<'info>> {
//         let cpi_accounts = sol_rng::Initialize {
//             requester: self.requester.clone(),
//             authority: self.authority.clone(),
//             oracle: self.oracle.clone(),
//             rent: self.rent.clone(),
//             system_program: self.system_program.clone()
//         };
//         CpiContext::new(self.sol_rng_program.clone(), cpi_accounts)
//     }
// }

#[error]
pub enum ErrorCode {
    #[msg("You are not authorized to complete this transaction")]
    Unauthorized,
    #[msg("You have already completed this transaction")]
    AlreadyCompleted,
    #[msg("A request is already in progress. Only one request may be made at a time")]
    InflightRequest,
    #[msg("The Oracle you make the request with must be the same as initialization")]
    WrongOracle,
}