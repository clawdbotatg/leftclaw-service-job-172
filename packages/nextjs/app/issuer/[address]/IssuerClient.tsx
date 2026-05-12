"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import type { NextPage } from "next";
import { Address } from "@scaffold-ui/components";
import { useScaffoldEventHistory, useScaffoldReadContract } from "~~/hooks/scaffold-eth";

const CRED_TYPE_LABELS = ["VAULT", "MEMBERSHIP", "CREDENTIAL", "PASS", "RECEIPT", "DOCUMENT"];

const IssuerProfile: NextPage = () => {
  const params = useParams();
  const issuerAddress = (params?.address as string) ?? "";

  // Read issuer data
  const { data: issuerData, isLoading: issuerLoading } = useScaffoldReadContract({
    contractName: "VaultIDV3",
    functionName: "issuers",
    args: [issuerAddress as `0x${string}`],
    query: { enabled: Boolean(issuerAddress) },
  });

  // Read VaultMinted events filtered by issuer
  const { data: mintEvents, isLoading: eventsLoading } = useScaffoldEventHistory({
    contractName: "VaultIDV3",
    eventName: "VaultMinted",
    fromBlock: 45915955n,
    filters: { issuer: issuerAddress as `0x${string}` },
    watch: false,
  });

  if (issuerLoading) {
    return (
      <div className="flex justify-center items-center grow pt-20">
        <span className="loading loading-spinner loading-lg" />
      </div>
    );
  }

  const issuerName = issuerData?.[0];
  const isVerified = issuerData?.[1];
  const isActive = issuerData?.[2];
  const hasProfile = Boolean(issuerName);

  return (
    <div className="flex items-center flex-col grow pt-10 pb-20">
      <div className="px-5 max-w-2xl w-full">
        <h1 className="text-3xl font-bold mb-6">Issuer Profile</h1>

        {/* Issuer Info Card */}
        <div className="card bg-base-100 shadow-xl mb-6">
          <div className="card-body">
            <div className="flex items-start justify-between flex-wrap gap-3">
              <div>
                <h2 className="card-title text-xl">
                  {hasProfile ? issuerName : "Unknown Issuer"}
                </h2>
                <div className="mt-2">
                  <Address address={issuerAddress as `0x${string}`} />
                </div>
              </div>
              <div className="flex flex-col gap-2 items-end">
                {isVerified && <span className="badge badge-success">Verified Issuer</span>}
                {isActive !== undefined && (
                  <span className={`badge ${isActive ? "badge-success badge-outline" : "badge-error badge-outline"}`}>
                    {isActive ? "Active" : "Inactive"}
                  </span>
                )}
                {!hasProfile && (
                  <span className="badge badge-neutral badge-outline">No registered profile</span>
                )}
              </div>
            </div>

            {!hasProfile && (
              <p className="opacity-60 text-sm mt-2">
                This address has not registered as an issuer but may have issued credentials.
              </p>
            )}
          </div>
        </div>

        {/* Issued Credentials */}
        <div className="card bg-base-100 shadow-xl">
          <div className="card-body">
            <h2 className="card-title text-lg mb-4">Issued Credentials</h2>

            {eventsLoading ? (
              <div className="flex justify-center py-8">
                <span className="loading loading-spinner loading-md" />
              </div>
            ) : !mintEvents || mintEvents.length === 0 ? (
              <p className="opacity-60 text-sm text-center py-8">No credentials issued by this address found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table table-zebra">
                  <thead>
                    <tr>
                      <th>Token ID</th>
                      <th>Type</th>
                      <th>Owner</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mintEvents.map(event => {
                      const tokenId = event.args?.tokenId?.toString() ?? "—";
                      const credTypeRaw = event.args?.credType ?? 0;
                      const owner = event.args?.owner;
                      const credLabel = CRED_TYPE_LABELS[Number(credTypeRaw)] ?? "UNKNOWN";

                      return (
                        <tr key={`${event.transactionHash}-${event.logIndex}`}>
                          <td className="font-mono">#{tokenId}</td>
                          <td>
                            <span className="badge badge-outline badge-sm">{credLabel}</span>
                          </td>
                          <td>{owner ? <Address address={owner} /> : "—"}</td>
                          <td>
                            <div className="flex gap-1">
                              <Link href={`/vault/${tokenId}`} className="btn btn-xs btn-outline">
                                Vault
                              </Link>
                              <Link href={`/verify/${tokenId}`} className="btn btn-xs btn-ghost">
                                Verify
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="mt-6">
          <Link href="/" className="btn btn-ghost btn-sm">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default IssuerProfile;
