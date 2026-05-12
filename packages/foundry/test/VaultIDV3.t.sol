// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { Test } from "forge-std/Test.sol";
import { VaultIDV3 } from "../contracts/VaultIDV3.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { IERC721Errors } from "@openzeppelin/contracts/interfaces/draft-IERC6093.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decs;

    constructor(string memory name_, string memory symbol_, uint8 decs_) ERC20(name_, symbol_) {
        _decs = decs_;
    }

    function decimals() public view override returns (uint8) {
        return _decs;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

contract VaultIDV3Test is Test {
    VaultIDV3 internal vault;
    MockERC20 internal clawd;
    MockERC20 internal usdc;

    address internal owner = address(0xA11CE);
    address internal alice = address(0xA11);
    address internal bob = address(0xB0B);
    address internal recovery = address(0xEC0);
    address internal issuer = address(0x1551E);
    address internal feeRecipient = address(0xFEE);
    address internal viewer = address(0x71E0);

    uint256 internal constant CLAWD_PRICE = 25_000 * 1e18;
    uint256 internal constant USDC_PRICE = 10_000_000;

    function setUp() public {
        clawd = new MockERC20("CLAWD", "CLAWD", 18);
        usdc = new MockERC20("USDC", "USDC", 6);

        vm.prank(owner);
        vault = new VaultIDV3(address(clawd), address(usdc), CLAWD_PRICE, USDC_PRICE, feeRecipient, owner);

        // Fund alice for mints.
        clawd.mint(alice, 1_000_000 * 1e18);
        usdc.mint(alice, 1_000 * 1e6);
        clawd.mint(bob, 1_000_000 * 1e18);
        usdc.mint(bob, 1_000 * 1e6);
    }

    // -----------------------------------------------------------------
    // Helpers
    // -----------------------------------------------------------------

    function _defaultParams() internal view returns (VaultIDV3.MintParams memory p) {
        p = VaultIDV3.MintParams({
            recoveryWallet: recovery,
            expiry: 0,
            credType: VaultIDV3.CredentialType.VAULT,
            issuer: address(0),
            encryptedPayloadRef: "ipfs://payload",
            metadataURI: "ipfs://meta",
            membershipTier: "",
            membershipIdentifier: ""
        });
    }

    function _mintAsAlice() internal returns (uint256 tokenId) {
        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        tokenId = vault.mintWithCLAWD(_defaultParams());
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // Soulbound
    // -----------------------------------------------------------------

    function test_transferFromReverts() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.Soulbound.selector);
        vault.transferFrom(alice, bob, id);
    }

    function test_safeTransferFromReverts() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.Soulbound.selector);
        vault.safeTransferFrom(alice, bob, id);
    }

    function test_approveReverts() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.Soulbound.selector);
        vault.approve(bob, id);
    }

    function test_setApprovalForAllReverts() public {
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.Soulbound.selector);
        vault.setApprovalForAll(bob, true);
    }

    function test_burnSucceedsForOwner() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vault.burn(id);
        assertFalse(vault.isValid(id));
    }

    function test_burnRevertsForNonOwner() public {
        uint256 id = _mintAsAlice();
        vm.prank(bob);
        vm.expectRevert(VaultIDV3.NotVaultOwner.selector);
        vault.burn(id);
    }

    // -----------------------------------------------------------------
    // Payment
    // -----------------------------------------------------------------

    function test_mintWithCLAWDExactBalanceSucceeds() public {
        // Drain alice to exactly CLAWD_PRICE.
        uint256 bal = clawd.balanceOf(alice);
        vm.prank(alice);
        clawd.transfer(address(0xdead), bal - CLAWD_PRICE);

        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        uint256 id = vault.mintWithCLAWD(_defaultParams());
        vm.stopPrank();

        assertEq(vault.ownerOf(id), alice);
        assertEq(clawd.balanceOf(feeRecipient), CLAWD_PRICE);
    }

    function test_mintWithCLAWDInsufficientBalanceReverts() public {
        // Drain alice below price.
        uint256 bal = clawd.balanceOf(alice);
        vm.prank(alice);
        clawd.transfer(address(0xdead), bal);

        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        vm.expectRevert();
        vault.mintWithCLAWD(_defaultParams());
        vm.stopPrank();
    }

    function test_mintWithCLAWDMissingAllowanceReverts() public {
        vm.startPrank(alice);
        vm.expectRevert();
        vault.mintWithCLAWD(_defaultParams());
        vm.stopPrank();
    }

    function test_mintWithUSDCSucceeds() public {
        vm.startPrank(alice);
        usdc.approve(address(vault), USDC_PRICE);
        uint256 id = vault.mintWithUSDC(_defaultParams());
        vm.stopPrank();
        assertEq(vault.ownerOf(id), alice);
        assertEq(usdc.balanceOf(feeRecipient), USDC_PRICE);
    }

    function test_mintWithUSDCInsufficientBalanceReverts() public {
        uint256 bal = usdc.balanceOf(alice);
        vm.prank(alice);
        usdc.transfer(address(0xdead), bal);

        vm.startPrank(alice);
        usdc.approve(address(vault), USDC_PRICE);
        vm.expectRevert();
        vault.mintWithUSDC(_defaultParams());
        vm.stopPrank();
    }

    function test_mintWithUSDCMissingAllowanceReverts() public {
        vm.startPrank(alice);
        vm.expectRevert();
        vault.mintWithUSDC(_defaultParams());
        vm.stopPrank();
    }

    // -----------------------------------------------------------------
    // Price config
    // -----------------------------------------------------------------

    function test_setMintPricesByOwnerEmits() public {
        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.MintPricesUpdated(1, 2);
        vm.prank(owner);
        vault.setMintPrices(1, 2);
        assertEq(vault.clawdMintPrice(), 1);
        assertEq(vault.usdcMintPrice(), 2);
    }

    function test_setMintPricesByNonOwnerReverts() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        vault.setMintPrices(1, 2);
    }

    // -----------------------------------------------------------------
    // Recovery
    // -----------------------------------------------------------------

    function test_recoverVaultByRecoverySucceedsAndClearsRecoveryWallet() public {
        uint256 id = _mintAsAlice();
        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.VaultRecovered(id, 2, recovery);
        vm.prank(recovery);
        uint256 newId = vault.recoverVault(id);
        assertEq(vault.ownerOf(newId), recovery);
        // Original token burned.
        vm.expectRevert(abi.encodeWithSelector(IERC721Errors.ERC721NonexistentToken.selector, id));
        vault.ownerOf(id);
        // Recovery wallet cleared on new token.
        (, address newRecovery,,,,,,,) = vault.vaults(newId);
        assertEq(newRecovery, address(0));
    }

    function test_recoverVaultByNonRecoveryReverts() public {
        uint256 id = _mintAsAlice();
        vm.prank(bob);
        vm.expectRevert(VaultIDV3.NotRecoveryWallet.selector);
        vault.recoverVault(id);
    }

    function test_recoveryWalletCannotBurn() public {
        uint256 id = _mintAsAlice();
        vm.prank(recovery);
        vm.expectRevert(VaultIDV3.NotVaultOwner.selector);
        vault.burn(id);
    }

    function test_recoveryWalletCannotRevoke() public {
        uint256 id = _mintAsAlice();
        vm.prank(recovery);
        vm.expectRevert(VaultIDV3.NotAuthorizedToRevoke.selector);
        vault.revoke(id);
    }

    function test_recoveryWalletCannotGrantViewer() public {
        uint256 id = _mintAsAlice();
        vm.prank(recovery);
        vm.expectRevert(VaultIDV3.NotVaultOwner.selector);
        vault.grantViewerPermission(id, viewer);
    }

    function test_recoveryWalletCannotExtendExpiry() public {
        uint256 id = _mintAsAlice();
        vm.prank(recovery);
        vm.expectRevert(VaultIDV3.NotVaultOwner.selector);
        vault.extendExpiry(id, uint64(block.timestamp + 1000));
    }

    // -----------------------------------------------------------------
    // Lifecycle / isValid
    // -----------------------------------------------------------------

    function test_isValidLifecycle() public {
        uint256 id = _mintAsAlice();
        assertTrue(vault.isValid(id));

        // Revoke -> invalid
        vm.prank(alice);
        vault.revoke(id);
        assertFalse(vault.isValid(id));

        // Unrevoke -> valid again
        vm.prank(alice);
        vault.unrevoke(id);
        assertTrue(vault.isValid(id));

        // Expiry in the future, still valid
        vm.prank(alice);
        vault.extendExpiry(id, uint64(block.timestamp + 100));
        assertTrue(vault.isValid(id));

        // Move past expiry -> invalid
        vm.warp(block.timestamp + 200);
        assertFalse(vault.isValid(id));

        // Burn -> invalid
        vm.prank(alice);
        vault.burn(id);
        assertFalse(vault.isValid(id));
    }

    function test_extendExpiryByOwnerSucceeds() public {
        uint256 id = _mintAsAlice();
        uint64 newExp = uint64(block.timestamp + 365 days);
        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.ExpiryExtended(id, newExp);
        vm.prank(alice);
        vault.extendExpiry(id, newExp);
    }

    function test_extendExpiryInPastReverts() public {
        uint256 id = _mintAsAlice();
        vm.warp(1000);
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.ExpiryInPast.selector);
        vault.extendExpiry(id, 500);
    }

    // -----------------------------------------------------------------
    // Issuer flow
    // -----------------------------------------------------------------

    function _registerAndVerifyIssuer() internal {
        vm.startPrank(owner);
        vault.registerIssuer(issuer, "Acme");
        vault.verifyIssuer(issuer);
        vm.stopPrank();
    }

    function test_issuerRegistrationFlow() public {
        _registerAndVerifyIssuer();
        (string memory name, bool verified, bool active) = vault.issuers(issuer);
        assertEq(name, "Acme");
        assertTrue(verified);
        assertTrue(active);

        vm.prank(owner);
        vault.deactivateIssuer(issuer);
        (,, active) = vault.issuers(issuer);
        assertFalse(active);
    }

    function test_issuerCanRevokeOwnIssued() public {
        _registerAndVerifyIssuer();
        VaultIDV3.MintParams memory p = _defaultParams();
        p.issuer = issuer;
        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        uint256 id = vault.mintWithCLAWD(p);
        vm.stopPrank();

        vm.prank(issuer);
        vault.revoke(id);
        assertFalse(vault.isValid(id));
    }

    function test_deactivatedIssuerCannotRevoke() public {
        _registerAndVerifyIssuer();
        VaultIDV3.MintParams memory p = _defaultParams();
        p.issuer = issuer;
        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        uint256 id = vault.mintWithCLAWD(p);
        vm.stopPrank();

        vm.prank(owner);
        vault.deactivateIssuer(issuer);

        vm.prank(issuer);
        vm.expectRevert(VaultIDV3.NotAuthorizedToRevoke.selector);
        vault.revoke(id);
    }

    function test_issuerCannotBurn() public {
        _registerAndVerifyIssuer();
        VaultIDV3.MintParams memory p = _defaultParams();
        p.issuer = issuer;
        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        uint256 id = vault.mintWithCLAWD(p);
        vm.stopPrank();

        vm.prank(issuer);
        vm.expectRevert(VaultIDV3.NotVaultOwner.selector);
        vault.burn(id);
    }

    // -----------------------------------------------------------------
    // Permissions
    // -----------------------------------------------------------------

    function test_grantAndRevokeViewer() public {
        uint256 id = _mintAsAlice();

        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.ViewerPermissionGranted(id, viewer);
        vm.prank(alice);
        vault.grantViewerPermission(id, viewer);
        assertTrue(vault.viewerPermissions(id, viewer));

        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.ViewerPermissionRevoked(id, viewer);
        vm.prank(alice);
        vault.revokeViewerPermission(id, viewer);
        assertFalse(vault.viewerPermissions(id, viewer));
    }

    function test_inviteSignerEmitsEventOnly() public {
        uint256 id = _mintAsAlice();
        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.SignerInvited(id, bob);
        vm.prank(alice);
        vault.inviteSigner(id, bob);
        // No state side effects in viewerPermissions for an invite.
        assertFalse(vault.viewerPermissions(id, bob));
    }

    // -----------------------------------------------------------------
    // V2 alias
    // -----------------------------------------------------------------

    function test_setBackupWalletAliasMatchesSetRecoveryWallet() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vault.setBackupWallet(id, bob);
        (, address newRecovery,,,,,,,) = vault.vaults(id);
        assertEq(newRecovery, bob);
    }

    // -----------------------------------------------------------------
    // Membership population
    // -----------------------------------------------------------------

    function test_membershipPopulatedForMembershipType() public {
        VaultIDV3.MintParams memory p = _defaultParams();
        p.credType = VaultIDV3.CredentialType.MEMBERSHIP;
        p.membershipTier = "Gold";
        p.membershipIdentifier = "uuid:abc";
        p.expiry = uint64(block.timestamp + 30 days);

        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        uint256 id = vault.mintWithCLAWD(p);
        vm.stopPrank();

        (string memory tier, string memory ident, uint64 exp, bool active) = vault.memberships(id);
        assertEq(tier, "Gold");
        assertEq(ident, "uuid:abc");
        assertEq(exp, p.expiry);
        assertTrue(active);
    }

    function test_membershipEmptyForNonMembershipType() public {
        uint256 id = _mintAsAlice();
        (string memory tier, string memory ident, uint64 exp, bool active) = vault.memberships(id);
        assertEq(tier, "");
        assertEq(ident, "");
        assertEq(exp, 0);
        assertFalse(active);
    }

    // -----------------------------------------------------------------
    // tokenURI returns only metadataURI
    // -----------------------------------------------------------------

    function test_tokenURIReturnsMetadataOnly() public {
        uint256 id = _mintAsAlice();
        assertEq(vault.tokenURI(id), "ipfs://meta");
    }

    // -----------------------------------------------------------------
    // Audit fix: issuer revocation cannot be undone by vault owner
    // -----------------------------------------------------------------

    function _mintAsAliceWithIssuer() internal returns (uint256 tokenId) {
        VaultIDV3.MintParams memory p = _defaultParams();
        p.issuer = issuer;
        vm.startPrank(alice);
        clawd.approve(address(vault), CLAWD_PRICE);
        tokenId = vault.mintWithCLAWD(p);
        vm.stopPrank();
    }

    function test_unrevokeRevertsWhenIssuerRevokedAndCallerNotContractOwner() public {
        _registerAndVerifyIssuer();
        uint256 id = _mintAsAliceWithIssuer();

        // Issuer revokes.
        vm.prank(issuer);
        vault.revoke(id);
        assertFalse(vault.isValid(id));

        // Vault owner (alice) cannot undo the issuer revocation.
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.NotAuthorizedToUnrevoke.selector);
        vault.unrevoke(id);

        // Random third party also cannot.
        vm.prank(bob);
        vm.expectRevert(VaultIDV3.NotAuthorizedToUnrevoke.selector);
        vault.unrevoke(id);

        // Still revoked.
        assertFalse(vault.isValid(id));
    }

    function test_contractOwnerCanUnrevokeIssuerRevokedCredential() public {
        _registerAndVerifyIssuer();
        uint256 id = _mintAsAliceWithIssuer();

        vm.prank(issuer);
        vault.revoke(id);
        assertFalse(vault.isValid(id));

        vm.expectEmit(true, true, true, true);
        emit VaultIDV3.VaultUnrevoked(id);
        vm.prank(owner);
        vault.unrevoke(id);
        assertTrue(vault.isValid(id));

        // After the contract owner unrevokes, the vault owner is free to revoke
        // and unrevoke themselves again (the issuer-revoked flag was cleared).
        vm.prank(alice);
        vault.revoke(id);
        vm.prank(alice);
        vault.unrevoke(id);
        assertTrue(vault.isValid(id));
    }

    function test_ownerSelfRevokeCanBeSelfUnrevoked() public {
        // Self-revocations (msg.sender == ownerOf(tokenId)) should remain
        // owner-undoable — they are not marked as issuer revocations.
        uint256 id = _mintAsAlice();

        vm.prank(alice);
        vault.revoke(id);
        assertFalse(vault.isValid(id));

        vm.prank(alice);
        vault.unrevoke(id);
        assertTrue(vault.isValid(id));
    }

    // -----------------------------------------------------------------
    // Audit fix: setRecoveryWallet cannot equal vault owner
    // -----------------------------------------------------------------

    function test_setRecoveryWalletRevertsWhenWalletEqualsVaultOwner() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.RecoveryWalletCannotBeOwner.selector);
        vault.setRecoveryWallet(id, alice);
    }

    function test_setRecoveryWalletAllowsZeroAddress() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vault.setRecoveryWallet(id, address(0));
        (, address newRecovery,,,,,,,) = vault.vaults(id);
        assertEq(newRecovery, address(0));
    }

    // -----------------------------------------------------------------
    // Audit fix: extendExpiry is strictly extending only
    // -----------------------------------------------------------------

    function test_extendExpiryRevertsWhenNotExtending() public {
        uint256 id = _mintAsAlice();
        uint64 first = uint64(block.timestamp + 100);

        vm.prank(alice);
        vault.extendExpiry(id, first);

        // Same value is not strictly greater — reverts.
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.ExpiryNotExtended.selector);
        vault.extendExpiry(id, first);

        // Shorter (but still in future) — reverts.
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.ExpiryNotExtended.selector);
        vault.extendExpiry(id, uint64(block.timestamp + 50));
    }

    function test_extendExpiryRevertsWhenClearingSetExpiry() public {
        uint256 id = _mintAsAlice();
        vm.prank(alice);
        vault.extendExpiry(id, uint64(block.timestamp + 100));

        // Cannot clear a previously set expiry by passing 0.
        vm.prank(alice);
        vm.expectRevert(VaultIDV3.ExpiryNotExtended.selector);
        vault.extendExpiry(id, 0);
    }

    function test_extendExpiryFromZeroToFutureSucceeds() public {
        uint256 id = _mintAsAlice();
        uint64 newExp = uint64(block.timestamp + 100);
        vm.prank(alice);
        vault.extendExpiry(id, newExp);
        (,, uint64 storedExp,,,,,,) = vault.vaults(id);
        assertEq(storedExp, newExp);
    }

    function test_extendExpiryStrictlyForwardSucceeds() public {
        uint256 id = _mintAsAlice();
        uint64 first = uint64(block.timestamp + 100);
        uint64 second = uint64(block.timestamp + 200);

        vm.prank(alice);
        vault.extendExpiry(id, first);
        vm.prank(alice);
        vault.extendExpiry(id, second);

        (,, uint64 storedExp,,,,,,) = vault.vaults(id);
        assertEq(storedExp, second);
    }

    // -----------------------------------------------------------------
    // Audit fix: recovery clears revoked state
    // -----------------------------------------------------------------

    function test_recoverVaultClearsRevokedState() public {
        uint256 id = _mintAsAlice();

        // Alice revokes herself, then loses access and recovery wallet recovers.
        vm.prank(alice);
        vault.revoke(id);
        assertFalse(vault.isValid(id));

        vm.prank(recovery);
        uint256 newId = vault.recoverVault(id);

        // New token must not be revoked.
        (,,, bool newRevoked,,,,,) = vault.vaults(newId);
        assertFalse(newRevoked);
        assertTrue(vault.isValid(newId));
    }

    function test_recoverVaultClearsIssuerRevokedState() public {
        _registerAndVerifyIssuer();
        uint256 id = _mintAsAliceWithIssuer();

        // Issuer revokes.
        vm.prank(issuer);
        vault.revoke(id);
        assertFalse(vault.isValid(id));

        // Recovery escape hatch reissues a clean token.
        vm.prank(recovery);
        uint256 newId = vault.recoverVault(id);

        (,,, bool newRevoked,,,,,) = vault.vaults(newId);
        assertFalse(newRevoked);
        assertTrue(vault.isValid(newId));

        // And critically: after recovery, the new token owner (recovery wallet)
        // is treated as a fresh vault owner — the issuer-revoked flag does not
        // persist across recovery, so the new owner can self-revoke and
        // self-unrevoke as usual.
        vm.prank(recovery);
        vault.revoke(newId);
        vm.prank(recovery);
        vault.unrevoke(newId);
        assertTrue(vault.isValid(newId));
    }
}
