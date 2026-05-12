"use client";

import dynamic from "next/dynamic";

const IssuerClient = dynamic(() => import("./IssuerClient"), {
  ssr: false,
  loading: () => null,
});

export default function ClientWrapper() {
  return <IssuerClient />;
}
