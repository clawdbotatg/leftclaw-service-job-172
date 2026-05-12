"use client";

import dynamic from "next/dynamic";

const HomeClient = dynamic(() => import("./HomeClient"), {
  ssr: false,
  loading: () => null,
});

export default function HomeWrapper() {
  return <HomeClient />;
}
