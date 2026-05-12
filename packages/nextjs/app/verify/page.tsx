"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Address } from "@scaffold-ui/components";
import { useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const CRED_TYPE_LABELS = ["VAULT", "MEMBERSHIP", "CREDENTIAL", "PASS", "RECEIPT", "DOCUMENT"];

function TokenIdForm() {
  const [inputId, setInputId] = useState("");
  return (
    <div className="flex items-center flex-col grow pt-10 pb-20">
      <div className="px-5 max-w-lg w-full">
        <h1 className="text-3xl font-bold mb-6">Verify Credential</h1>
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h3 className="font-semibold mb-2">Enter a token ID to verify</h3>
            <div className="flex gap-2">
              <input
                type="number"
                className="input input-bordered flex-1"
                placeholder="Token ID"
                value={inputId}
                onChange={e => setInputId(e.target.value)}
                onKeyDown={e =>
                  e.key === "Enter" && inputId.trim() && (window.location.href = `/verify?id=${inputId.trim()}`)
                }
              />
              <button
                className="btn btn-primary"
                onClick={() => inputId.trim() && (window.location.href = `/verify?id=${inputId.trim()}`)}
              >
                Check
              </button>
            </div>
            <div className="mt-2">
              <Link href="/" className="btn btn-ghost btn-sm">
                Home
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerifyDetail({ tokenId }: { tokenId: bigint }) {
  const [checkTokenId, setCheckTokenId] = useState("");

  const { data: vaultData, isLoading: vaultLoading, isError: vaultError } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "vaults",
    args: [tokenId],
  });

  const { data: isValid, isLoading: validLoading } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "isValid",
    args: [tokenId],
  });

  const issuerAddress = vaultData?.[5];
  const hasIssuer = issuerAddress && issuerAddress !== "0x0000000000000000000000000000000000000000";

  const { data: issuerData } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "issuers",
    args: [issuerAddress as `0x${string}`],
    query: { enabled: Boolean(hasIssuer) },
  });

  const handleCheck = () => {
    if (checkTokenId.trim()) {
      window.location.href = `/verify?id=${checkTokenId.trim()}`;
    }
  };

  const isLoading = vaultLoading || validLoading;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center grow pt-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  if (vaultError || !vaultData) {
    return (
      <div className="flex items-center flex-col grow pt-10 pb-20">
        <div className="px-5 max-w-lg w-full">
          <h1 className="text-3xl font-bold mb-6">Verify Credential</h1>

          <div className="card bg-base-100 shadow-xl mb-6">
            <div className="card-body text-center">
              <h2 className="card-title justify-center">Token Not Found</h2>
              <p className="opacity-70">Token #{tokenId.toString()} does not exist or has been burned.</p>
              <div className="badge badge-error mx-auto mt-2">BURNED / NOT FOUND</div>
            </div>
          </div>

          <div className="card bg-base-100 shadow-xl">
            <div className="card-body">
              <h3 className="font-semibold mb-2">Check another credential</h3>
              <div className="flex gap-2">
                <input
                  type="number"
                  className="input input-bordered flex-1"
                  placeholder="Token ID"
                  value={checkTokenId}
                  onChange={e => setCheckTokenId(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleCheck()}
                />
                <button className="btn btn-primary" onClick={handleCheck}>
                  Check
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const [, , expiry, revoked, credTypeRaw, issuer] = vaultData;
  const credTypeLabel = CRED_TYPE_LABELS[credTypeRaw] ?? "UNKNOWN";
  const expiryTs = Number(expiry);
  const isExpired = expiryTs > 0 && expiryTs < Math.floor(Date.now() / 1000);

  const getStatusBadge = () => {
    if (revoked) return <span className="badge badge-error badge-lg">REVOKED</span>;
    if (isExpired) return <span className="badge badge-warning badge-lg">EXPIRED</span>;
    if (isValid) return <span className="badge badge-success badge-lg">VALID</span>;
    return <span className="badge badge-neutral badge-lg">UNKNOWN</span>;
  };

  const getStatusDescription = () => {
    if (revoked) return "This credential has been revoked by its issuer or owner.";
    if (isExpired) return "This credential has expired and is no longer valid.";
    if (isValid) return "This credential is currently valid.";
    return "Status cannot be determined.";
  };

  return (
    <div className="flex items-center flex-col grow pt-10 pb-20">
      <div className="px-5 max-w-lg w-full">
        <h1 className="text-3xl font-bold mb-2">Credential Verification</h1>
        <p className="opacity-60 mb-6 text-sm">Public view — no wallet required</p>

        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="flex items-center justify-between mb-4">
              <h2 className="card-title">Token #{tokenId.toString()}</h2>
              {getStatusBadge()}
            </div>

            <p className="opacity-70 text-sm mb-4">{getStatusDescription()}</p>

            <div className="divider" />

            <div className="grid grid-cols-1 gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Credential Type</span>
                <span className="badge badge-outline badge-lg w-fit">{credTypeLabel}</span>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-sm opacity-60">Issuer</span>
                {hasIssuer ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <Address address={issuer} />
                    {issuerData?.[0] && <span className="text-sm font-semibold">({issuerData[0]})</span>}
                    {issuerData?.[1] && <span className="badge badge-success badge-sm">Verified</span>}
                    <Link href={`/issuer?addr=${issuer}`} className="btn btn-xs btn-ghost">
                      Issuer Profile
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
                <span className="text-sm opacity-60">Revocation Status</span>
                <span className={revoked ? "text-error" : "text-success"}>{revoked ? "Revoked" : "Not Revoked"}</span>
              </div>
            </div>

            <div className="mt-4">
              <Link href={`/vault?id=${tokenId.toString()}`} className="btn btn-outline btn-sm">
                Full Vault Details
              </Link>
            </div>
          </div>
        </div>

        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h3 className="font-semibold mb-2">Check another credential</h3>
            <div className="flex gap-2">
              <input
                type="number"
                className="input input-bordered flex-1"
                placeholder="Token ID"
                value={checkTokenId}
                onChange={e => setCheckTokenId(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleCheck()}
              />
              <button className="btn btn-primary" onClick={handleCheck}>
                Check
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function VerifyContent() {
  const searchParams = useSearchParams();
  const tokenIdParam = searchParams.get("id");

  if (!tokenIdParam) {
    return <TokenIdForm />;
  }

  return <VerifyDetail tokenId={BigInt(tokenIdParam)} />;
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="flex justify-center items-center grow pt-20"><span className="loading loading-spinner loading-lg" /></div>}>
      <VerifyContent />
    </Suspense>
  );
}
