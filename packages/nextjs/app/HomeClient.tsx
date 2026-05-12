"use client";

import Link from "next/link";
import { Address } from "@scaffold-ui/components";
import type { NextPage } from "next";

const VAULT_ID_V3_ADDRESS = "0xed6AEa6DA48F8e3E5002e5F3dB97F7d6CABd9264";

const HomeClient: NextPage = () => {
  return (
    <div className="flex items-center flex-col grow pt-10">
      <div className="px-5 max-w-3xl w-full">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-4">VaultID V3</h1>
          <p className="text-lg opacity-80 mb-6">
            Soulbound encrypted credential NFTs on Base. Each VaultID is a non-transferable token holding a
            client-encrypted payload reference — only the owner and granted viewers can access the underlying data.
          </p>
          <div className="flex justify-center items-center gap-2 mb-2">
            <span className="text-sm opacity-60">Contract:</span>
            <Address address={VAULT_ID_V3_ADDRESS} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-8">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Mint a VaultID</h2>
              <p className="opacity-70">
                Create a new soulbound credential. Choose your credential type, set an optional expiry, and pay with
                CLAWD or USDC.
              </p>
              <div className="card-actions justify-end mt-4">
                <Link href="/create" className="btn btn-primary">
                  Create Credential
                </Link>
              </div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title">Verify a Credential</h2>
              <p className="opacity-70">
                Anyone can publicly verify any VaultID by token ID. No wallet required — check validity, credential
                type, and issuer information.
              </p>
              <div className="card-actions justify-end mt-4">
                <Link href="/verify?id=1" className="btn btn-outline">
                  Verify a Token
                </Link>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10">
          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h2 className="card-title mb-2">Credential Types</h2>
              <div className="flex flex-wrap gap-2">
                {["VAULT", "MEMBERSHIP", "CREDENTIAL", "PASS", "RECEIPT", "DOCUMENT"].map(type => (
                  <span key={type} className="badge badge-outline badge-lg">
                    {type}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 mb-10">
          <div className="card bg-base-200 shadow-xl">
            <div className="card-body">
              <h2 className="card-title text-sm opacity-70">How It Works</h2>
              <ul className="list-disc list-inside space-y-2 opacity-80 text-sm">
                <li>Encrypt your credential payload off-chain using your preferred encryption scheme</li>
                <li>Store the encrypted payload reference (e.g. an IPFS CID or other URI) in the VaultID</li>
                <li>Grant viewer permissions to specific wallets so only authorized parties can decrypt</li>
                <li>VaultIDs are soulbound — they cannot be transferred, only burned or recovered via backup wallet</li>
                <li>
                  Public verifiers can check validity without seeing the encrypted payload at{" "}
                  <code className="font-mono text-xs bg-base-300 px-1 rounded">/verify?id=[tokenId]</code>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HomeClient;
