"use client";

import { useState } from "react";
import type { NextPage } from "next";
import { parseUnits } from "viem";
import { useAccount } from "wagmi";
import { AddressInput } from "@scaffold-ui/components";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWriteAndOpen } from "~~/hooks/scaffold-eth/useWriteAndOpen";
import { notification } from "~~/utils/scaffold-eth";

const VAULT_ID_V3_ADDRESS = "0xed6AEa6DA48F8e3E5002e5F3dB97F7d6CABd9264";
const CLAWD_MINT_PRICE = parseUnits("25000", 18);
const USDC_MINT_PRICE = parseUnits("10", 6);

const CRED_TYPES = [
  { label: "VAULT", value: 0 },
  { label: "MEMBERSHIP", value: 1 },
  { label: "CREDENTIAL", value: 2 },
  { label: "PASS", value: 3 },
  { label: "RECEIPT", value: 4 },
  { label: "DOCUMENT", value: 5 },
];

const Create: NextPage = () => {
  const { address: connectedAddress, isConnected } = useAccount();

  // Form state
  const [recoveryWallet, setRecoveryWallet] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [metadataURI, setMetadataURI] = useState("");
  const [encryptedPayloadRef, setEncryptedPayloadRef] = useState("");
  const [schemaVersion] = useState(1);
  const [credType, setCredType] = useState(0);
  const [issuerAddress, setIssuerAddress] = useState("");
  const [membershipTier, setMembershipTier] = useState("");
  const [membershipIdentifier, setMembershipIdentifier] = useState("");

  // Approval state (CLAWD)
  const [clawdApprovalSubmitting, setClawdApprovalSubmitting] = useState(false);
  const [clawdApproveCooldown, setClawdApproveCooldown] = useState(false);

  // Approval state (USDC)
  const [usdcApprovalSubmitting, setUsdcApprovalSubmitting] = useState(false);
  const [usdcApproveCooldown, setUsdcApproveCooldown] = useState(false);

  const { writeAndOpen } = useWriteAndOpen();

  // Read CLAWD allowance
  const { data: clawdAllowance, refetch: refetchClawdAllowance } = useScaffoldReadContract({
    contractName: "CLAWD",
    functionName: "allowance",
    args: [connectedAddress, VAULT_ID_V3_ADDRESS],
    query: { enabled: isConnected },
  });

  // Read USDC allowance
  const { data: usdcAllowance, refetch: refetchUsdcAllowance } = useScaffoldReadContract({
    contractName: "USDC",
    functionName: "allowance",
    args: [connectedAddress, VAULT_ID_V3_ADDRESS],
    query: { enabled: isConnected },
  });

  // CLAWD approve
  const { writeContractAsync: writeClawd, isPending: clawdPending } = useScaffoldWriteContract({
    contractName: "CLAWD",
  });

  // USDC approve
  const { writeContractAsync: writeUsdc, isPending: usdcPending } = useScaffoldWriteContract({
    contractName: "USDC",
  });

  // VaultIDV3 mint
  const { writeContractAsync: writeMint, isPending: mintPending } = useScaffoldWriteContract({
    contractName: "VaultIDV3",
  });

  const buildMintParams = () => {
    const expiryTimestamp = expiryDate ? BigInt(Math.floor(new Date(expiryDate).getTime() / 1000)) : 0n;
    const issuer = (issuerAddress as `0x${string}`) || "0x0000000000000000000000000000000000000000";
    const recovery = (recoveryWallet as `0x${string}`) || "0x0000000000000000000000000000000000000000";

    return {
      recoveryWallet: recovery,
      expiry: expiryTimestamp,
      credType,
      issuer,
      encryptedPayloadRef,
      metadataURI,
      membershipTier: credType === 1 ? membershipTier : "",
      membershipIdentifier: credType === 1 ? membershipIdentifier : "",
    };
  };

  const handleClawdApprove = async () => {
    if (clawdApprovalSubmitting || clawdApproveCooldown) return;
    setClawdApprovalSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeClawd({
          functionName: "approve",
          args: [VAULT_ID_V3_ADDRESS, CLAWD_MINT_PRICE],
        }),
      );
      setClawdApproveCooldown(true);
      setTimeout(() => {
        setClawdApproveCooldown(false);
        refetchClawdAllowance();
      }, 4000);
    } catch {
      notification.error("CLAWD approval failed");
    } finally {
      setClawdApprovalSubmitting(false);
    }
  };

  const handleUsdcApprove = async () => {
    if (usdcApprovalSubmitting || usdcApproveCooldown) return;
    setUsdcApprovalSubmitting(true);
    try {
      await writeAndOpen(() =>
        writeUsdc({
          functionName: "approve",
          args: [VAULT_ID_V3_ADDRESS, USDC_MINT_PRICE],
        }),
      );
      setUsdcApproveCooldown(true);
      setTimeout(() => {
        setUsdcApproveCooldown(false);
        refetchUsdcAllowance();
      }, 4000);
    } catch {
      notification.error("USDC approval failed");
    } finally {
      setUsdcApprovalSubmitting(false);
    }
  };

  const handleMintWithClawd = async () => {
    if (!isConnected) {
      notification.error("Please connect your wallet");
      return;
    }
    try {
      await writeAndOpen(() =>
        writeMint({
          functionName: "mintWithCLAWD",
          args: [buildMintParams()],
        }),
      );
      notification.success("VaultID minted with CLAWD!");
    } catch {
      notification.error("Mint with CLAWD failed");
    }
  };

  const handleMintWithUsdc = async () => {
    if (!isConnected) {
      notification.error("Please connect your wallet");
      return;
    }
    try {
      await writeAndOpen(() =>
        writeMint({
          functionName: "mintWithUSDC",
          args: [buildMintParams()],
        }),
      );
      notification.success("VaultID minted with USDC!");
    } catch {
      notification.error("Mint with USDC failed");
    }
  };

  const clawdApproved = clawdAllowance !== undefined && clawdAllowance >= CLAWD_MINT_PRICE;
  const usdcApproved = usdcAllowance !== undefined && usdcAllowance >= USDC_MINT_PRICE;

  if (!isConnected) {
    return (
      <div className="flex items-center justify-center grow pt-20">
        <div className="card bg-base-100 shadow-xl max-w-md w-full mx-4">
          <div className="card-body text-center">
            <h2 className="card-title justify-center mb-2">Connect Wallet</h2>
            <p className="opacity-70">Connect your wallet to mint a VaultID credential.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-center flex-col grow pt-10 pb-20">
      <div className="px-5 max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-2">Create VaultID</h1>
        <p className="opacity-70 mb-8">Mint a new soulbound encrypted credential NFT on Base.</p>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body gap-6">
            {/* Credential Type */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Credential Type</span>
              </label>
              <div className="flex flex-wrap gap-2">
                {CRED_TYPES.map(ct => (
                  <button
                    key={ct.value}
                    className={`btn btn-sm ${credType === ct.value ? "btn-primary" : "btn-outline"}`}
                    onClick={() => setCredType(ct.value)}
                  >
                    {ct.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Recovery Wallet */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Recovery Wallet</span>
                <span className="label-text-alt opacity-60">optional</span>
              </label>
              <AddressInput
                value={recoveryWallet}
                onChange={setRecoveryWallet}
                placeholder="0x... (leave blank for none)"
              />
            </div>

            {/* Issuer Address */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Issuer Address</span>
                <span className="label-text-alt opacity-60">optional — 0x0 = self-issued</span>
              </label>
              <AddressInput
                value={issuerAddress}
                onChange={setIssuerAddress}
                placeholder="0x... (leave blank for self-issued)"
              />
            </div>

            {/* Expiry Date */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Expiry Date</span>
                <span className="label-text-alt opacity-60">optional</span>
              </label>
              <input
                type="date"
                className="input input-bordered w-full"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
              />
            </div>

            {/* Metadata URI */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Metadata URI</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={metadataURI}
                onChange={e => setMetadataURI(e.target.value)}
                placeholder="ipfs://... or https://..."
              />
            </div>

            {/* Encrypted Payload Ref */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Encrypted Payload Reference</span>
                <span className="label-text-alt opacity-60">encrypt off-chain first</span>
              </label>
              <input
                type="text"
                className="input input-bordered w-full"
                value={encryptedPayloadRef}
                onChange={e => setEncryptedPayloadRef(e.target.value)}
                placeholder="ipfs://... or encrypted data reference"
              />
              <label className="label">
                <span className="label-text-alt opacity-50">
                  This should be an already-encrypted reference. All encryption is client-side.
                </span>
              </label>
            </div>

            {/* Schema Version (read-only display) */}
            <div className="form-control">
              <label className="label">
                <span className="label-text font-semibold">Schema Version</span>
              </label>
              <input type="number" className="input input-bordered w-full" value={schemaVersion} readOnly disabled />
            </div>

            {/* Membership fields */}
            {credType === 1 && (
              <div className="border border-base-300 rounded-2xl p-4 flex flex-col gap-4">
                <h3 className="font-semibold">Membership Details</h3>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Membership Tier</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={membershipTier}
                    onChange={e => setMembershipTier(e.target.value)}
                    placeholder="e.g. Gold, Silver, Basic"
                  />
                </div>
                <div className="form-control">
                  <label className="label">
                    <span className="label-text">Membership Identifier</span>
                  </label>
                  <input
                    type="text"
                    className="input input-bordered w-full"
                    value={membershipIdentifier}
                    onChange={e => setMembershipIdentifier(e.target.value)}
                    placeholder="e.g. member ID, username"
                  />
                </div>
              </div>
            )}

            {/* Mint Buttons */}
            <div className="divider">Mint</div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Mint with CLAWD */}
              <div className="card bg-base-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Mint with CLAWD</span>
                  <span className="badge badge-outline">25,000 CLAWD</span>
                </div>
                <div className="text-xs opacity-60">
                  {clawdApproved ? (
                    <span className="text-success">Allowance approved</span>
                  ) : (
                    <span>Approval required before minting</span>
                  )}
                </div>
                {!clawdApproved && (
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={clawdPending || clawdApprovalSubmitting || clawdApproveCooldown}
                    onClick={handleClawdApprove}
                  >
                    {(clawdApprovalSubmitting || clawdApproveCooldown) && (
                      <span className="loading loading-spinner loading-sm" />
                    )}
                    {clawdApproveCooldown ? "Waiting..." : "Approve CLAWD"}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!clawdApproved || mintPending}
                  onClick={handleMintWithClawd}
                >
                  {mintPending && <span className="loading loading-spinner loading-sm" />}
                  Mint with CLAWD
                </button>
              </div>

              {/* Mint with USDC */}
              <div className="card bg-base-200 rounded-2xl p-4 flex flex-col gap-3">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Mint with USDC</span>
                  <span className="badge badge-outline">10 USDC</span>
                </div>
                <div className="text-xs opacity-60">
                  {usdcApproved ? (
                    <span className="text-success">Allowance approved</span>
                  ) : (
                    <span>Approval required before minting</span>
                  )}
                </div>
                {!usdcApproved && (
                  <button
                    className="btn btn-outline btn-sm"
                    disabled={usdcPending || usdcApprovalSubmitting || usdcApproveCooldown}
                    onClick={handleUsdcApprove}
                  >
                    {(usdcApprovalSubmitting || usdcApproveCooldown) && (
                      <span className="loading loading-spinner loading-sm" />
                    )}
                    {usdcApproveCooldown ? "Waiting..." : "Approve USDC"}
                  </button>
                )}
                <button
                  className="btn btn-primary"
                  disabled={!usdcApproved || mintPending}
                  onClick={handleMintWithUsdc}
                >
                  {mintPending && <span className="loading loading-spinner loading-sm" />}
                  Mint with USDC
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Create;
