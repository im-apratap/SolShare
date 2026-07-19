use anchor_lang::prelude::*;

declare_id!("3xLnwSkCjkjoGVEhwdxu61kXqRVhAqABh6ko89jiK38p");

#[program]
pub mod sol_share {
    use super::*;

    pub fn initialize_group(ctx: Context<InitializeGroup>, group_id: String) -> Result<()> {
        let group_vault = &mut ctx.accounts.group_vault;
        group_vault.group_id = group_id;
        group_vault.authority = ctx.accounts.authority.key();
        group_vault.total_deposited = 0;
        group_vault.bump = ctx.bumps.group_vault;
        Ok(())
    }

    pub fn register_user(ctx: Context<RegisterUser>, group_id: String) -> Result<()> {
        let user_vault = &mut ctx.accounts.user_vault;
        user_vault.user = ctx.accounts.user.key();
        user_vault.group_id = group_id;
        user_vault.balance = 0;
        user_vault.bump = ctx.bumps.user_vault;
        Ok(())
    }

    pub fn deposit(ctx: Context<Deposit>, group_id: String, amount: u64) -> Result<()> {
        let cpi_context = CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.group_vault.to_account_info(),
            },
        );
        anchor_lang::system_program::transfer(cpi_context, amount)?;

        let user_vault = &mut ctx.accounts.user_vault;
        user_vault.balance = user_vault.balance.checked_add(amount).unwrap();
        
        let group_vault = &mut ctx.accounts.group_vault;
        group_vault.total_deposited = group_vault.total_deposited.checked_add(amount).unwrap();

        Ok(())
    }

    pub fn record_expense(ctx: Context<RecordExpense>, group_id: String, amount: u64) -> Result<()> {
        let user_vault = &mut ctx.accounts.user_vault;
        let creditor_vault = &mut ctx.accounts.creditor_vault;

        require!(user_vault.balance >= amount, CustomError::InsufficientBalance);

        user_vault.balance = user_vault.balance.checked_sub(amount).unwrap();
        creditor_vault.balance = creditor_vault.balance.checked_add(amount).unwrap();

        Ok(())
    }

    pub fn withdraw(ctx: Context<Withdraw>, group_id: String, amount: u64) -> Result<()> {
        let user_vault = &mut ctx.accounts.user_vault;
        let group_vault = &mut ctx.accounts.group_vault;

        require!(user_vault.balance >= amount, CustomError::InsufficientBalance);

        user_vault.balance = user_vault.balance.checked_sub(amount).unwrap();
        group_vault.total_deposited = group_vault.total_deposited.checked_sub(amount).unwrap();

        **group_vault.to_account_info().try_borrow_mut_lamports()? -= amount;
        **ctx.accounts.user.to_account_info().try_borrow_mut_lamports()? += amount;

        Ok(())
    }
}

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct InitializeGroup<'info> {
    #[account(
        init,
        payer = authority,
        space = 200,
        seeds = [b"group_vault", group_id.as_bytes()],
        bump
    )]
    pub group_vault: Account<'info, GroupVault>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct RegisterUser<'info> {
    #[account(
        init,
        payer = user,
        space = 200, 
        seeds = [b"user_vault", group_id.as_bytes(), user.key().as_ref()],
        bump
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct Deposit<'info> {
    #[account(
        mut,
        seeds = [b"group_vault", group_id.as_bytes()],
        bump = group_vault.bump
    )]
    pub group_vault: Account<'info, GroupVault>,
    #[account(
        mut,
        seeds = [b"user_vault", group_id.as_bytes(), user.key().as_ref()],
        bump = user_vault.bump
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct RecordExpense<'info> {
    #[account(
        mut,
        has_one = authority
    )]
    pub group_vault: Account<'info, GroupVault>,
    #[account(
        mut,
        seeds = [b"user_vault", group_id.as_bytes(), debtor.key().as_ref()],
        bump = user_vault.bump
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(
        mut,
        seeds = [b"user_vault", group_id.as_bytes(), creditor.key().as_ref()],
        bump = creditor_vault.bump
    )]
    pub creditor_vault: Account<'info, UserVault>,
    /// CHECK: Public key used for derivation
    pub debtor: AccountInfo<'info>,
    /// CHECK: Public key used for derivation
    pub creditor: AccountInfo<'info>,
    pub authority: Signer<'info>,
}

#[derive(Accounts)]
#[instruction(group_id: String)]
pub struct Withdraw<'info> {
    #[account(
        mut,
        seeds = [b"group_vault", group_id.as_bytes()],
        bump = group_vault.bump
    )]
    pub group_vault: Account<'info, GroupVault>,
    #[account(
        mut,
        seeds = [b"user_vault", group_id.as_bytes(), user.key().as_ref()],
        bump = user_vault.bump
    )]
    pub user_vault: Account<'info, UserVault>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct GroupVault {
    pub group_id: String,
    pub authority: Pubkey,
    pub total_deposited: u64,
    pub bump: u8,
}

#[account]
pub struct UserVault {
    pub user: Pubkey,
    pub group_id: String,
    pub balance: u64,
    pub bump: u8,
}

#[error_code]
pub enum CustomError {
    #[msg("Insufficient vault balance.")]
    InsufficientBalance,
}
