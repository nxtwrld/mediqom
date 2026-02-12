/**
 * D3 Sankey Rendering Functions
 * Handles the D3-specific rendering logic for the Sankey diagram
 */

import * as d3 from "d3";
import { sankey, sankeyLinkHorizontal } from "d3-sankey";
import type { SankeyNode, SankeyLink } from "../types/visualization";
import {
  OPACITY,
  COLORS,
  NODE_SIZE,
  LINK_CONFIG,
} from "../config/visual-config";
import { calculateNodeSize } from "./sankeyDataTransformer";

interface RenderContext {
  svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  mainGroup: d3.Selection<SVGGElement, unknown, null, undefined>;
  chartWidth: number;
  chartHeight: number;
  isMobile: boolean;
  htmlNodeWidth: number;
}

interface SankeyRenderResult {
  nodes: any[];
  links: any[];
}

/**
 * Render nodes with D3 enter/update/exit pattern
 */
export function renderNodes(
  context: RenderContext,
  nodes: SankeyNode[],
  handlers: {
    onClick: (event: MouseEvent | TouchEvent, node: SankeyNode) => void;
    onHover: (nodeId: string, isEntering: boolean) => void;
  },
): d3.Selection<any, any, any, any> {
  const { mainGroup } = context;

  // Get or create node group
  let nodeGroup = mainGroup.select<SVGGElement>(".node-group");
  if (nodeGroup.empty()) {
    nodeGroup = mainGroup.append("g").attr("class", "node-group");
  }

  // Data join with key function for stability
  const nodeSelection = nodeGroup
    .selectAll<SVGGElement, SankeyNode>(".node")
    .data(nodes, (d: SankeyNode) => d.id);

  // EXIT - Remove old nodes with transition
  nodeSelection
    .exit()
    .classed("exiting", true)
    .transition()
    .duration(3000)
    .style("opacity", 0)
    .remove();

  // ENTER - Add new nodes with transition
  const nodeEnter = nodeSelection
    .enter()
    .append("g")
    .attr("class", (d) => `node node-${d.type}`)
    .attr("data-node-id", (d) => d.id)
    .style("opacity", 0);

  // Add foreignObject for HTML content
  nodeEnter
    .append("foreignObject")
    .attr("class", "node-html")
    .attr("x", (d) => d.x0 || 0)
    .attr("y", (d) => d.y0 || 0)
    .attr("width", (d) => (d.x1 || 0) - (d.x0 || 0))
    .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0));

  // Transition new nodes in
  nodeEnter.transition().duration(3000).style("opacity", 1);

  // UPDATE - Update existing nodes (positions will be handled separately)
  const nodeUpdate = nodeSelection.merge(nodeEnter);

  // Update foreignObject positions for all nodes
  nodeUpdate
    .select("foreignObject")
    .attr("x", (d) => d.x0 || 0)
    .attr("y", (d) => d.y0 || 0)
    .attr("width", (d) => (d.x1 || 0) - (d.x0 || 0))
    .attr("height", (d) => (d.y1 || 0) - (d.y0 || 0));

  // Attach event handlers
  nodeUpdate
    .on("click", (event, d) => handlers.onClick(event, d))
    .on("mouseenter", (event, d) => handlers.onHover(d.id, true))
    .on("mouseleave", (event, d) => handlers.onHover(d.id, false));

  return nodeUpdate;
}

/**
 * Render links with D3 enter/update/exit pattern
 */
export function renderLinks(
  context: RenderContext,
  links: SankeyLink[],
  handlers: {
    onClick: (event: MouseEvent | TouchEvent, link: SankeyLink) => void;
    onHover: (link: any, isEntering: boolean) => void;
  },
): d3.Selection<any, any, any, any> {
  const { mainGroup } = context;

  // Get or create link group
  let linkGroup = mainGroup.select<SVGGElement>(".link-group");
  if (linkGroup.empty()) {
    linkGroup = mainGroup.append("g").attr("class", "link-group");
  }

  // Data join with composite key for stability
  const linkSelection = linkGroup
    .selectAll<SVGPathElement, SankeyLink>(".link")
    .data(links, (d: SankeyLink) => {
      const sourceId =
        typeof d.source === "object" ? (d.source as any).id : d.source;
      const targetId =
        typeof d.target === "object" ? (d.target as any).id : d.target;
      return `${sourceId}-${targetId}`;
    });

  // EXIT - Remove old links with transition
  linkSelection
    .exit()
    .classed("exiting", true)
    .transition()
    .duration(300)
    .style("opacity", 0)
    .remove();

  // ENTER - Add new links with transition
  const linkEnter = linkSelection
    .enter()
    .append("path")
    .attr("class", "link")
    .style("opacity", 0);

  // Set initial path
  linkEnter
    .attr("d", sankeyLinkHorizontal())
    .attr("stroke-width", (d) => Math.max(1, (d as any).width || 2));

  // Transition new links in
  linkEnter.transition().duration(300).style("opacity", OPACITY.DEFAULT_LINK);

  // UPDATE - Update existing links
  const linkUpdate = linkSelection.merge(linkEnter);

  // Update path for all links
  linkUpdate
    .attr("d", sankeyLinkHorizontal())
    .attr("stroke-width", (d) => Math.max(1, (d as any).width || 2))
    .attr("fill", "none")
    .attr("stroke", (d) => {
      const sourceNode = typeof d.source === "object" ? d.source : null;
      if (sourceNode && (sourceNode as any).type === "symptom") {
        return COLORS.NODES.SYMPTOM_TRANSCRIPT.replace("{intensity}", "1");
      } else if (sourceNode && (sourceNode as any).type === "diagnosis") {
        return COLORS.NODES.DIAGNOSIS.replace("{intensity}", "1");
      }
      return COLORS.NODES.TREATMENT.replace("{intensity}", "1");
    });

  // Attach event handlers
  linkUpdate
    .on("click", (event, d) => handlers.onClick(event, d))
    .on("mouseenter", (event, d) => handlers.onHover(d, true))
    .on("mouseleave", (event, d) => handlers.onHover(d, false));

  return linkUpdate;
}

