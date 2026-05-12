"use client";

import dynamic from "next/dynamic";
import { ReactNode } from "react";

// This component renders nothing on the server and renders children only on the client.
// Use it to wrap components that depend on browser-only APIs (wagmi, etc.) to prevent
// SSR errors in `output: export` builds.

const NoSSRInner = ({ children }: { children: ReactNode }) => <>{children}</>;

const NoSSR = dynamic(() => Promise.resolve(NoSSRInner), {
  ssr: false,
  loading: () => null,
});

export default NoSSR;
