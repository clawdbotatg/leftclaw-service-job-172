"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAccount } from "wagmi";
import { Address, AddressInput } from "@scaffold-ui/components";
import { useScaffoldReadContract, useScaffoldWriteContract } from "~~/hooks/scaffold-eth";
import { useWriteAndOpen } from "~~/hooks/scaffold-eth/useWriteAndOpen";
import { notification } from "~~/utils/scaffold-eth";

const CRED_TYPE_LABELS = ["VAULT", "MEMBERSHIP", "CREDENTIAL", "PASS", "RECEIPT", "DOCUMENT"];

function TokenIdForm() {
  const [inputId, setInputId] = useState("");
  return (
    <div className="flex items-center justify-center grow pt-20">
      <div className="card bg-base-100 shadow-xl max-w-md w-full mx-4">
        <div className="card-body">
          <h2 className="card-title justify-center">View VaultID</h2>
          <p className="opacity-70 text-center text-sm">Enter a token ID to view vault details.</p>
          <div className="flex gap-2 mt-4">
            <input
              type="number"
              className="input input-bordered flex-1"
              placeholder="Token ID"
              value={inputId}
              onChange={e => setInputId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && inputId.trim() && (window.location.href = `/vault?id=${inputId.trim()}`)}
            />
            <button
              className="btn btn-primary"
              onClick={() => inputId.trim() && (window.location.href = `/vault?id=${inputId.trim()}`)}
            >
              View
            </button>
          </div>
          <div className="card-actions justify-center mt-2">
            <Link href="/" className="btn btn-ghost btn-sm">
              Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function VaultDetail({ tokenId }: { tokenId: bigint }) {
  const { address: connectedAddress, isConnected } = useAccount();

  const [newRecoveryWallet, setNewRecoveryWallet] = useState("");
  const [newExpiry, setNewExpiry] = useState("");
  const [viewerToGrant, setViewerToGrant] = useState("");
  const [viewerToRevoke, setViewerToRevoke] = useState("");
  const [signerToInvite, setSignerToInvite] = useState("");

  const { writeAndOpen } = useWriteAndOpen();

  const { data: vaultData, isLoading: vaultLoading } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "vaults",
    args: [tokenId],
  });

  const { data: isValid } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "isValid",
    args: [tokenId],
  });

  const { data: ownerOf, isError: notExists } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "ownerOf",
    args: [tokenId],
  });

  const { data: hasViewerPermission } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "viewerPermissions",
    args: [tokenId, connectedAddress],
    query: { enabled: isConnected },
  });

  const { data: membershipData } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "memberships",
    args: [tokenId],
    query: { enabled: vaultData?.[4] === 1 },
  });

  const { writeContractAsync: writeVault, isPending } = useScaffoldWriteContract({
    contractName: "VaultIDV3",
  });

  if (vaultLoading) {
    return (
      <div className="flex justify-center items-center grow pt-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (notExists || !vaultData) {
    return (
      <div className="flex items-center justify-center grow pt-20">
        <div className="card bg-base-100 shadow-xl max-w-md w-full mx-4">
          <div className="card-body text-center">
            <h2 className="card-title justify-center">Vault Not Found</h2>
            <p className="opacity-70">Token #{tokenId.toString()} does not exist or has been burned.</p>
            <div className="badge badge-error mx-auto mt-2">BURNED</div>
            <div className="card-actions justify-center mt-4">
              <Link href="/" className="btn btn-outline btn-sm">
                Go Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [vaultOwner, recoveryWallet, expiry, revoked, credTypeRaw, issuer, encPayloadRef, metaURI] = vaultData;
  const credTypeLabel = CRED_TYPE_LABELS[credTypeRaw] ?? "UNKNOWN";
  const isOwner = isConnected && connectedAddress?.toLowerCase() === vaultOwner?.toLowerCase();
  const canViewPayload = isOwner || hasViewerPermission;

  const expiryTs = Number(expiry);
  const isExpired = expiryTs > 0 && expiryTs < Math.floor(Date.now() / 1000);

  const getStatusBadge = () => {
    if (revoked) return <span className="badge badge-error">REVOKED</span>;
    if (isExpired) return <span className="badge badge-warning">EXPIRED</span>;
    if (isValid) return <span className="badge badge-success">VALID</span>;
    return <span className="badge badge-neutral">UNKNOWN</span>;
  };

  const handleRevoke = async () => {
    try {
      await writeAndOpen(() => writeVault({ functionName: "revoke", args: [tokenId] }));
      notification.success("Vault revoked");
    } catch {
      notification.error("Revoke failed");
    }
  };

  const handleUnrevoke = async () => {
    try {
      await writeAndOpen(() => writeVault({ functionName: "unrevoke", args: [tokenId] }));
      notification.success("Vault unrevoked");
    } catch {
      notification.error("Unrevoke failed");
    }
  };

  const handleExtendExpiry = async () => {
    if (!newExpiry) {
      notification.error("Please enter a new expiry date");
      return;
    }
    const ts = BigInt(Math.floor(new Date(newExpiry).getTime() / 1000));
    try {
      await writeAndOpen(() => writeVault({ functionName: "extendExpiry", args: [tokenId, ts] }));
      notification.success("Expiry extended");
      setNewExpiry("");
    } catch {
      notification.error("Extend expiry failed");
    }
  };

  const handleSetRecoveryWallet = async () => {
    if (!newRecoveryWallet) {
      notification.error("Please enter a recovery wallet address");
      return;
    }
    try {
      await writeAndOpen(() =>
        writeVault({ functionName: "setRecoveryWallet", args: [tokenId, newRecoveryWallet as `0x${string}`] }),
      );
      notification.success("Recovery wallet updated");
      setNewRecoveryWallet("");
    } catch {
      notification.error("Set recovery wallet failed");
    }
  };

  const handleGrantViewer = async () => {
    if (!viewerToGrant) {
      notification.error("Please enter a viewer address");
      return;
    }
    try {
      await writeAndOpen(() =>
        writeVault({ functionName: "grantViewerPermission", args: [tokenId, viewerToGrant as `0x${string}`] }),
      );
      notification.success("Viewer permission granted");
      setViewerToGrant("");
    } catch {
      notification.error("Grant viewer failed");
    }
  };

  const handleRevokeViewer = async () => {
    if (!viewerToRevoke) {
      notification.error("Please enter a viewer address");
      return;
    }
    try {
      await writeAndOpen(() =>
        writeVault({ functionName: "revokeViewerPermission", args: [tokenId, viewerToRevoke as `0x${string}`] }),
      );
      notification.success("Viewer permission revoked");
      setViewerToRevoke("");
    } catch {
      notification.error("Revoke viewer failed");
    }
  };

  const handleInviteSigner = async () => {
    if (!signerToInvite) {
      notification.error("Please enter a signer address");
      return;
    }
    try {
      await writeAndOpen(() =>
        writeVault({ functionName: "inviteSigner", args: [tokenId, signerToInvite as `0x${string}`] }),
      );
      notification.success("Signer invited");
      setSignerToInvite("");
    } catch {
      notification.error("Invite signer failed");
    }
  };

  return (
    <div className="flex items-center flex-col grow pt-10 pb-20">
      <div className="px-5 max-w-2xl w-full">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold">VaultID #{tokenId.toString()}</h1>
            <div className="flex gap-2 mt-2">
              <span className="badge badge-outline">{credTypeLabel}</span>
              {getStatusBadge()}
            </div>
          </div>
          <Link href={`/verify?id=${tokenId.toString()}`} className="btn btn-outline btn-sm">
            Public View
          </Link>
        </div>

        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body gap-4">
            <h2 className="card-title text-lg">Vault Information</h2>

            <div className="grid grid-cols-1 gap-3">
              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Owner</span>
                {ownerOf && <Address address={ownerOf} />}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Recovery Wallet</span>
                {recoveryWallet && recoveryWallet !== "0x0000000000000000000000000000000000000000" ? (
                  <Address address={recoveryWallet} />
                ) : (
                  <span className="opacity-40 text-sm">None set</span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Issuer</span>
                {issuer && issuer !== "0x0000000000000000000000000000000000000000" ? (
                  <div className="flex items-center gap-2">
                    <Address address={issuer} />
                    <Link href={`/issuer?addr=${issuer}`} className="btn btn-xs btn-ghost">
                      Profile
                    </Link>
                  </div>
                ) : (
                  <span className="opacity-40 text-sm">Self-issued</span>
                )}
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Expiry</span>
                <span className={isExpired ? "text-warning" : ""}>
                  {expiryTs > 0 ? new Date(expiryTs * 1000).toLocaleDateString() : "No expiry"}
                </span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Revoked</span>
                <span>{revoked ? "Yes" : "No"}</span>
              </div>

              {metaURI && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm opacity-60">Metadata URI</span>
                  <span className="text-sm font-mono break-all">{metaURI}</span>
                </div>
              )}

              {canViewPayload && encPayloadRef && (
                <div className="flex flex-col gap-1">
                  <span className="text-sm opacity-60">Encrypted Payload Reference</span>
                  <span className="text-sm font-mono break-all bg-base-200 rounded-lg p-2">{encPayloadRef}</span>
                  <span className="text-xs opacity-40">Visible because you are the owner or a granted viewer</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {credTypeRaw === 1 && membershipData && (
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body gap-3">
              <h2 className="card-title text-lg">Membership Details</h2>
              <div>
                <span className="text-sm opacity-60">Tier: </span>
                <span>{membershipData[0] || "—"}</span>
              </div>
              <div>
                <span className="text-sm opacity-60">Identifier: </span>
                <span>{membershipData[1] || "—"}</span>
              </div>
              <div>
                <span className="text-sm opacity-60">Active: </span>
                <span className={membershipData[3] ? "text-success" : "text-error"}>
                  {membershipData[3] ? "Yes" : "No"}
                </span>
              </div>
            </div>
          </div>
        )}

        {isOwner && (
          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body gap-6">
              <h2 className="card-title text-lg">Manage Vault</h2>

              <div className="flex gap-3">
                {!revoked ? (
                  <button className="btn btn-error btn-sm" disabled={isPending} onClick={handleRevoke}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Revoke
                  </button>
                ) : (
                  <button className="btn btn-warning btn-sm" disabled={isPending} onClick={handleUnrevoke}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Unrevoke
                  </button>
                )}
              </div>

              <div className="form-control gap-2">
                <label className="label">
                  <span className="label-text font-semibold">Extend Expiry</span>
                </label>
                <div className="flex gap-2">
                  <input
                    type="date"
                    className="input input-bordered flex-1"
                    value={newExpiry}
                    onChange={e => setNewExpiry(e.target.value)}
                  />
                  <button className="btn btn-outline btn-sm" disabled={isPending} onClick={handleExtendExpiry}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Set
                  </button>
                </div>
              </div>

              <div className="form-control gap-2">
                <label className="label">
                  <span className="label-text font-semibold">Set Recovery Wallet</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AddressInput value={newRecoveryWallet} onChange={setNewRecoveryWallet} placeholder="0x..." />
                  </div>
                  <button className="btn btn-outline btn-sm" disabled={isPending} onClick={handleSetRecoveryWallet}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Set
                  </button>
                </div>
              </div>

              <div className="form-control gap-2">
                <label className="label">
                  <span className="label-text font-semibold">Grant Viewer Permission</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AddressInput value={viewerToGrant} onChange={setViewerToGrant} placeholder="0x..." />
                  </div>
                  <button className="btn btn-success btn-sm" disabled={isPending} onClick={handleGrantViewer}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Grant
                  </button>
                </div>
              </div>

              <div className="form-control gap-2">
                <label className="label">
                  <span className="label-text font-semibold">Revoke Viewer Permission</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AddressInput value={viewerToRevoke} onChange={setViewerToRevoke} placeholder="0x..." />
                  </div>
                  <button className="btn btn-error btn-sm" disabled={isPending} onClick={handleRevokeViewer}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Revoke
                  </button>
                </div>
              </div>

              <div className="form-control gap-2">
                <label className="label">
                  <span className="label-text font-semibold">Invite Signer</span>
                </label>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <AddressInput value={signerToInvite} onChange={setSignerToInvite} placeholder="0x..." />
                  </div>
                  <button className="btn btn-outline btn-sm" disabled={isPending} onClick={handleInviteSigner}>
                    {isPending && <span className="loading loading-spinner loading-sm" />}
                    Invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-4">
          <Link href={`/verify?id=${tokenId.toString()}`} className="btn btn-outline btn-sm">
            Public Verify View
          </Link>
          <Link href="/" className="btn btn-ghost btn-sm">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}

function VaultContent() {
  const searchParams = useSearchParams();
  const tokenIdParam = searchParams.get("id");

  if (!tokenIdParam) {
    return <TokenIdForm />;
  }

  return <VaultDetail tokenId={BigInt(tokenIdParam)} />;
}

export default function VaultPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center grow pt-20"><span className="loading loading-spinner loading-lg" /></div>}>
      <VaultContent />
    </Suspense>
  );
}
