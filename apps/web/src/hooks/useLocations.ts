import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { api } from "../api/client";
import { SEED_TERRITORIES } from "../constants/territories";
import { useSessionStore } from "../store/sessionStore";

export type LocationFilterValue =
  { kind: "territory"; id: number } | { kind: "locality"; id: number };

/**
 * Territories + localities for location filters and cylinder registration.
 * Falls back to seed territories if the masters endpoints are unavailable.
 */
export function useLocations() {
  const territoryScopes = useSessionStore(
    (s) => s.user?.territory_scopes ?? [],
  );

  const territoriesQuery = useQuery({
    queryKey: ["territories"],
    queryFn: () =>
      api.listTerritories({ limit: 200, "filter[is_active]": "true" }),
    staleTime: 60_000,
  });

  const localitiesQuery = useQuery({
    queryKey: ["localities"],
    queryFn: () => api.listLocalities({ limit: 200 }),
    staleTime: 60_000,
  });

  return useMemo(() => {
    const apiTerritories = territoriesQuery.data?.data ?? [];
    const territories =
      apiTerritories.length > 0
        ? apiTerritories.map((t) => ({ id: t.id, name: t.name }))
        : territoryScopes.length > 0
          ? territoryScopes
          : ([...SEED_TERRITORIES] as Array<{ id: number; name: string }>);

    const localities = [...(localitiesQuery.data?.data ?? [])].sort((a, b) => {
      const byClients = (b.client_count ?? 0) - (a.client_count ?? 0);
      if (byClients !== 0) return byClients;
      return a.name.localeCompare(b.name, "es");
    });

    const territoryNameById = new Map(territories.map((t) => [t.id, t.name]));
    const localityNameById = new Map(localities.map((l) => [l.id, l.name]));

    const territoryLabel = (id: number | null | undefined): string => {
      if (id == null) return "—";
      return territoryNameById.get(id) ?? `#${id}`;
    };

    const localityLabel = (id: number | null | undefined): string => {
      if (id == null) return "—";
      return localityNameById.get(id) ?? `#${id}`;
    };

    const encodeFilter = (value: LocationFilterValue | null): string => {
      if (!value) return "";
      return `${value.kind}:${value.id}`;
    };

    const decodeFilter = (raw: string): LocationFilterValue | null => {
      if (!raw) return null;
      const [kind, idRaw] = raw.split(":");
      const id = Number(idRaw);
      if (
        (kind !== "territory" && kind !== "locality") ||
        !Number.isFinite(id)
      ) {
        return null;
      }
      return { kind, id };
    };

    return {
      territories,
      localities,
      territoryLabel,
      localityLabel,
      encodeFilter,
      decodeFilter,
      isLoading: territoriesQuery.isLoading || localitiesQuery.isLoading,
      isError: territoriesQuery.isError || localitiesQuery.isError,
      refetch: async () => {
        await Promise.all([
          territoriesQuery.refetch(),
          localitiesQuery.refetch(),
        ]);
      },
    };
  }, [
    territoriesQuery.data,
    territoriesQuery.isLoading,
    territoriesQuery.isError,
    territoriesQuery.refetch,
    localitiesQuery.data,
    localitiesQuery.isLoading,
    localitiesQuery.isError,
    localitiesQuery.refetch,
    territoryScopes,
  ]);
}

/** @deprecated Prefer useLocations — kept for pages that only need territory labels. */
export function useTerritories() {
  const { territories, territoryLabel: label } = useLocations();
  return { territories, label };
}
