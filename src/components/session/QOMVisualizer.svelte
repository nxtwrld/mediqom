<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import * as d3 from 'd3';
  import { d3QOMData, qomActions, qomMetrics } from '$lib/session/stores/qom-execution-store';
  import { 
    QOM_VISUAL_CONFIG, 
    getNodeStyle, 
    getLinkStyle,
    getNodeRadius,
    TRANSITIONS,
    ZOOM_CONFIG
  } from './config/qom-visual-config';
  // Removed shouldAnimateNode import - not needed for CSS animations
  import type { D3QOMNode, D3QOMLink } from './types/qom';
  import { t } from '$lib/i18n';
  import QOMSimulationPanel from '$components/dev/QOMSimulationPanel.svelte';

  // Icon mapping for different node types
  function getNodeIcon(node: D3QOMNode): string {
    const iconMap: Record<string, string> = {
      'input': 'transcript',
      'detector': 'diagnosis',
      'primary': 'model-gp',
      'safety': 'encrypt',
      'consensus': 'checked',
      'output': 'registration-form'
    };
    return iconMap[node.type] || 'model-gp';
  }

  interface Props {
    sessionId?: string;
    width?: number;
    height?: number;
    enableZoom?: boolean;
    enableInteractions?: boolean;
    onnodeSelect?: (node: D3QOMNode) => void;
    onlinkSelect?: (link: D3QOMLink) => void;
  }

  let {
    sessionId = '',
    width = QOM_VISUAL_CONFIG.layout.width,
    height = QOM_VISUAL_CONFIG.layout.height,
    enableZoom = true,
    enableInteractions = true,
    onnodeSelect,
    onlinkSelect
  }: Props = $props();

  let container = $state<HTMLElement>();
  let svg: d3.Selection<SVGSVGElement, unknown, null, undefined>;
  let g: d3.Selection<SVGGElement, unknown, null, undefined>; // Main group for zoom/pan
  let zoom: d3.ZoomBehavior<SVGSVGElement, unknown>;
  
  // Track selected elements
  let selectedNode = $state<D3QOMNode | null>(null);
  let selectedLink = $state<D3QOMLink | null>(null);
  let hoveredNode = $state<D3QOMNode | null>(null);

  // Track last container dimensions to avoid unnecessary layout updates
  let lastWidth = 0;
  let lastHeight = 0;

  // No animation tracking needed - using CSS
  // Remove unused pulseIntervals reference
  const pulseIntervals = new Map<string, number>();

  onMount(() => {
    initializeVisualization();

    // Set container dimensions immediately after container is available
    if (container) {
      const actualWidth = container.clientWidth || width;
      const actualHeight = container.clientHeight || height;
      console.log('📐 Setting initial container dimensions:', { actualWidth, actualHeight });
      qomActions.updateLayoutDimensions(actualWidth, actualHeight);
      lastWidth = actualWidth;
      lastHeight = actualHeight;
    }

    // Initialize QOM for session if provided
    if (sessionId) {
      qomActions.initialize(sessionId);
    }

    // Subscribe to store changes after initialization
    const unsubscribe = d3QOMData.subscribe((data) => {
      console.log('📊 QOM data updated:', data);
      if (g && data) {
        console.log('📊 Updating visualization with', data.nodes.length, 'nodes and', data.links.length, 'links');
        updateVisualization(data);
      } else {
        console.log('📊 No data or no group element:', { hasG: !!g, hasData: !!data });
      }
    });

    // Add resize listener for responsive updates
    const handleResize = () => {
      if (container) {
        const actualWidth = container.clientWidth || width;
        const actualHeight = container.clientHeight || height;
        
        // Only update if dimensions actually changed
        if (actualWidth !== lastWidth || actualHeight !== lastHeight) {
          console.log('📐 Container resized:', { actualWidth, actualHeight });
          qomActions.updateLayoutDimensions(actualWidth, actualHeight);
          lastWidth = actualWidth;
          lastHeight = actualHeight;
        }
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cleanup();
      unsubscribe();
      window.removeEventListener('resize', handleResize);
    };
  });

  onDestroy(() => {
    cleanup();
  });

  function cleanup() {
    // No intervals to clear - using CSS animations
  }

  function initializeVisualization() {
    if (!container) return;

    // Create SVG - responsive to container
    svg = d3.select(container)
      .append('svg')
      .attr('viewBox', `0 0 ${width} ${height}`)  // Use viewBox for responsive scaling
      .attr('preserveAspectRatio', 'xMidYMid meet')  // Center and scale proportionally
      .attr('class', 'qom-svg');

    // Define arrow markers for links
    const defs = svg.append('defs');
    
    // Define arrow markers for each link type
    const arrowTypes = [
      { id: 'arrowhead-data_flow', fill: '#10B981' },
      { id: 'arrowhead-analysis_input', fill: '#3B82F6' },
      { id: 'arrowhead-safety_input', fill: '#EC4899' },
      { id: 'arrowhead-triggers', fill: '#3B82F6' },
      { id: 'arrowhead-refines', fill: '#EF4444' },
      { id: 'arrowhead-contributes', fill: '#6366F1' },
      { id: 'arrowhead-merges', fill: '#8B5CF6' },
      { id: 'arrowhead-bypass_flow', fill: '#FCD34D' }
    ];

    arrowTypes.forEach(arrow => {
      const marker = defs.append('marker')
        .attr('id', arrow.id)
        .attr('viewBox', '0 0 10 10')
        .attr('refX', '5')  // Position at tip
        .attr('refY', '5')   // Center vertically
        .attr('markerWidth', '15')  // Bigger arrow
        .attr('markerHeight', '15')
        .attr('orient', 'auto')
        .attr('markerUnits', 'userSpaceOnUse');  // Fixed size, not relative to stroke
        
      marker.append('path')
        .attr('d', 'M 0 0 L 10 5 L 0 10 z')  // Full triangle
        .attr('fill', arrow.fill);
    });

    // Create main group for zoom/pan
    g = svg.append('g')
      .attr('class', 'qom-main-group');

    // Setup zoom behavior
    if (enableZoom) {
      // Zoom filter function adapted from SankeyDiagram
      function zoomFilter(event: any): boolean {
        // Allow zoom on wheel, double-click, or multi-touch
        if (event.type === 'wheel') return true;
        if (event.type === 'dblclick') return true;
        if (event.touches?.length >= 2) return true; // Multi-touch pinch
        
        // For mouse/single touch, only allow if not on interactive elements
        const target = event.target as Element;
        const isInteractiveElement = 
            target.closest('.qom-node') ||
            target.closest('.qom-link') ||
            target.classList.contains('qom-node') ||
            target.classList.contains('qom-link');
        
        // Allow zoom/pan if not on interactive elements or if it's a right click
        return !isInteractiveElement || event.button === 2;
      }

      zoom = d3.zoom<SVGSVGElement, unknown>()
        .scaleExtent(ZOOM_CONFIG.scaleExtent)
        .wheelDelta((event) => {
          // Detect if this is a touchpad/trackpad
          let isTouchpad = false;
          
          if (event.ctrlKey) {
            // Mac touchpad pinch gesture
            isTouchpad = true;
          } else if (Math.abs(event.deltaY) < 50 && event.deltaY % 1 !== 0) {
            // Fractional deltaY values are common for touchpads
            isTouchpad = true;
          } else if ((event as any).wheelDeltaY && Math.abs((event as any).wheelDeltaY) % 3 === 0 && Math.abs((event as any).wheelDeltaY) !== 120) {
            // wheelDeltaY multiples of 3 (but not 120) indicate touchpad
            isTouchpad = true;
          }
          
          if (isTouchpad) {
            // Use touchDelta for touchpad events (make it more sensitive)
            return event.deltaY * ZOOM_CONFIG.wheelDelta * (1 + ZOOM_CONFIG.touchDelta * 10);
          } else {
            // Regular mouse wheel - use normal wheelDelta
            return event.deltaY * ZOOM_CONFIG.wheelDelta;
          }
        })
        .filter(zoomFilter)
        .on('zoom', (event) => {
          g.attr('transform', event.transform);
        });
      
      svg.call(zoom);
    }

    // Create groups for links and nodes (links first so they appear behind nodes)
    g.append('g').attr('class', 'qom-links');
    g.append('g').attr('class', 'qom-particles'); // For animated particles
    g.append('g').attr('class', 'qom-nodes');

    // No force simulation needed - using fixed positioning
  }

  function updateVisualization(data: { nodes: D3QOMNode[], links: D3QOMLink[] }) {
    if (!g || !container) return;

    // Use actual container dimensions or fallback to props
    const actualWidth = container.clientWidth || width;
    const actualHeight = container.clientHeight || height;

    // Update SVG viewBox to match container
    if (svg) {
      svg.attr('viewBox', `0 0 ${actualWidth} ${actualHeight}`);
    }

    // Use positions from the store (already calculated by layout engine)
    // If positions are missing, nodes will have x:0, y:0 from the store
    const nodesWithPositions = data.nodes.map(node => ({
      ...node,
      x: node.x || actualWidth / 2,  // Fallback to center if no position
      y: node.y || actualHeight / 2
    }));

    // Update links to use positioned nodes (filter out links with missing nodes)
    const linksWithPositions = data.links
      .map(link => {
        const sourceId = typeof link.source === 'string' ? link.source : link.source.id;
        const targetId = typeof link.target === 'string' ? link.target : link.target.id;
        const sourceNode = nodesWithPositions.find(n => n.id === sourceId);
        const targetNode = nodesWithPositions.find(n => n.id === targetId);
        
        if (sourceNode && targetNode) {
          return {
            ...link,
            source: sourceNode,
            target: targetNode
          };
        }
        return null;
      })
      .filter(link => link !== null) as D3QOMLink[];
    
    // Update links
    const linkSelection = g.select('.qom-links')
      .selectAll<SVGPathElement, D3QOMLink>('.qom-link')
      .data(linksWithPositions, d => d.id);

    // Exit
    linkSelection.exit()
      .transition()
      .duration(TRANSITIONS.linkExit.duration)
      .style('opacity', TRANSITIONS.linkExit.finalOpacity)
      .remove();

    // Enter
    const linkEnter = linkSelection.enter()
      .append('path')
      .attr('class', d => `qom-link link-${d.type}`)
      .attr('marker-end', d => `url(#arrowhead-${d.type})`);

    // Update + Enter
    const linkUpdate = linkEnter.merge(linkSelection);
    
    linkUpdate
      .attr('class', d => `qom-link link-${d.type}`)
      .attr('marker-end', d => `url(#arrowhead-${d.type})`)
      .attr('d', d => {
        // Calculate path using fixed positions
        const source = d.source as D3QOMNode;
        const target = d.target as D3QOMNode;
        if (!source || !target) return '';
        
        // Get panel dimensions
        const panelWidth = QOM_VISUAL_CONFIG.layout.panelWidth || 150;
        const panelHeight = QOM_VISUAL_CONFIG.layout.panelHeight || 60;
        const padding = 5; // Padding from edge to ensure arrow visibility
        
        // Helper function to get rectangle edge intersection point
        const getRectangleIntersection = (centerX: number, centerY: number, angle: number, fromSource: boolean) => {
          const halfWidth = (panelWidth / 2) + padding;
          const halfHeight = (panelHeight / 2) + padding;
          
          // Adjust angle for target (reverse direction)
          const adjustedAngle = fromSource ? angle : angle + Math.PI;
          const cos = Math.cos(adjustedAngle);
          const sin = Math.sin(adjustedAngle);
          const tanAngle = sin / cos;
          
          let x, y;
          
          // Check if line exits through horizontal (left/right) or vertical (top/bottom) edge
          if (Math.abs(tanAngle) <= halfHeight / halfWidth) {
            // Exits through left or right edge
            x = cos > 0 ? halfWidth : -halfWidth;
            y = x * tanAngle;
          } else {
            // Exits through top or bottom edge
            y = sin > 0 ? halfHeight : -halfHeight;
            x = y / tanAngle;
          }
          
          return {
            x: centerX + x,
            y: centerY + y
          };
        };
        
        // Calculate angle from source to target
        const dx = target.x - source.x;
        const dy = target.y - source.y;
        const angle = Math.atan2(dy, dx);
        
        let sourceX, sourceY, targetX, targetY;
        
        // Special handling for bypass flow - connect right edge to right edge
        if (d.type === 'bypass_flow') {
          const spacing = 10;
          
          // Connect from right edge of source to right edge of target
          sourceX = source.x + (panelWidth / 2) + spacing;
          sourceY = source.y;
          targetX = target.x + (panelWidth / 2) + spacing;
          targetY = target.y;
          
          // Calculate bypass arc that goes around the main flow
          const verticalDistance = Math.abs(targetY - sourceY);
          const arcRadius = verticalDistance * 0.4; // Arc extends 40% of vertical distance to the side
          
          // Create a smooth cubic bezier curve that arcs around
          const controlX = Math.max(sourceX, targetX) + arcRadius;
          const control1Y = sourceY + (verticalDistance * 0.25);
          const control2Y = targetY - (verticalDistance * 0.25);
          
          return `M${sourceX},${sourceY}C${controlX},${control1Y} ${controlX},${control2Y} ${targetX},${targetY}`;
        } else {
          // Calculate connection points on rectangle edges
          const sourcePoint = getRectangleIntersection(source.x, source.y, angle, true);
          const targetPoint = getRectangleIntersection(target.x, target.y, angle, false);
          
          sourceX = sourcePoint.x;
          sourceY = sourcePoint.y;
          targetX = targetPoint.x;
          targetY = targetPoint.y;
        }
        
        // For most connections, use straight lines to ensure correct arrow angles
        // Only add subtle curves for very long horizontal connections
        const distance = Math.sqrt(dx * dx + dy * dy);
        const isLongHorizontalLink = Math.abs(dx) > 200 && Math.abs(dy) < 100;
        
        if (d.direction === 'bidirectional' || d.type === 'refines') {
          // Special curved path for bidirectional/refines
          const dr = distance;
          return `M${sourceX},${sourceY}A${dr * 0.3},${dr * 0.3} 0 0,1 ${targetX},${targetY}`;
        } else if (isLongHorizontalLink) {
          // Add very subtle curve for long horizontal connections
          const midX = (sourceX + targetX) / 2;
          const midY = (sourceY + targetY) / 2;
          const subtleCurve = 5; // Very subtle 5px curve
          const curveY = midY + (dy > 0 ? subtleCurve : -subtleCurve);
          return `M${sourceX},${sourceY}Q${midX},${curveY} ${targetX},${targetY}`;
        } else {
          // Use straight lines for most connections to ensure proper arrow angles
          return `M${sourceX},${sourceY}L${targetX},${targetY}`;
        }
      })
      .on('click', handleLinkClick)
      .transition()
      .duration(TRANSITIONS.linkUpdate.duration)
      .style('opacity', d => getLinkStyle(d).opacity);

    // Update nodes
    const nodeSelection = g.select('.qom-nodes')
      .selectAll<SVGGElement, D3QOMNode>('.qom-node')
      .data(nodesWithPositions, d => d.id);

    // Exit
    nodeSelection.exit()
      .transition()
      .duration(TRANSITIONS.nodeExit.duration)
      .attr('transform', 'scale(0)')
      .style('opacity', TRANSITIONS.nodeExit.finalOpacity)
      .remove();

    // Enter
    const nodeEnter = nodeSelection.enter()
      .append('g')
      .attr('class', 'qom-node')
      .attr('transform', d => `translate(${d.x},${d.y}) scale(0)`);

    // Add invisible circle for link calculations
    nodeEnter.append('circle')
      .attr('class', 'qom-node-circle')
      .attr('r', d => getNodeRadius(d));

    // Add foreignObject for HTML content
    const panelWidth = QOM_VISUAL_CONFIG.layout.panelWidth || 150;
    const panelHeight = QOM_VISUAL_CONFIG.layout.panelHeight || 40;
    
    nodeEnter.append('foreignObject')
      .attr('class', 'qom-node-foreign')
      .attr('x', -panelWidth / 2)
      .attr('y', -panelHeight / 2)
      .attr('width', panelWidth)
      .attr('height', panelHeight)
      .html(d => `
        <div class="qom-node-panel qom-node-panel-${d.state}" data-node-id="${d.id}">
          <div class="qom-node-icon-wrapper">
            <svg class="qom-node-icon-svg" width="24" height="24">
              <use href="/icons-o.svg#${getNodeIcon(d)}"/>
            </svg>
          </div>
          <div class="qom-node-content">
            <div class="qom-node-name">${d.name}</div>
          </div>
        </div>
      `);

    // Update + Enter
    const nodeUpdate = nodeEnter.merge(nodeSelection);
    
    nodeUpdate
      .attr('class', d => `qom-node node-${d.state}`)
      .on('click', handleNodeClick)
      .on('mouseenter', handleNodeHover)
      .on('mouseleave', handleNodeLeave);

    // Update invisible circle for link calculations
    nodeUpdate.select('.qom-node-circle')
      .attr('r', d => getNodeRadius(d));

    // Update HTML content in foreignObject
    nodeUpdate.select('.qom-node-foreign')
      .html(d => `
        <div class="qom-node-panel qom-node-panel-${d.state}" data-node-id="${d.id}">
          <div class="qom-node-icon-wrapper">
            <svg class="qom-node-icon-svg" width="24" height="24">
              <use href="/icons-o.svg#${getNodeIcon(d)}"/>
            </svg>
          </div>
          <div class="qom-node-content">
            <div class="qom-node-name">${d.name}</div>
            ${d.state === 'running' ? '<div class="qom-node-status">Running...</div>' : ''}
            ${d.state === 'completed' ? '<div class="qom-node-status status-completed">✓</div>' : ''}
            ${d.state === 'failed' ? '<div class="qom-node-status status-failed">✗</div>' : ''}
          </div>
        </div>
      `);

    // Animate entering nodes with fixed positions
    nodeUpdate
      .transition()
      .duration(TRANSITIONS.nodeEnter.duration)
      .delay((d, i) => TRANSITIONS.nodeEnter.delay(d, i))
      .attr('transform', d => `translate(${d.x},${d.y}) scale(1)`);

    // Fixed positioning doesn't need to save positions to store

    // No particles needed - just visual states
  }

  // Removed complex animations - CSS handles everything

  // Drag functionality removed - using fixed positioning

  function handleNodeClick(event: MouseEvent, node: D3QOMNode) {
    event.stopPropagation();
    selectedNode = node;
    selectedLink = null;
    onnodeSelect?.(node);
  }

  function handleLinkClick(event: MouseEvent, link: D3QOMLink) {
    event.stopPropagation();
    selectedLink = link;
    selectedNode = null;
    onlinkSelect?.(link);
  }

  function handleNodeHover(_event: MouseEvent, node: D3QOMNode) {
    hoveredNode = node;
    
    // Highlight connected links
    g.selectAll<SVGPathElement, D3QOMLink>('.qom-link')
      .style('opacity', d => {
        const source = typeof d.source === 'object' ? d.source.id : d.source;
        const target = typeof d.target === 'object' ? d.target.id : d.target;
        return source === node.id || target === node.id ? 0.9 : 0.2;
      });
    
    // Dim non-connected nodes
    g.selectAll<SVGGElement, D3QOMNode>('.qom-node')
      .style('opacity', d => {
        if (d.id === node.id) return 1;
        
        // Check if connected
        const isConnected = $d3QOMData.links.some(link => {
          const source = typeof link.source === 'object' ? link.source.id : link.source;
          const target = typeof link.target === 'object' ? link.target.id : link.target;
          return (source === node.id && target === d.id) || 
                 (target === node.id && source === d.id);
        });
        
        return isConnected ? 0.8 : 0.3;
      });
  }

  function handleNodeLeave() {
    hoveredNode = null;
    
    // Reset opacity to default
    g.selectAll('.qom-link')
      .style('opacity', null);  // Let CSS handle default opacity
    
    g.selectAll('.qom-node')
      .style('opacity', 1);
  }

  // Reactive metrics display
  const metrics = $derived($qomMetrics);
</script>

<div class="qom-visualizer" bind:this={container}>
  {#if metrics}
    <div class="qom-metrics">
      <div class="metric">
        <span class="metric-label">{$t('session.qom.status')}:</span>
        <span class="metric-value status-{metrics.status}">{metrics.status}</span>
      </div>
      <div class="metric">
        <span class="metric-label">{$t('session.qom.nodes')}:</span>
        <span class="metric-value">
          {metrics.completedNodes}/{metrics.totalNodes}
        </span>
      </div>
      <div class="metric">
        <span class="metric-label">{$t('session.qom.cost')}:</span>
        <span class="metric-value">${metrics.totalCost.toFixed(4)}</span>
      </div>
      <div class="metric">
        <span class="metric-label">{$t('session.qom.duration')}:</span>
        <span class="metric-value">{(metrics.totalDuration / 1000).toFixed(1)}s</span>
      </div>
      
    </div>
  {/if}

  <!-- Development Simulation Panel -->
  <QOMSimulationPanel {sessionId} />
</div>

<style>
  /* QOM Node Circle - Hidden but used for link calculations */
  :global(.qom-node-circle) {
    fill: transparent;
    stroke: transparent;
    pointer-events: none;
  }

  /* QOM Node Panel Styles */
  :global(.qom-node-panel) {
    display: flex;
    align-items: center;
    gap: .5rem;
    padding: 4px;
    background: white;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    height: 100%;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    cursor: pointer;
    transition: all 0.2s ease;
  }

  :global(.qom-node-panel:hover) {
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.15);
    transform: translateY(-1px);
  }

  :global(.qom-node-icon-wrapper) {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    flex-shrink: 0;
  }

  :global(.qom-node-icon-svg) {
    width: 100%;
    height: 100%;
  }

  :global(.qom-node-icon-svg use) {
    fill: #6b7280;
  }

  :global(.qom-node-content) {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  :global(.qom-node-name) {
    font-size: 12px;
    font-weight: 500;
    color: #1f2937;
    white-space: normal;
    word-wrap: break-word;
    overflow: hidden;
    display: -webkit-box;
    -webkit-line-clamp: 3;
    line-clamp: 3;
    -webkit-box-orient: vertical;
    line-height: 1.3;
  }

  :global(.qom-node-status) {
    font-size: 10px;
    color: #6b7280;
  }

  :global(.qom-node-status.status-completed) {
    color: #10b981;
    font-weight: 600;
  }

  :global(.qom-node-status.status-failed) {
    color: #ef4444;
    font-weight: 600;
  }

  /* State-based panel styling */
  :global(.qom-node-panel-pending) {
    border-color: #e5e7eb;
    background: #fafafa;
  }

  :global(.qom-node-panel-pending .qom-node-icon-svg use) {
    fill: #9ca3af;
  }

  :global(.qom-node-panel-running) {
    border-color: #fbbf24;
    background: #fffbeb;
    animation: panel-pulse 2s ease-in-out infinite;
  }

  :global(.qom-node-panel-running .qom-node-icon-svg use) {
    fill: #f59e0b;
  }

  :global(.qom-node-panel-completed) {
    border-color: #10b981;
    background: #f0fdf4;
  }

  :global(.qom-node-panel-completed .qom-node-icon-svg use) {
    fill: #10b981;
  }

  :global(.qom-node-panel-failed) {
    border-color: #ef4444;
    background: #fef2f2;
  }

  :global(.qom-node-panel-failed .qom-node-icon-svg use) {
    fill: #ef4444;
  }

  @keyframes panel-pulse {
    0%, 100% {
      box-shadow: 0 1px 3px rgba(245, 158, 11, 0.2);
    }
    50% {
      box-shadow: 0 4px 12px rgba(245, 158, 11, 0.4);
    }
  }

  /* QOM Link Styles */
  :global(.qom-link) {
    fill: none;
    stroke-linecap: round;
    stroke-linejoin: round;
    cursor: pointer;
    transition: all 0.3s ease;
  }

  :global(.qom-link.link-data_flow) {
    stroke: #10B981;
    stroke-width: 3px;
    opacity: 0.8;
  }

  :global(.qom-link.link-analysis_input) {
    stroke: #3B82F6;
    stroke-width: 3px;
    opacity: 0.8;
  }

  :global(.qom-link.link-safety_input) {
    stroke: #EC4899;
    stroke-width: 3px;
    opacity: 0.8;
  }

  :global(.qom-link.link-triggers) {
    stroke: #3B82F6;
    stroke-width: 3px;
    opacity: 0.7;
  }

  :global(.qom-link.link-contributes) {
    stroke: #6366F1;
    stroke-width: 3px;
    opacity: 0.7;
  }

  :global(.qom-link.link-refines) {
    stroke: #EF4444;
    stroke-width: 3px;
    opacity: 0.7;
  }

  :global(.qom-link.link-merges) {
    stroke: #8B5CF6;
    stroke-width: 5px;
    opacity: 0.7;
  }



  :global(.qom-link.link-bypass_flow) {
    stroke: #FCD34D;
    stroke-width: 4px;
    stroke-dasharray: 10, 10;
    opacity: 0.6;
  }

  .qom-visualizer {
    width: 100%;
    height: 100%;
    min-height: 600px;  /* Ensure minimum height */
    position: relative;
    background: var(--color-surface, #fff);
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .qom-metrics {
    position: absolute;
    top: 10px;
    right: 10px;
    background: rgba(255, 255, 255, 0.95);
    border: 1px solid var(--color-border, #e2e8f0);
    border-radius: 6px;
    padding: 8px 12px;
    display: flex;
    gap: 16px;
    font-size: 12px;
    z-index: 10;
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
  }

  .metric {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .metric-label {
    color: var(--color-text-secondary, #6b7280);
    font-weight: 500;
  }

  .metric-value {
    color: var(--color-text-primary, #1f2937);
    font-weight: 600;
  }

  .metric-value.status-idle {
    color: #6b7280;
  }

  .metric-value.status-initializing {
    color: #3b82f6;
  }

  .metric-value.status-running {
    color: #f59e0b;
  }

  .metric-value.status-completed {
    color: #10b981;
  }

  .metric-value.status-failed {
    color: #ef4444;
  }

  :global(.qom-svg) {
    width: 100%;
    height: 100%;
    max-width: 100%;  /* Respect container width */
    display: block;   /* Remove inline-block spacing */
    touch-action: none; /* Let D3 handle all touch events */
  }

  :global(.qom-node) {
    cursor: pointer;
    transition: opacity 0.3s ease;
  }

  :global(.qom-node-circle) {
    transition: all 0.3s ease;
  }

  :global(.qom-node:hover .qom-node-circle) {
    filter: brightness(1.1);
  }



</style>