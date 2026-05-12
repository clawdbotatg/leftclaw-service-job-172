// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { Ownable2Step } from "@openzeppelin/contracts/access/Ownable2Step.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title VaultIDV3
 * @notice Wallet-bound (soulbound) encrypted credential infrastructure.
 * @dev Each Vault is a non-transferable ERC721 representing a credential, vault,
 *      membership, pass, receipt or document. Sensitive payloads MUST be encrypted
 *      off-chain and referenced via `encryptedPayloadRef`. The `metadataURI` field
 *      is PUBLIC and must NEVER contain plaintext personally identifiable
 *      information. Membership identifiers stored on-chain must be opaque
 *      (UUIDs, hashes, or aliases) — never raw PII.
 */
contract VaultIDV3 is ERC721, Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Types
    // ---------------------------------------------------------------------

    enum CredentialType {
        VAULT,
        MEMBERSHIP,
        CREDENTIAL,
        PASS,
        RECEIPT,
        DOCUMENT
    }

    /**
     * @notice On-chain record of a vault credential.
     * @dev `metadataURI` is PUBLIC metadata only and must never contain
     *      sensitive plaintext. Sensitive payloads live behind
     *      `encryptedPayloadRef` and are encrypted off-chain.
     */
    struct Vault {
        address owner;
        address recoveryWallet;
        uint64 expiry; // 0 = no expiry; unix timestamp
        bool revoked; // intentional invalidation — distinct from expiry and burn
        CredentialType credType;
        address issuer; // address(0) = self-issued
        string encryptedPayloadRef; // storage-agnostic opaque ref
        string metadataURI; // PUBLIC metadata ONLY — never sensitive plaintext
        uint8 schemaVersion; // signals frontend which encryption/schema flow to apply
    }

    /**
     * @notice Parameters for minting a new vault credential.
     * @dev `membershipIdentifier` must be opaque (UUID, hash, alias) — never PII.
     *      `metadataURI` must point to public, non-sensitive metadata only.
     */
    struct MintParams {
        address recoveryWallet;
        uint64 expiry;
        CredentialType credType;
        address issuer; // address(0) = self-issued
        string encryptedPayloadRef;
        string metadataURI;
        string membershipTier; // ignored unless credType == MEMBERSHIP
        string membershipIdentifier; // opaque only — UUID, hash, alias
    }

    /**
     * @notice Optional membership data attached to MEMBERSHIP-type vaults.
     * @dev `identifier` is opaque only — UUID, hash, or alias; never PII.
     */
    struct MembershipInfo {
        string tier;
        string identifier; // opaque — UUID, hash, or alias; never PII
        uint64 expiry;
        bool active;
    }

    struct IssuerInfo {
        string name;
        bool verified;
        bool active;
    }

    // ---------------------------------------------------------------------
    // Storage
    // ---------------------------------------------------------------------

    mapping(uint256 => Vault) public vaults;
    mapping(uint256 => MembershipInfo) public memberships;
    mapping(address => IssuerInfo) public issuers;
    mapping(uint256 => mapping(address => bool)) public viewerPermissions;

    uint256 public clawdMintPrice; // default 25_000 * 1e18
    uint256 public usdcMintPrice; // 10 USDC = 10_000_000

    address public feeRecipient;
    IERC20 public immutable clawdToken;
    IERC20 public immutable usdcToken;

    uint256 private _nextTokenId;

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    event VaultMinted(uint256 indexed tokenId, address indexed owner, CredentialType credType, address indexed issuer);
    event VaultRevoked(uint256 indexed tokenId, address indexed revokedBy);
    event VaultUnrevoked(uint256 indexed tokenId);
    event VaultBurned(uint256 indexed tokenId, address indexed owner);
    event VaultRecovered(uint256 indexed oldTokenId, uint256 indexed newTokenId, address indexed recoveryWallet);
    event ExpiryExtended(uint256 indexed tokenId, uint64 newExpiry);
    event RecoveryWalletSet(uint256 indexed tokenId, address indexed recoveryWallet);
    event ViewerPermissionGranted(uint256 indexed tokenId, address indexed viewer);
    event ViewerPermissionRevoked(uint256 indexed tokenId, address indexed viewer);
    event SignerInvited(uint256 indexed tokenId, address indexed signer);
    event IssuerRegistered(address indexed issuer, string name);
    event IssuerVerified(address indexed issuer);
    event IssuerDeactivated(address indexed issuer);
    event MintPricesUpdated(uint256 clawdPrice, uint256 usdcPrice);
    event FeeRecipientUpdated(address indexed newRecipient);

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error Soulbound();
    error NotVaultOwner();
    error NotRecoveryWallet();
    error NotAuthorizedToRevoke();
    error VaultNotFound();
    error ZeroAddress();
    error ExpiryInPast();
    error AlreadyRevoked();
    error NotRevoked();
    error IssuerNotActive();

    // ---------------------------------------------------------------------
    // Constructor
    // ---------------------------------------------------------------------

    constructor(
        address _clawdToken,
        address _usdcToken,
        uint256 _clawdMintPrice,
        uint256 _usdcMintPrice,
        address _feeRecipient,
        address _initialOwner
    ) ERC721("VaultID", "VID") Ownable(_initialOwner) {
        if (_clawdToken == address(0) || _usdcToken == address(0)) revert ZeroAddress();
        if (_feeRecipient == address(0)) revert ZeroAddress();

        clawdToken = IERC20(_clawdToken);
        usdcToken = IERC20(_usdcToken);
        clawdMintPrice = _clawdMintPrice;
        usdcMintPrice = _usdcMintPrice;
        feeRecipient = _feeRecipient;
        _nextTokenId = 1;
    }

    // ---------------------------------------------------------------------
    // Soulbound enforcement
    // ---------------------------------------------------------------------

    /**
     * @dev Mint (from == address(0)) and burn (to == address(0)) allowed.
     *      All transfer attempts revert with Soulbound().
     */
    function _update(address to, uint256 tokenId, address auth) internal override returns (address) {
        address from = _ownerOf(tokenId);
        if (from != address(0) && to != address(0)) revert Soulbound();
        return super._update(to, tokenId, auth);
    }

    function approve(address, uint256) public pure override {
        revert Soulbound();
    }

    function setApprovalForAll(address, bool) public pure override {
        revert Soulbound();
    }

    // ---------------------------------------------------------------------
    // Mint
    // ---------------------------------------------------------------------

    function mintWithCLAWD(MintParams calldata params) external nonReentrant returns (uint256) {
        // CEI: pull payment first
        clawdToken.safeTransferFrom(msg.sender, feeRecipient, clawdMintPrice);
        return _mintVault(msg.sender, params);
    }

    function mintWithUSDC(MintParams calldata params) external nonReentrant returns (uint256) {
        // CEI: pull payment first
        usdcToken.safeTransferFrom(msg.sender, feeRecipient, usdcMintPrice);
        return _mintVault(msg.sender, params);
    }

    function _mintVault(address to, MintParams calldata params) internal returns (uint256 tokenId) {
        tokenId = _nextTokenId++;

        // Effects: write vault state before _safeMint so external callbacks see consistent state.
        vaults[tokenId] = Vault({
            owner: to,
            recoveryWallet: params.recoveryWallet,
            expiry: params.expiry,
            revoked: false,
            credType: params.credType,
            issuer: params.issuer,
            encryptedPayloadRef: params.encryptedPayloadRef,
            metadataURI: params.metadataURI,
            schemaVersion: 1
        });

        if (params.credType == CredentialType.MEMBERSHIP) {
            memberships[tokenId] = MembershipInfo({
                tier: params.membershipTier,
                identifier: params.membershipIdentifier,
                expiry: params.expiry,
                active: true
            });
        }

        _safeMint(to, tokenId);

        emit VaultMinted(tokenId, to, params.credType, params.issuer);
    }

    // ---------------------------------------------------------------------
    // Lifecycle
    // ---------------------------------------------------------------------

    function burn(uint256 tokenId) external {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();

        address vaultOwner = ownerOf(tokenId);
        _burn(tokenId);
        // Clear ancillary state.
        delete vaults[tokenId];
        delete memberships[tokenId];

        emit VaultBurned(tokenId, vaultOwner);
    }

    function recoverVault(uint256 tokenId) external returns (uint256 newTokenId) {
        _requireExists(tokenId);
        Vault memory v = vaults[tokenId];
        if (v.recoveryWallet == address(0) || msg.sender != v.recoveryWallet) revert NotRecoveryWallet();

        // Burn old token.
        _burn(tokenId);
        delete vaults[tokenId];
        // Preserve membership info under new token id by carrying it across.
        MembershipInfo memory m = memberships[tokenId];
        delete memberships[tokenId];

        // Remint to recovery wallet, preserving fields, clearing recoveryWallet on new token.
        newTokenId = _nextTokenId++;
        vaults[newTokenId] = Vault({
            owner: msg.sender,
            recoveryWallet: address(0),
            expiry: v.expiry,
            revoked: v.revoked,
            credType: v.credType,
            issuer: v.issuer,
            encryptedPayloadRef: v.encryptedPayloadRef,
            metadataURI: v.metadataURI,
            schemaVersion: v.schemaVersion
        });

        if (v.credType == CredentialType.MEMBERSHIP) {
            memberships[newTokenId] = m;
        }

        _safeMint(msg.sender, newTokenId);

        emit VaultRecovered(tokenId, newTokenId, msg.sender);
    }

    function revoke(uint256 tokenId) external {
        _requireExists(tokenId);
        Vault storage v = vaults[tokenId];
        if (v.revoked) revert AlreadyRevoked();

        bool isOwner = ownerOf(tokenId) == msg.sender;
        bool isIssuer = v.issuer != address(0) && v.issuer == msg.sender && issuers[msg.sender].active;
        if (!isOwner && !isIssuer) revert NotAuthorizedToRevoke();

        v.revoked = true;
        emit VaultRevoked(tokenId, msg.sender);
    }

    function unrevoke(uint256 tokenId) external {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();
        Vault storage v = vaults[tokenId];
        if (!v.revoked) revert NotRevoked();
        v.revoked = false;
        emit VaultUnrevoked(tokenId);
    }

    function extendExpiry(uint256 tokenId, uint64 newExpiry) external {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();
        if (newExpiry != 0 && newExpiry <= block.timestamp) revert ExpiryInPast();
        vaults[tokenId].expiry = newExpiry;
        if (vaults[tokenId].credType == CredentialType.MEMBERSHIP) {
            memberships[tokenId].expiry = newExpiry;
        }
        emit ExpiryExtended(tokenId, newExpiry);
    }

    function setRecoveryWallet(uint256 tokenId, address wallet) public {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();
        vaults[tokenId].recoveryWallet = wallet;
        emit RecoveryWalletSet(tokenId, wallet);
    }

    /// @notice V2-compatible alias for {setRecoveryWallet}.
    function setBackupWallet(uint256 tokenId, address wallet) external {
        setRecoveryWallet(tokenId, wallet);
    }

    // ---------------------------------------------------------------------
    // Views
    // ---------------------------------------------------------------------

    function isValid(uint256 tokenId) external view returns (bool) {
        if (_ownerOf(tokenId) == address(0)) return false;
        Vault memory v = vaults[tokenId];
        if (v.revoked) return false;
        if (v.expiry != 0 && block.timestamp >= v.expiry) return false;
        return true;
    }

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireExists(tokenId);
        return vaults[tokenId].metadataURI;
    }

    // ---------------------------------------------------------------------
    // Viewer permissions / signer invites
    // ---------------------------------------------------------------------

    function grantViewerPermission(uint256 tokenId, address viewer) external {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();
        if (viewer == address(0)) revert ZeroAddress();
        viewerPermissions[tokenId][viewer] = true;
        emit ViewerPermissionGranted(tokenId, viewer);
    }

    function revokeViewerPermission(uint256 tokenId, address viewer) external {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();
        viewerPermissions[tokenId][viewer] = false;
        emit ViewerPermissionRevoked(tokenId, viewer);
    }

    /// @notice Emits an off-chain coordination signal; no on-chain state is written beyond the event.
    function inviteSigner(uint256 tokenId, address signer) external {
        _requireExists(tokenId);
        if (ownerOf(tokenId) != msg.sender) revert NotVaultOwner();
        if (signer == address(0)) revert ZeroAddress();
        emit SignerInvited(tokenId, signer);
    }

    // ---------------------------------------------------------------------
    // Issuer admin
    // ---------------------------------------------------------------------

    function registerIssuer(address issuer, string calldata name) external onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();
        issuers[issuer] = IssuerInfo({ name: name, verified: false, active: true });
        emit IssuerRegistered(issuer, name);
    }

    function verifyIssuer(address issuer) external onlyOwner {
        if (issuer == address(0)) revert ZeroAddress();
        issuers[issuer].verified = true;
        emit IssuerVerified(issuer);
    }

    function deactivateIssuer(address issuer) external onlyOwner {
        if (!issuers[issuer].active) revert IssuerNotActive();
        issuers[issuer].active = false;
        emit IssuerDeactivated(issuer);
    }

    // ---------------------------------------------------------------------
    // Pricing admin
    // ---------------------------------------------------------------------

    function setMintPrices(uint256 clawdPrice, uint256 usdcPrice) external onlyOwner {
        clawdMintPrice = clawdPrice;
        usdcMintPrice = usdcPrice;
        emit MintPricesUpdated(clawdPrice, usdcPrice);
    }

    function setFeeRecipient(address recipient) external onlyOwner {
        if (recipient == address(0)) revert ZeroAddress();
        feeRecipient = recipient;
        emit FeeRecipientUpdated(recipient);
    }

    // ---------------------------------------------------------------------
    // Internal helpers
    // ---------------------------------------------------------------------

    function _requireExists(uint256 tokenId) internal view {
        if (_ownerOf(tokenId) == address(0)) revert VaultNotFound();
    }
}
