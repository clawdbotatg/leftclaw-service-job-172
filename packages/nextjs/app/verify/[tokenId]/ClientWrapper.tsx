"use client";

import dynamic from "next/dynamic";

const VerifyClient = dynamic(() => import("./VerifyClient"), {
  ssr: false,
  loading: () => null,
});

export default function ClientWrapper() {
  return <VerifyClient />;
}
