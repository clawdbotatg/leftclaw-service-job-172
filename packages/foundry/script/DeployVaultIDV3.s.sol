// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./DeployHelpers.s.sol";
import { VaultIDV3 } from "../contracts/VaultIDV3.sol";

/**
 * @notice Deploys VaultIDV3 with the deployer as initial owner and then
 *         transfers ownership to the client wallet via Ownable2Step. The
 *         client must call `acceptOwnership()` to finalize the handover.
 */
contract DeployVaultIDV3 is ScaffoldETHDeploy {
    // CLAWD token on Base (18 decimals)
    address internal constant CLAWD = 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07;
    // USDC token on Base (6 decimals)
    address internal constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    // 25,000 CLAWD (18 decimals)
    uint256 internal constant CLAWD_MINT_PRICE = 25_000 * 1e18;
    // 10 USDC (6 decimals)
    uint256 internal constant USDC_MINT_PRICE = 10_000_000;

    // Client wallet — receives fees and becomes owner after acceptOwnership().
    address internal constant CLIENT_WALLET = 0xFE968dE21eb0E77d5877477C31a04A3075c0086E;

    function run() external ScaffoldEthDeployerRunner {
        VaultIDV3 vaultID = new VaultIDV3(
            CLAWD,
            USDC,
            CLAWD_MINT_PRICE,
            USDC_MINT_PRICE,
            CLIENT_WALLET, // feeRecipient
            deployer // initial owner (deployer)
        );

        // Two-step transfer: client must call acceptOwnership() afterwards.
        vaultID.transferOwnership(CLIENT_WALLET);

        deployments.push(Deployment({ name: "VaultIDV3", addr: address(vaultID) }));
    }
}
