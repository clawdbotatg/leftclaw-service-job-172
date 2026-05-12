import React from "react";
import { SwitchTheme } from "~~/components/SwitchTheme";

/**
 * Site footer
 */
export const Footer = () => {
  return (
    <div className="min-h-0 py-5 px-1 mb-11 lg:mb-0">
      <div>
        <div className="fixed flex justify-end items-center w-full z-10 p-4 bottom-0 left-0 pointer-events-none">
          <SwitchTheme className="pointer-events-auto" />
        </div>
      </div>
      <div className="w-full">
        <div className="flex justify-center items-center text-sm text-base-content opacity-60">
          <p className="m-0 text-center">VaultID V3 — wallet-bound encrypted credentials on Base</p>
        </div>
      </div>
    </div>
  );
};
