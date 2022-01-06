# cross-pile
A heads or tails (cross and pile) on Solana. It's meant to serve as an example of how to use solrand, a randomness Oracle: https://github.com/evanmarshall/solrand


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
4. Use the Program Id found from the deploy. Replace `6urrPCjcrQ1xaxbAJGMTtvZfA9wbMqQbEArKnVUHhYTs` with your new Program Id.
5. Run the tests: `anchor test --skip-local-validator`

# Troubleshooting

## Problems with Anchor
* The most common problem with anchor is using the right version of node. I recommend install Node through NVM and using `Node v16.11.1`. 

# License

We use the `GNU Affero General Public License v3.0 or later` license to ensure the community will always have access to all original and derivations of this program.
Full text here: https://spdx.org/licenses/AGPL-3.0-or-later.html
