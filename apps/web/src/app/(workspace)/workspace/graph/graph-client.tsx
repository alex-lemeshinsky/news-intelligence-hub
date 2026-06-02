"use client";

import { FormEvent, MouseEvent, useMemo, useState } from "react";
import ReactFlow, {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  type Edge,
  type Node,
  type OnError,
} from "reactflow";
import { DetailDrawer } from "@/components/workspace/detail-drawer";
import {
  ArticleDetailContent,
  EntityDetailContent,
} from "@/components/workspace/intelligence-detail-content";
import { browserApiFetch } from "@/lib/api/browser";
import { ApiError } from "@/lib/api/shared";
import type {
  ArticleDetail,
  Category,
  EntityDetail,
  GraphArticleNode,
  GraphEdge,
  GraphEntityNode,
  GraphNode,
  GraphNodeKind,
  GraphResponse,
} from "@/lib/api/types";

interface GraphClientProps {
  initialCategories: Category[];
  initialGraph: GraphResponse;
}

interface GraphFilters {
  categoryId?: string;
  nodeKind?: GraphNodeKind;
  search?: string;
  timeWindow?: "24h" | "7d" | "30d";
}

interface FlowNodeData {
  kind: GraphNode["kind"];
  label: string;
}

const FLOW_PRO_OPTIONS = { hideAttribution: true };
const handleReactFlowError: OnError = (id, message) => {
  if (id !== "002") {
    console.error(message);
  }
};

