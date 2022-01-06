# cross-pile
A heads or tails (cross and pile) on Solana


# Installation & Usage

0. Clone this repository
1. Ensure that Anchor and all of its dependencies are installed: https://project-serum.github.io/anchor/getting-started/introduction.html
1. `yarn install`
1. Rename the `Anchor.example.toml` to `Anchor.toml` and update the `wallet =` to your solana key.
1. Start the `solana-test-validator` in a different tab
1. In a separate folder (In order to run a mock Oracle):
    1. Install: https://github.com/evanmarshall/solrand
    1. Run `anchor build && anchor deploy`
3. Run `anchor build && anchor deploy`
4. Use the Program Id found from the deploy. Replace `GxJJd3q28eUd7kpPCbNXGeixqHmBYJ2owqUYqse3ZrGS` with your new Program Id.
5. Run the tests: `anchor test --skip-local-validator`
