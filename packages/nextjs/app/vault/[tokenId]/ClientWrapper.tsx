"use client";

import dynamic from "next/dynamic";

const VaultDetailClient = dynamic(() => import("./VaultDetailClient"), {
  ssr: false,
  loading: () => null,
});

export default function ClientWrapper() {
  return <VaultDetailClient />;
}
