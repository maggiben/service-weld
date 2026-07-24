"use client";

import { Suspense } from "react";
import RatesPage from "@/views/RatesPage";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <RatesPage />
    </Suspense>
  );
}
