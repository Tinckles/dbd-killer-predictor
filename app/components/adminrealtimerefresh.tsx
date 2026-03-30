"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export default function AdminRealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    const supabase = createBrowserSupabaseClient();

    const redemptionsChannel = supabase
      .channel("admin-redemptions-live")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "redemptions",
        },
        () => {
          router.refresh();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(redemptionsChannel);
    };
  }, [router]);

  return null;
}