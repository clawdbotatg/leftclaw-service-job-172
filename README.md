# VaultID V3

Wallet-bound encrypted credential infrastructure on Base. Built with Scaffold-ETH 2.

## Overview

VaultIDV3 evolves the soulbound encrypted vault system into wallet-bound encrypted credential infrastructure built on the **PUBLIC PROOF + PRIVATE PAYLOAD** principle. V3 deploys alongside V2 on Base — V2 vaults remain unchanged.

V3 introduces credential types, constrained recovery, issuer verification, CLAWD/USDC payment rails, revocation/expiration/burn lifecycle semantics, and a permission signaling layer with zero plaintext leakage.

## Contracts

| Contract | Address | Chain |
|---|---|---|
| VaultIDV3 | [0xed6AEa6DA48F8e3E5002e5F3dB97F7d6CABd9264](https://basescan.org/address/0xed6AEa6DA48F8e3E5002e5F3dB97F7d6CABd9264#code) | Base (8453) |

## Client Actions Required

After deployment, the client wallet must finalize ownership transfer:

```bash
cast send 0xed6AEa6DA48F8e3E5002e5F3dB97F7d6CABd9264 "acceptOwnership()" \
  --private-key <CLIENT_PRIVATE_KEY> \
  --rpc-url https://base-mainnet.g.alchemy.com/v2/<ALCHEMY_KEY>
```

## Payment Rails

| Token | Address | Default Mint Price |
|---|---|---|
| CLAWD | 0x9f86dB9fc6f7c9408e8Fda3Ff8ce4e78ac7a6b07 | 25,000 CLAWD |
| USDC | 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913 | 10 USDC |

## Local Development

```bash
yarn install
yarn fork --network base   # terminal 1
yarn deploy                # terminal 2
yarn start                 # terminal 3
```

## Build for IPFS

```bash
cd packages/nextjs && yarn build
# Upload: npx bgipfs upload packages/nextjs/out
```

## Architecture

All encryption is client-side. The contract stores an opaque `encryptedPayloadRef` and public `metadataURI` — never plaintext. Viewer permissions are signal rails only; decryption is browser-local and wallet-bound.