/**
 * Calculate Sankey layout with custom positioning
 */
export function calculateSankeyLayout(
  nodes: SankeyNode[],
  links: SankeyLink[],
  context: RenderContext,
): SankeyRenderResult {
  const { chartWidth, chartHeight, isMobile, htmlNodeWidth } = context;

  // Create sankey generator
  const sankeyGenerator = sankey<SankeyNode, SankeyLink>()
    .nodeWidth(NODE_SIZE.NODE_WIDTH)
    .nodePadding(isMobile ? 8 : 12)
    .extent([
      [0, 0],
      [chartWidth, chartHeight],
    ])
    .nodeId((d) => d.id)
    .nodeSort((a, b) => {
      if (a.type === "symptom" && b.type === "symptom") {
        return (a.sortIndex || 0) - (b.sortIndex || 0);
      }
      return (b.value || 50) - (a.value || 50);
    });

  // Prepare data for D3
  const nodesForD3 = nodes.map((d) => ({
    ...d,
    sourceLinks: [],
    targetLinks: [],
    value: calculateNodeSize(d as any, isMobile),
  })) as any;

  const linksForD3 = links.map((d) => ({
    ...d,
    source: d.source,
    target: d.target,
    value: d.value || 1,
  })) as any;

  // Calculate layout
  const result = sankeyGenerator({
    nodes: nodesForD3,
    links: linksForD3,
  });

  // Apply custom column positioning
  const columnWidth = chartWidth / 3;
  const columnCenterX = [
    columnWidth * 0.5,
    columnWidth * 1.5,
    columnWidth * 2.5,
  ];

  const typeColumnMap = { symptom: 0, diagnosis: 1, treatment: 2 };

  if (result?.nodes) {
    result.nodes.forEach((node: any) => {
      const targetColumn =
        typeColumnMap[node.type as keyof typeof typeColumnMap] ?? 1;
      const centerX = columnCenterX[targetColumn];
      node.x0 = centerX - htmlNodeWidth / 2;
      node.x1 = centerX + htmlNodeWidth / 2;
    });

    // Position nodes within columns
    const nodesByColumn: {
      symptom: any[];
      diagnosis: any[];
      treatment: any[];
    } = {
      symptom: [],
      diagnosis: [],
      treatment: [],
    };

    result.nodes.forEach((node: any) => {
      if (nodesByColumn[node.type as keyof typeof nodesByColumn]) {
        nodesByColumn[node.type as keyof typeof nodesByColumn].push(node);
      }
    });

    Object.values(nodesByColumn).forEach((columnNodes: any[]) => {
      columnNodes.sort((a, b) => (b.value || 50) - (a.value || 50));

      let currentY = 20;
      columnNodes.forEach((node) => {
        const nodeHeight = Math.max(
          NODE_SIZE.MIN_HEIGHT_PX,
          node.value || NODE_SIZE.MIN_HEIGHT_PX,
        );
        node.y0 = currentY;
        node.y1 = currentY + nodeHeight;
        currentY = node.y1 + (isMobile ? 8 : 12);
      });
    });
  }

  return result as SankeyRenderResult;
}

/**
 * Update node positions with optional transition
 */
export function updateNodePositions(
  nodeSelection: d3.Selection<any, any, any, any>,
  withTransition: boolean = false,
) {
  const update = withTransition
    ? nodeSelection.transition().duration(500)
    : nodeSelection;

  (update as any)
    .select("foreignObject")
    .attr("x", (d: any) => d.x0 || 0)
    .attr("y", (d: any) => d.y0 || 0)
    .attr("width", (d: any) => (d.x1 || 0) - (d.x0 || 0))
    .attr("height", (d: any) => (d.y1 || 0) - (d.y0 || 0));
}

/**
 * Update link paths with optional transition
 */
export function updateLinkPaths(
  linkSelection: d3.Selection<any, any, any, any>,
  withTransition: boolean = false,
) {
  const update = withTransition
    ? linkSelection.transition().duration(500)
    : linkSelection;

  (update as any)
    .attr("d", sankeyLinkHorizontal())
    .attr("stroke-width", (d: any) => Math.max(1, d.width || 2));
}
