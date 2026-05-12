"use client";

import dynamic from "next/dynamic";

const CreateClient = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => null,
});

export default function CreateWrapper() {
  return <CreateClient />;
}