export function GraphClient({
  initialCategories,
  initialGraph,
}: GraphClientProps) {
  const [categories] = useState(initialCategories);
  const [graph, setGraph] = useState(initialGraph);
  const [filters, setFilters] = useState<GraphFilters>({});
  const [searchDraft, setSearchDraft] = useState("");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detailKind, setDetailKind] = useState<"article" | "entity" | null>(
    null,
  );
  const [articleDetail, setArticleDetail] = useState<ArticleDetail | null>(
    null,
  );
  const [entityDetail, setEntityDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const selectedNode =
    graph.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const flowNodes = useMemo(() => buildFlowNodes(graph.nodes), [graph.nodes]);
  const flowEdges = useMemo(() => buildFlowEdges(graph.edges), [graph.edges]);

  async function updateFilter<K extends keyof GraphFilters>(
    key: K,
    value: GraphFilters[K],
  ) {
    const nextFilters = {
      ...filters,
      [key]: value || undefined,
    };
    setFilters(nextFilters);
    await refreshGraph(nextFilters);
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextFilters = {
      ...filters,
      search: searchDraft.trim() || undefined,
    };
    setFilters(nextFilters);
    await refreshGraph(nextFilters);
  }

  async function refreshGraph(nextFilters = filters) {
    setPending(true);
    setError(null);
    try {
      const nextGraph = await browserApiFetch<GraphResponse>(
        graphPath(nextFilters),
      );
      setGraph(nextGraph);
      if (!nextGraph.nodes.some((node) => node.id === selectedNodeId)) {
        setSelectedNodeId(null);
      }
    } catch (refreshError) {
      setError(
        refreshError instanceof ApiError
          ? refreshError.message
          : "Graph refresh failed.",
      );
    } finally {
      setPending(false);
    }
  }

  async function openArticleDetail(articleLabelId: string) {
    setDetailKind("article");
    setArticleDetail(null);
    setEntityDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setArticleDetail(
        await browserApiFetch<ArticleDetail>(`/articles/${articleLabelId}`),
      );
    } catch (detailFetchError) {
      setDetailError(
        detailFetchError instanceof ApiError
          ? detailFetchError.message
          : "Article details failed to load.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function openEntityDetail(entityId: string) {
    setDetailKind("entity");
    setArticleDetail(null);
    setEntityDetail(null);
    setDetailLoading(true);
    setDetailError(null);
    try {
      setEntityDetail(
        await browserApiFetch<EntityDetail>(`/graph/entities/${entityId}`),
      );
    } catch (detailFetchError) {
      setDetailError(
        detailFetchError instanceof ApiError
          ? detailFetchError.message
          : "Entity details failed to load.",
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeDetailDrawer() {
    setDetailKind(null);
    setDetailError(null);
    setDetailLoading(false);
  }

  function selectFlowNode(_event: MouseEvent, node: Node<FlowNodeData>) {
    setSelectedNodeId(node.id);
    const graphNode = graph.nodes.find((item) => item.id === node.id);
    if (!graphNode) {
      return;
    }

    if (graphNode.kind === "article") {
      void openArticleDetail(graphNode.articleLabelId);
    } else {
      void openEntityDetail(graphNode.entityId);
    }
  }

  return (
    <main className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-2xl font-semibold text-slate-950">
                Relationship graph
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                Article and entity links from processed feed intelligence.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <Metric label="Nodes" value={graph.nodes.length} />
              <Metric label="Edges" value={graph.edges.length} />
              <Metric
                label="Entities"
                value={graph.nodes.filter((node) => node.kind === "entity").length}
              />
            </div>
          </div>
        </div>
        <GraphFiltersPanel
          categories={categories}
          filters={filters}
          pending={pending}
          searchDraft={searchDraft}
          setSearchDraft={setSearchDraft}
          submitSearch={submitSearch}
          updateFilter={updateFilter}
        />
      </section>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[520px] min-h-[460px] overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm md:h-[680px]">
          {graph.nodes.length > 0 ? (
            <ReactFlow
              edges={flowEdges}
              fitView
              maxZoom={1.5}
              minZoom={0.25}
              nodes={flowNodes}
              onError={handleReactFlowError}
              onNodeClick={selectFlowNode}
              proOptions={FLOW_PRO_OPTIONS}
            >
              <Background color="#cbd5e1" gap={22} />
              <Controls />
              <MiniMap
                maskColor="rgba(248, 250, 252, 0.72)"
                nodeColor={(node: Node<FlowNodeData>) =>
                  node.data.kind === "article" ? "#0f766e" : "#475569"
                }
                pannable
                zoomable
              />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-center">
              <div>
                <h2 className="text-base font-semibold text-slate-950">
                  No graph data
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
                  Processed articles with entity mentions will appear here.
                </p>
              </div>
            </div>
          )}
        </div>
        <GraphDetailPanel node={selectedNode} />
      </section>
      <DetailDrawer
        error={detailError}
        loading={detailLoading}
        onClose={closeDetailDrawer}
        open={detailKind !== null}
        subtitle={detailKind === "entity" ? "Entity card" : "Article card"}
        title={
          detailKind === "entity"
            ? entityDetail?.label ?? "Entity details"
            : articleDetail?.title ?? "Article details"
        }
      >
        {detailKind === "entity" && entityDetail ? (
          <EntityDetailContent
            detail={entityDetail}
            onOpenArticle={openArticleDetail}
            onOpenEntity={openEntityDetail}
          />
        ) : null}
        {detailKind === "article" && articleDetail ? (
          <ArticleDetailContent
            detail={articleDetail}
            onOpenArticle={openArticleDetail}
            onOpenEntity={openEntityDetail}
          />
        ) : null}
      </DetailDrawer>
    </main>
  );
}

function GraphFiltersPanel({
  categories,
  filters,
  pending,
  searchDraft,
  setSearchDraft,
  submitSearch,
  updateFilter,
}: {
  categories: Category[];
  filters: GraphFilters;
  pending: boolean;
  searchDraft: string;
  setSearchDraft: (value: string) => void;
  submitSearch: (event: FormEvent<HTMLFormElement>) => void;
  updateFilter: <K extends keyof GraphFilters>(
    key: K,
    value: GraphFilters[K],
  ) => Promise<void>;
}) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-950">Filters</h2>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <SelectFilter
          disabled={pending}
          label="Node type"
          value={filters.nodeKind ?? ""}
          onChange={(value) =>
            updateFilter("nodeKind", value as GraphNodeKind | undefined)
          }
          options={[
            { label: "Articles", value: "article" },
            { label: "Entities", value: "entity" },
          ]}
        />
        <SelectFilter
          disabled={pending}
          label="Category"
          value={filters.categoryId ?? ""}
          onChange={(value) => updateFilter("categoryId", value)}
          options={categories.map((category) => ({
            label: category.name,
            value: category.id,
          }))}
        />
        <SelectFilter
          disabled={pending}
          label="Period"
          value={filters.timeWindow ?? ""}
          onChange={(value) =>
            updateFilter("timeWindow", value as GraphFilters["timeWindow"])
          }
          options={[
            { label: "Last 24h", value: "24h" },
            { label: "Last 7d", value: "7d" },
            { label: "Last 30d", value: "30d" },
          ]}
        />
        <form className="block" onSubmit={submitSearch}>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Search</span>
            <div className="mt-1 flex gap-2">
              <input
                className="h-9 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100"
                value={searchDraft}
                onChange={(event) => setSearchDraft(event.currentTarget.value)}
              />
              <button
                className="h-9 rounded-md bg-slate-950 px-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                disabled={pending}
                type="submit"
              >
                Apply
              </button>
            </div>
          </label>
        </form>
      </div>
    </aside>
  );
}

function GraphDetailPanel({ node }: { node: GraphNode | null }) {
  return (
    <aside className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-base font-semibold text-slate-950">Details</h2>
      {node ? (
        node.kind === "article" ? (
          <ArticleNodeDetails node={node} />
        ) : (
          <EntityNodeDetails node={node} />
        )
      ) : (
        <p className="mt-3 text-sm leading-6 text-slate-500">
          No node selected.
        </p>
      )}
    </aside>
  );
}

function ArticleNodeDetails({ node }: { node: GraphArticleNode }) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-medium text-emerald-700">Article</p>
        <h3 className="mt-1 text-lg font-semibold leading-6 text-slate-950">
          {node.label}
        </h3>
        {node.publishedAt ? (
          <p className="mt-1 text-xs text-slate-500">
            {formatDate(node.publishedAt)}
          </p>
        ) : null}
      </div>
      {node.summary ? (
        <p className="text-sm leading-6 text-slate-600">{node.summary}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {node.importance ? (
          <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
            {node.importance.toLowerCase()}
          </span>
        ) : null}
        {node.categories.map((category) => (
          <span
            className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
            key={category.id}
          >
            {category.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function EntityNodeDetails({ node }: { node: GraphEntityNode }) {
  return (
    <div className="mt-4 space-y-4">
      <div>
        <p className="text-xs font-medium text-slate-500">
          {node.entityType.toLowerCase()}
        </p>
        <h3 className="mt-1 text-lg font-semibold leading-6 text-slate-950">
          {node.label}
        </h3>
      </div>
      {node.description ? (
        <p className="text-sm leading-6 text-slate-600">{node.description}</p>
      ) : null}
      <dl className="grid grid-cols-2 gap-3">
        <DetailMetric label="Mentions" value={node.articleCount} />
        <DetailMetric label="Aliases" value={node.aliases.length} />
      </dl>
      {node.aliases.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {node.aliases.map((alias) => (
            <span
              className="rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700"
              key={alias}
            >
              {alias}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="min-w-20 rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-lg font-semibold leading-none text-slate-950">
        {value}
      </p>
      <p className="mt-1 text-xs font-medium text-slate-500">{label}</p>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-1 text-base font-semibold text-slate-950">{value}</dd>
    </div>
  );
}

function SelectFilter({
  disabled,
  label,
  onChange,
  options,
  value,
}: {
  disabled: boolean;
  label: string;
  onChange: (value: string | undefined) => void;
  options: Array<{
    label: string;
    value: string;
  }>;
  value: string;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <select
        className="mt-1 h-9 w-full rounded-md border border-slate-300 bg-white px-2 text-sm text-slate-800 outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:text-slate-400"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value || undefined)}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function buildFlowNodes(nodes: GraphNode[]): Node<FlowNodeData>[] {
  const articleNodes = nodes.filter((node) => node.kind === "article");
  const entityNodes = nodes.filter((node) => node.kind === "entity");
  const onlyOneKind = articleNodes.length === 0 || entityNodes.length === 0;

  return nodes.map((node, index) => {
    const group = node.kind === "article" ? articleNodes : entityNodes;
    const groupIndex = group.findIndex((item) => item.id === node.id);
    const x = onlyOneKind ? (index % 3) * 280 : node.kind === "article" ? 0 : 420;
    const y = onlyOneKind
      ? Math.floor(index / 3) * 160
      : groupIndex * 150 + (node.kind === "entity" ? 40 : 0);

    return {
      data: {
        kind: node.kind,
        label: node.label,
      },
      id: node.id,
      position: { x, y },
      style:
        node.kind === "article"
          ? {
              background: "#ecfdf5",
              border: "1px solid #99f6e4",
              borderRadius: 8,
              color: "#0f172a",
              fontSize: 12,
              fontWeight: 600,
              maxWidth: 220,
              padding: 10,
              width: 220,
            }
          : {
              background: "#f8fafc",
              border: "1px solid #cbd5e1",
              borderRadius: 8,
              color: "#0f172a",
              fontSize: 12,
              fontWeight: 600,
              maxWidth: 200,
              padding: 10,
              width: 200,
            },
    };
  });
}

function buildFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    animated: edge.kind === "co_mention",
    data: edge,
    id: edge.edgeId,
    label: edgeLabel(edge),
    markerEnd: {
      color: edge.kind === "mentions" ? "#0f766e" : "#64748b",
      type: MarkerType.ArrowClosed,
    },
    source: edge.fromNodeId,
    style: {
      stroke: edge.kind === "mentions" ? "#0f766e" : "#64748b",
      strokeWidth: edge.kind === "co_mention" ? 2 : 1.5,
    },
    target: edge.toNodeId,
    type: edge.kind === "co_mention" ? "straight" : "smoothstep",
  }));
}

function edgeLabel(edge: GraphEdge): string {
  if (edge.kind === "co_mention") {
    return edge.weight ? `co-mentioned ${edge.weight}` : "co-mentioned";
  }
  if (edge.kind === "similar") {
    return edge.score === null ? "similar" : `similar ${edge.score}`;
  }
  return "mentions";
}

function graphPath(filters: GraphFilters): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) {
      params.set(key, value);
    }
  }

  const query = params.toString();
  return query ? `/graph?${query}` : "/graph";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(value));
}
