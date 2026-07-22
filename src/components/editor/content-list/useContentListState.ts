import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";

import {
  contentListQuerySchema,
  type ContentListQuery,
  type ContentStatus,
} from "@/features/website-cms/domain/content";

export function useContentListState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initial = useMemo(
    () =>
      contentListQuerySchema.parse({
        status: searchParams.get("status") ?? undefined,
        search: searchParams.get("search") ?? undefined,
        sort: searchParams.get("sort") ?? undefined,
        page: numberParam(searchParams.get("page")),
        pageSize: numberParam(searchParams.get("pageSize")),
      }),
    // Initial values are intentionally read once; later changes are made through
    // the setters below so browser history stays predictable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [query, setQuery] = useState<ContentListQuery>(initial);
  const [searchInput, setSearchInput] = useState(initial.search);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery((current) =>
        current.search === searchInput
          ? current
          : { ...current, search: searchInput, page: 1 },
      );
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const next = new URLSearchParams();
    if (query.status !== "all") next.set("status", query.status);
    if (query.search) next.set("search", query.search);
    if (query.sort !== "updated_desc") next.set("sort", query.sort);
    if (query.page !== 1) next.set("page", String(query.page));
    if (query.pageSize !== 20) next.set("pageSize", String(query.pageSize));
    setSearchParams(next, { replace: true });
  }, [query, setSearchParams]);

  return {
    query,
    searchInput,
    setSearchInput,
    setStatus: (status: ContentStatus | "all") =>
      setQuery((current) => ({ ...current, status, page: 1 })),
    setSort: (sort: ContentListQuery["sort"]) =>
      setQuery((current) => ({ ...current, sort, page: 1 })),
    setPage: (page: number) =>
      setQuery((current) => ({ ...current, page: Math.max(1, page) })),
    setPageSize: (pageSize: ContentListQuery["pageSize"]) =>
      setQuery((current) => ({ ...current, pageSize, page: 1 })),
  };
}

function numberParam(value: string | null): number | undefined {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
