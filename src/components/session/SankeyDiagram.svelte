<script lang="ts">
    import { onMount, onDestroy, untrack } from 'svelte';
    import * as d3 from 'd3';
    import type { SankeyNode, SankeyLink, NodeSelectEvent, LinkSelectEvent } from './types/visualization';
    import { 
        handleNodeClick,
        handleLinkClick,
        handleCanvasClick,
        handleNodeHover,
        handleLinkHover
    } from './utils/sankeyEventHandlers';
    import { 
        buildFocusableNodesList,
        updateNodeFocus,
        focusNextNode, 
        focusPreviousNode,
        selectFocusedNode,
        updateSelectionState
    } from './utils/sankeyFocus';
    import { createNodeComponent, cleanupNodeComponents } from './utils/sankeyHelpers';
    import {
        DEFAULT_ZOOM_CONFIG,
        createZoomBehavior,
        constrainTransform,
        zoomIn,
        zoomOut,
        resetZoom,
        zoomToFit,
        panBy
    } from './utils/zoomSankey';
    import { sankey, sankeyLinkHorizontal } from 'd3-sankey';
    import { OPACITY, NODE_SIZE, LINK_CONFIG, applyParallelLinkSpacing, getLinkPathGenerator, createEnhancedLinkGenerator, calculateLinkWidth } from './config/visual-config';
    import LinkTooltip from './LinkTooltip.svelte';
    import { sessionDataActions, sankeyDataFiltered as sankeyData, hiddenCounts, thresholds } from '$lib/session/stores/session-data-store';
    import { 
        activePath, 
        hoveredItem, 
        selectedItem, 
        sessionViewerActions
    } from '$lib/session/stores/session-viewer-store';
    import type { DocumentStoreInstance } from '$lib/session/stores/session-store-manager';

    // Transition configuration for smooth vertical position animations
    // Horizontal positions change immediately to avoid confusion, only Y positions animate
    const TRANSITION_CONFIG = {
        POSITION: {
            duration: 800,
            easing: d3.easeCubicInOut,
            stagger: 50
        },
        SIZE: {
            duration: 600,
            easing: d3.easeCubicOut
        },
        PATH: {
            duration: 700,
            easing: d3.easeCubicInOut
        },
        BUTTON: {
            fadeOut: 200,
            fadeIn: 300,
            easing: d3.easeCubicOut
        },
        MOBILE: {
            duration: 400, // Faster on mobile for better performance
            easing: d3.easeCubicOut,
            fadeOut: 150,
            fadeIn: 250
        }
    };
    import ZoomControls from './ZoomControls.svelte';
    import { t } from '$lib/i18n';

    interface Props {
        isMobile?: boolean;
        storeInstance?: DocumentStoreInstance; // Optional isolated store instance for document viewing
        // All data now comes from stores, no reactive props
        onnodeSelect?: (event: CustomEvent<NodeSelectEvent>) => void;
        onlinkSelect?: (event: CustomEvent<LinkSelectEvent>) => void;
        onselectionClear?: (event: CustomEvent) => void;
        onfocusChange?: (event: CustomEvent<{ index: number }>) => void;
    }

    let { 
        isMobile = false,
        storeInstance = undefined,
        onnodeSelect,
        onlinkSelect,
        onfocusChange
    }: Props = $props();

    // Helper functions to get actions (isolated or global)
    const getDataActions = () => storeInstance ? storeInstance.dataStore.actions : sessionDataActions;
    const getViewerActions = () => storeInstance ? storeInstance.viewerStore.actions : sessionViewerActions;

    // Use isolated stores when provided, otherwise fall back to global stores
    const sankeyDataStore = storeInstance ? storeInstance.dataStore.sankeyDataFiltered : sankeyData;
    const hiddenCountsStore = storeInstance ? storeInstance.dataStore.hiddenCounts : hiddenCounts;
    const thresholdsStore = storeInstance ? storeInstance.dataStore.thresholds : thresholds;
    const activePathStore = storeInstance ? storeInstance.viewerStore.activePath : activePath;
    const hoveredItemStore = storeInstance ? storeInstance.viewerStore.hoveredItem : hoveredItem;
    const selectedItemStore = storeInstance ? storeInstance.viewerStore.selectedItem : selectedItem;
    
    const currentSankeyData = $derived($sankeyDataStore);
    const currentHiddenCounts = $derived($hiddenCountsStore);
    const currentThresholds = $derived($thresholdsStore);
    const currentActivePath = $derived($activePathStore);
    const currentHoveredItem = $derived($hoveredItemStore);
    const currentSelectedItem = $derived($selectedItemStore);
    
    // Update selectedNodeId to use conditional stores
    const selectedNodeId = $derived(currentSelectedItem?.type === 'node' ? currentSelectedItem.id : null);

    let container = $state<HTMLElement>();
    let svg = $state<d3.Selection<SVGSVGElement, unknown, null, undefined>>();
    let width = 800;  // Non-reactive to prevent triggering effects
    let height = 600; // Non-reactive to prevent triggering effects

    /**
     * Calculate column positions and dimensions for show-more buttons
     * Need to use the actual D3 sankey layout results, not the original data
     */
    function calculateColumnPositions() {
        if (!svg) return { symptomColumn: null, diagnosisColumn: null, treatmentColumn: null };

        // Get the actual rendered nodes from D3 (these have x0, x1, y0, y1 coordinates)
        const allNodes = svg.selectAll<SVGGElement, any>('.node').data();

        if (!allNodes || allNodes.length === 0) {
            return { symptomColumn: null, diagnosisColumn: null, treatmentColumn: null };
        }

        const symptomNodes = allNodes.filter((n) => n.type === 'symptom');
        const diagnosisNodes = allNodes.filter((n) => n.type === 'diagnosis');
        const treatmentNodes = allNodes.filter((n) => n.type === 'treatment');

        const calculateColumnInfo = (nodes: any[]) => {
            if (!nodes.length) return null;
            
            const positions = nodes.map(n => ({
                x: (n.x0 + n.x1) / 2, // Center X of node
                bottom: n.y1 // Bottom Y of node
            }));
            
            return {
                centerX: positions.reduce((sum, p) => sum + p.x, 0) / positions.length,
                bottomY: Math.max(...positions.map(p => p.bottom))
            };
        };

        const result = {
            symptomColumn: calculateColumnInfo(symptomNodes),
            diagnosisColumn: calculateColumnInfo(diagnosisNodes), 
            treatmentColumn: calculateColumnInfo(treatmentNodes)
        };

        // Column positions calculated
        return result;
    }

    // Column positions are now calculated on-demand in renderShowMoreButtons to ensure fresh DOM state
    // Subscribe only to the specific values we need (avoid reading the entire store)
    $effect(() => {
        const activePathData = currentActivePath;
        const hoveredItemData = currentHoveredItem;
        
        
        // Calculate hover path if needed - hover takes precedence over active selection
        let hoverHighlight = null;
        if (hoveredItemData && hoveredItemData.type === 'node') {
            // Use the same path calculation method as selection for consistency
            const pathResult = getDataActions().calculatePath(hoveredItemData.id);
            hoverHighlight = pathResult?.path || null;
            
        }
        
        // Apply the highlighting: hover takes precedence, then active path
        // When hover is cleared, active path will be restored
        updateSelectionState(activePathData, hoverHighlight, svg || null, isMobile, selectedNodeId);
    });
    let tooltipData = $state<{
        relationshipType: string;
        relationshipLabel: string;
        actions: any[];
        visible: boolean;
        x: number;
        y: number;
    }>({
        relationshipType: '',
        relationshipLabel: '',
        actions: [],
        visible: false,
        x: 0,
        y: 0
    });
    let nodeComponents = $state(new Map<string, { component: any, container: HTMLDivElement }>());
    let resizeTimeout = $state<ReturnType<typeof setTimeout> | null>(null);
    let resizeObserver = $state<ResizeObserver | null>(null);
    let focusableNodes = $state<SankeyNode[]>([]);
    let focusedNodeIndex = $state<number>(-1);
    let zoom = $state<d3.ZoomBehavior<SVGSVGElement, unknown> | null>(null);
    let currentZoomTransform = $state<d3.ZoomTransform>(d3.zoomIdentity);
    let linkGroup = $state<d3.Selection<SVGGElement, unknown, null, undefined>>();
    let nodeGroup = $state<d3.Selection<SVGGElement, unknown, null, undefined>>();
    
    // Zoom configuration from imported defaults
    const ZOOM_CONFIG = DEFAULT_ZOOM_CONFIG;
    
    // Responsive margins based on screen size
    const margins = {
        top: isMobile ? 10 : 20,
        right: isMobile ? 5 : 15,
        bottom: isMobile ? 10 : 20,
        left: isMobile ? 5 : 15
    };

    // Derive focused node ID efficiently  
    const focusedNodeId = $derived(
        focusedNodeIndex >= 0 && focusedNodeIndex < focusableNodes.length
            ? focusableNodes[focusedNodeIndex].id
            : null
    );

    onMount(() => {
        // Use requestAnimationFrame to ensure DOM is ready
        requestAnimationFrame(() => {
            initializeSankey();
            // Initial render after SVG is created
            if (currentSankeyData) {
                renderSankey();
                focusableNodes = buildFocusableNodesList(currentSankeyData);
                renderShowMoreButtons();
            }
        });
        
        // Set up ResizeObserver for container
        if (container) {
            resizeObserver = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    if (resizeTimeout) clearTimeout(resizeTimeout);
                    resizeTimeout = setTimeout(() => {
                        handleContainerResize(entry.contentRect);
                    }, 150);
                }
            });
            resizeObserver.observe(container);
        }
        
        // Add keyboard event listeners for zoom shortcuts
        const handleKeyDown = (event: KeyboardEvent) => {
            // Only handle shortcuts when container is focused or contains active element
            if (!container?.contains(document.activeElement) && document.activeElement !== container) {
                return;
            }

            if (event.ctrlKey || event.metaKey) {
                switch (event.key) {
                    case '+':
                    case '=':
                        event.preventDefault();
                        if (zoom && svg) {
                            svg.transition().duration(300).call(
                                zoom.scaleBy, 1.2
                            );
                        }
                        break;
                    case '-':
                        event.preventDefault();
                        if (zoom && svg) {
                            svg.transition().duration(300).call(
                                zoom.scaleBy, 0.8
                            );
                        }
                        break;
                    case '0':
                        event.preventDefault();
                        if (zoom && svg) {
                            svg.transition().duration(750).call(
                                zoom.transform, d3.zoomIdentity
                            );
                        }
                        break;
                }
            } else {
                switch (event.key) {
                    case 'f':
                        event.preventDefault();
                        if (zoom && svg) {
                            svg.transition().duration(750).call(
                                zoom.transform, d3.zoomIdentity
                            );
                        }
                        break;
                    case 'ArrowUp':
                        event.preventDefault();
                        panByDirection(0, -50);
                        break;
                    case 'ArrowDown':
                        event.preventDefault();
                        panByDirection(0, 50);
                        break;
                    case 'ArrowLeft':
                        event.preventDefault();
                        panByDirection(-50, 0);
                        break;
                    case 'ArrowRight':
                        event.preventDefault();
                        panByDirection(50, 0);
                        break;
                }
            }
        };
        
        document.addEventListener('keydown', handleKeyDown);
        
        return () => {
            if (resizeTimeout) clearTimeout(resizeTimeout);
            if (resizeObserver) {
                resizeObserver.disconnect();
            }
            document.removeEventListener('keydown', handleKeyDown);
        };
    });

    onDestroy(() => {
        // Clean up dynamically mounted node components using Svelte 5 unmount()
        if (nodeComponents) {
            cleanupNodeComponents(nodeComponents);
        }
    });

    // Data transformation is now handled by the store - no local effects needed

    // React to data structure changes (full re-render only when data changes)
    // Track a data version/hash to detect actual changes
    let previousDataHash = '';
    
    $effect(() => {
        const data = currentSankeyData;
        const currentSvg = untrack(() => svg);
        
        // Data change detected
        
        // Create a simple hash of the data to detect changes
        const dataHash = data ? JSON.stringify({
            nodeCount: data.nodes?.length || 0,
            linkCount: data.links?.length || 0,
            nodeIds: data.nodes?.map((n: SankeyNode) => n.id).join(',') || ''
        }) : '';
        
        // Check if data hash changed
        
        // Only process changes if data actually changed (not on initial mount, handled in onMount)
        if (currentSvg && data && dataHash !== previousDataHash && previousDataHash !== '') {
            // Processing data change - always use smooth transitions after initialization
            
            // First, fade out existing buttons immediately
            const buttonConfig = isMobile ? TRANSITION_CONFIG.MOBILE : TRANSITION_CONFIG.BUTTON;
            if (svg) {
                svg.selectAll('.show-more-button-group')
                    .transition()
                    .duration(buttonConfig.fadeOut)
                    .ease(buttonConfig.easing)
                    .style('opacity', 0);
            }
            
            updateSankeyLayout();
            focusableNodes = buildFocusableNodesList(currentSankeyData);
            
            // Update button positions after transitions complete and fade them in
            const transitionDuration = isMobile ? TRANSITION_CONFIG.MOBILE.duration : TRANSITION_CONFIG.POSITION.duration;
            setTimeout(() => {
                renderShowMoreButtons();
                
                // Fade in the new buttons
                if (svg) {
                    svg.selectAll('.show-more-button-group')
                        .style('opacity', 0)
                        .transition()
                        .duration(buttonConfig.fadeIn)
                        .ease(buttonConfig.easing)
                        .style('opacity', 1);
                }
            }, transitionDuration + 50); // Add small buffer
            previousDataHash = dataHash;
        } else if (data && dataHash !== previousDataHash) {
            // Update hash without re-rendering (for initial mount case)
            previousDataHash = dataHash;
        }
    });
    
    // Container resize is handled by ResizeObserver calling handleContainerResize
    // No need for a separate effect here


    // React to focus changes with efficient DOM updates
    $effect(() => {
        if (svg) {
            focusedNodeIndex = updateNodeFocus(focusedNodeId, svg, focusableNodes, onfocusChange);
        }
    });

    function initializeSankey() {
        if (!container) return;
        
        // Use both methods to ensure we get the correct width
        const bounds = container.getBoundingClientRect();
        width = Math.max(bounds.width, container.offsetWidth || 0);
        height = Math.max(bounds.height, container.offsetHeight || 0);
        

        // Clear any existing SVG
        d3.select(container).selectAll('*').remove();

        svg = d3.select(container)
            .append('svg')
            .attr('width', '100%')
            .attr('height', '100%')
            .attr('viewBox', `0 0 ${width} ${height}`)
            .attr('preserveAspectRatio', 'xMidYMid meet')
            .classed('draggable-surface', true)
            .on('click', (event: MouseEvent) => handleCanvasClick(event, getViewerActions()));

        // Create constrain function with current parameters
        const constrainFn = (transform: d3.ZoomTransform) => 
            constrainTransform(transform, width, height, margins, currentSankeyData, isMobile);

        // Enhanced zoom and pan for all devices
        zoom = createZoomBehavior(
            ZOOM_CONFIG,
            handleZoom,
            handleZoomStart,
            handleZoomEnd,
            constrainFn
        );

        // Configure touch gestures for all devices
        zoom.touchable(() => true);

        svg.call(zoom);

        // Main group for all elements
        const mainGroup = svg.append('g')
            .attr('class', 'main-group')
            .attr('transform', `translate(${margins.left}, ${margins.top})`)
            .on('click', (event: MouseEvent) => handleCanvasClick(event, getViewerActions()));
            
        // Initialize groups for links and nodes
        linkGroup = mainGroup.append('g').attr('class', 'link-group');
        nodeGroup = mainGroup.append('g').attr('class', 'node-group');
    }

    function renderSankey() {
        
        if (!svg || !currentSankeyData) {
            console.warn('Missing svg or currentSankeyData:', { svg: !!svg, currentSankeyData: !!currentSankeyData });
            return;
        }
        
        // Clean up previous dynamically mounted node components using Svelte 5 unmount()
        if (nodeComponents) {
            cleanupNodeComponents(nodeComponents);
        }

        // Validate data structure
        if (!currentSankeyData || !currentSankeyData.nodes || !Array.isArray(currentSankeyData.nodes)) {
            console.error('Invalid sankeyData or nodes:', currentSankeyData);
            return;
        }
        
        if (!currentSankeyData.links || !Array.isArray(currentSankeyData.links)) {
            console.error('Invalid links data:', currentSankeyData.links);
            return;
        }


        const chartWidth = width - margins.left - margins.right;
        const chartHeight = height - margins.top - margins.bottom;

        // Fixed HTML node dimensions (won't scale with SVG)
        const htmlNodeWidth = isMobile ? 120 : 160;
        
        // Use full available width with equal spacing
        const availableWidth = chartWidth;
        const columnWidth = availableWidth / 3; // Three equal columns
        const columnCenterX = [
            columnWidth * 0.5,    // Center of first column
            columnWidth * 1.5,    // Center of second column  
            columnWidth * 2.5     // Center of third column
        ];
        
        // For D3 Sankey calculations, use a small nodeWidth since we override positioning
        const sankeyNodeWidth = 50; // Just for D3's internal calculations
        
        const sankeyGenerator = sankey<SankeyNode, SankeyLink>()
            .nodeWidth(sankeyNodeWidth)
            .nodePadding(isMobile ? 8 : 12)
            .extent([[0, 0], [chartWidth, chartHeight]])
            .nodeId(d => d.id)
            .nodeSort((a: SankeyNode, b: SankeyNode) => {
                // For symptoms, preserve the pre-sorted order using sortIndex
                if (a.type === 'symptom' && b.type === 'symptom') {
                    return (a.sortIndex || 0) - (b.sortIndex || 0);
                }
                // For other node types, sort by calculated value (descending)
                return (b.value || 50) - (a.value || 50);
            });

        // Transform data for D3 with error handling
        let sankeyResult: any;
        try {
            const nodesForD3 = currentSankeyData.nodes.map((d: any) => ({
                ...d,
                // Ensure all required properties exist
                sourceLinks: [],
                targetLinks: [],
                // Use our calculated node value for height (default to 50 if not set)
                value: d.value || 50
            }));

            const linksForD3 = currentSankeyData.links.map((d: any) => ({ 
                ...d,
                // Ensure source and target are properly set
                source: d.source,
                target: d.target,
                value: d.value || 1
            }));


            sankeyResult = sankeyGenerator({
                nodes: nodesForD3,
                links: linksForD3
            });


            // Override D3's positioning to force correct column placement and height
            if (sankeyResult && sankeyResult.nodes) {
                sankeyResult.nodes.forEach((node: any) => {
                    // Force correct column positioning
                    const typeColumnMap = { symptom: 0, diagnosis: 1, treatment: 2 };
                    const targetColumn = typeColumnMap[node.type as keyof typeof typeColumnMap] ?? 1;
                    
                    // Center nodes in their columns with fixed HTML dimensions
                    const centerX = columnCenterX[targetColumn];
                    node.x0 = centerX - (htmlNodeWidth / 2);
                    node.x1 = centerX + (htmlNodeWidth / 2);
                });

                // Sort nodes by type and value within each column, then position them
                const nodesByColumn: { symptom: any[], diagnosis: any[], treatment: any[] } = { 
                    symptom: [], 
                    diagnosis: [], 
                    treatment: [] 
                };
                sankeyResult.nodes.forEach((node: any) => {
                    if (nodesByColumn[node.type as keyof typeof nodesByColumn]) {
                        nodesByColumn[node.type as keyof typeof nodesByColumn].push(node);
                    }
                });

                // Position nodes within each column based on their calculated value
                Object.values(nodesByColumn).forEach((columnNodes: any[]) => {
                    columnNodes.sort((a, b) => (b.value || 50) - (a.value || 50)); // Highest value first
                    
                    let currentY = 20; // Start with some padding
                    columnNodes.forEach((node) => {
                        // Ensure minimum height using our configured value
                        const calculatedHeight = node.value || NODE_SIZE.MIN_HEIGHT_PX;
                        const nodeHeight = Math.max(NODE_SIZE.MIN_HEIGHT_PX, calculatedHeight);
                        
                        node.y0 = currentY;
                        node.y1 = currentY + nodeHeight;
                        currentY = node.y1 + (isMobile ? 8 : 12); // Add padding between nodes
                    });
                });

                // Update link positions to match our overridden node positions with proper height distribution
                if (sankeyResult.links) {
                    // Group links by source node to calculate positioning
                    const linksBySource = new Map<string, any[]>();
                    const linksByTarget = new Map<string, any[]>();
                    
                    sankeyResult.links.forEach((link: any) => {
                        const sourceId = typeof link.source === 'object' ? link.source.id : link.source;
                        const targetId = typeof link.target === 'object' ? link.target.id : link.target;
                        
                        if (!linksBySource.has(sourceId)) linksBySource.set(sourceId, []);
                        if (!linksByTarget.has(targetId)) linksByTarget.set(targetId, []);
                        
                        linksBySource.get(sourceId)!.push(link);
                        linksByTarget.get(targetId)!.push(link);
                    });
                    
                    // Sort links by target node Y position to prevent crossing
                    linksBySource.forEach((links) => {
                        links.sort((a, b) => {
                            const aTargetY = (typeof a.target === 'object' ? a.target.y0 : 
                                sankeyResult.nodes.find((n: any) => n.id === a.target)?.y0) || 0;
                            const bTargetY = (typeof b.target === 'object' ? b.target.y0 : 
                                sankeyResult.nodes.find((n: any) => n.id === b.target)?.y0) || 0;
                            return aTargetY - bTargetY;
                        });
                    });
                    
                    // Sort links by source node Y position for target-side positioning
                    linksByTarget.forEach((links) => {
                        links.sort((a, b) => {
                            const aSourceY = (typeof a.source === 'object' ? a.source.y0 : 
                                sankeyResult.nodes.find((n: any) => n.id === a.source)?.y0) || 0;
                            const bSourceY = (typeof b.source === 'object' ? b.source.y0 : 
                                sankeyResult.nodes.find((n: any) => n.id === b.source)?.y0) || 0;
                            return aSourceY - bSourceY;
                        });
                    });
                    
                    sankeyResult.links.forEach((link: any) => {
                        const sourceNode = sankeyResult.nodes.find((n: any) => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
                        const targetNode = sankeyResult.nodes.find((n: any) => n.id === (typeof link.target === 'object' ? link.target.id : link.target));
                        
                        if (sourceNode && targetNode) {
                            // Set link to connect to proper node positions
                            link.source = sourceNode;
                            link.target = targetNode;
                            
                            // Calculate link height based on strength/value relative to total node connections
                            const sourceLinks = linksBySource.get(sourceNode.id) || [];
                            const targetLinks = linksByTarget.get(targetNode.id) || [];
                            
                            const totalSourceValue = sourceLinks.reduce((sum, l) => sum + (l.value || 1), 0);
                            const totalTargetValue = targetLinks.reduce((sum, l) => sum + (l.value || 1), 0);
                            
                            // Calculate proportional height for this link with gaps
                            const sourceHeight = sourceNode.y1 - sourceNode.y0;
                            const targetHeight = targetNode.y1 - targetNode.y0;
                            
                            // Define gap size between links (responsive)
                            const linkGap = isMobile ? 2 : 3;
                            const availableSourceHeight = sourceHeight * 0.8; // 80% of node height for links
                            const availableTargetHeight = targetHeight * 0.8;
                            
                            // Calculate total gap space needed
                            const sourceTotalGaps = Math.max(0, sourceLinks.length - 1) * linkGap;
                            const targetTotalGaps = Math.max(0, targetLinks.length - 1) * linkGap;
                            
                            // Remaining height after gaps for actual links
                            const sourceLinkSpace = availableSourceHeight - sourceTotalGaps;
                            const targetLinkSpace = availableTargetHeight - targetTotalGaps;
                            
                            const sourceLinkHeight = Math.max(1, (link.value || 1) / totalSourceValue * sourceLinkSpace);
                            const targetLinkHeight = Math.max(1, (link.value || 1) / totalTargetValue * targetLinkSpace);
                            
                            link.width = Math.min(sourceLinkHeight, targetLinkHeight);
                            
                            // Position links within their respective nodes based on sorted order
                            const sourceIndex = sourceLinks.indexOf(link);
                            const targetIndex = targetLinks.indexOf(link);
                            
                            const sourceStartY = sourceNode.y0 + (sourceHeight * 0.1); // 10% padding from top
                            const targetStartY = targetNode.y0 + (targetHeight * 0.1);
                            
                            let sourceY = sourceStartY;
                            let targetY = targetStartY;
                            
                            // Calculate cumulative position including gaps
                            for (let i = 0; i < sourceIndex; i++) {
                                const prevLink = sourceLinks[i];
                                const prevLinkHeight = Math.max(1, (prevLink.value || 1) / totalSourceValue * sourceLinkSpace);
                                sourceY += prevLinkHeight + linkGap;
                            }
                            
                            for (let i = 0; i < targetIndex; i++) {
                                const prevLink = targetLinks[i];
                                const prevLinkHeight = Math.max(1, (prevLink.value || 1) / totalTargetValue * targetLinkSpace);
                                targetY += prevLinkHeight + linkGap;
                            }
                            
                            link.y0 = sourceY + link.width / 2;
                            link.y1 = targetY + link.width / 2;
                        }
                    });
                }
            }

        } catch (error) {
            console.error('Error in D3 Sankey generation:', error);
            return;
        }

        if (!sankeyResult || !sankeyResult.nodes || !sankeyResult.links) {
            console.error('Invalid sankeyResult:', sankeyResult);
            return;
        }

        // Apply parallel link spacing before rendering
        applyParallelLinkSpacing(sankeyResult.links);

        // Get the appropriate link path generator
        const baseLinkGenerator: ((link: any) => string | null) = LINK_CONFIG.ALGORITHM === 'default'
            ? sankeyLinkHorizontal<any, any>()
            : getLinkPathGenerator(LINK_CONFIG.ALGORITHM, LINK_CONFIG.RENDER_MODE);

        // Create enhanced generator that handles parallel links
        const linkPathGenerator: (link: any) => string = LINK_CONFIG.ALGORITHM === 'default'
            ? (link: any) => sankeyLinkHorizontal<any, any>()(link) || ''
            : createEnhancedLinkGenerator(getLinkPathGenerator(LINK_CONFIG.ALGORITHM, LINK_CONFIG.RENDER_MODE));

        // Render links
        if (!linkGroup) return;

        const linkSelection = linkGroup
            .selectAll<SVGPathElement, any>('.link')
            .data(sankeyResult.links, (d: any) => `${d.source.id}-${d.target.id}`);

        const linkEnter = linkSelection.enter()
            .append('path')
            .attr('class', (d: any) => {
                const relType = (d.type || 'default').toLowerCase().replace(/\s+/g, '_');
                return `link rel-${relType}`;
            })
            .style('opacity', 0);

        // Coordinate link opacity with entrance animations
        const linkEntranceConfig = isMobile ? TRANSITION_CONFIG.MOBILE : TRANSITION_CONFIG.PATH;
        linkEnter.transition()
            .duration(linkEntranceConfig.duration * 0.4) // Shorter opacity transition
            .delay(linkEntranceConfig.duration * 0.3) // Start after nodes begin moving
            .ease(d3.easeCubicOut)
            .style('opacity', OPACITY.DEFAULT_LINK);

        linkSelection.merge(linkEnter)
            .attr('id', (d: any) => {
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                return `link-${sourceId}-${targetId}`;
            })
            .attr('data-source-id', (d: any) => typeof d.source === 'object' ? d.source.id : d.source)
            .attr('data-target-id', (d: any) => typeof d.target === 'object' ? d.target.id : d.target)
            .attr('d', (d: any) => {
                // Use configured link generator or fall back to D3's default
                if (LINK_CONFIG.ALGORITHM === 'default') {
                    const result = sankeyLinkHorizontal<any, any>()(d);
                    return result || '';
                }
                return linkPathGenerator(d) || '';
            })
            .classed('interactive-element', true)
            .each(function(d: any) {
                d3.select(this).classed(getLinkStrengthClass(d.width || 2), true);
            })
            .attr('data-relationship-type', (d: any) => d.type || 'default')
            .on('click', (event: MouseEvent, d: any) => handleLinkClick(event, d, onlinkSelect))
            .on('touchstart', (event: TouchEvent, d: any) => handleLinkClick(event, d, onlinkSelect))
            .on('mouseenter', (_, d: any) => handleLinkHover(d, true, svg || null, tooltipData, getViewerActions(), container))
            .on('mouseleave', (_, d: any) => handleLinkHover(d, false, svg || null, tooltipData, getViewerActions(), container));

        linkSelection.exit()
            .transition()
            .duration(300)
            .style('opacity', 0)
            .remove();

        // Render nodes
        if (!nodeGroup) return;

        const nodeSelection = nodeGroup
            .selectAll<SVGGElement, any>('.node')
            .data(sankeyResult.nodes, (d: any) => d.id);

        const nodeEnter = nodeSelection.enter()
            .append('g')
            .attr('class', 'node')
            .attr('id', (d: any) => `node-${d.id}`)
            .attr('data-node-id', (d: any) => d.id)
            .attr('data-node-type', (d: any) => d.type)
            .classed('interactive-element', true)
            .style('opacity', 0);

        // Coordinate node opacity with entrance animations  
        const nodeEntranceConfig = isMobile ? TRANSITION_CONFIG.MOBILE : TRANSITION_CONFIG.POSITION;
        nodeEnter.transition()
            .duration(nodeEntranceConfig.duration * 0.3) // Quick opacity fade-in
            .delay(100) // Small delay to let position animation start first
            .ease(d3.easeCubicOut)
            .style('opacity', 1);

        // Node HTML content using foreignObject
        nodeEnter
            .append('foreignObject')
            .attr('class', 'node-html')
            .merge(nodeSelection.select('.node-html') as any)
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', htmlNodeWidth)
            .attr('height', (d: any) => d.y1! - d.y0!)
            .attr('data-node-id', (d: any) => d.id)
            .classed('interactive-element', true)
            .html((d: any) => createNodeComponent(d, selectedNodeId, isMobile, nodeComponents))
            .on('click', (event: MouseEvent, d: any) => handleNodeClick(event, d, getViewerActions(), onnodeSelect))
            .on('touchstart', (event: TouchEvent, d: any) => handleNodeClick(event, d, getViewerActions(), onnodeSelect))
            .on('mouseenter', (_, d: any) => {
                const allNodeArrays = [currentSankeyData?.nodes || []].flat();
                handleNodeHover(d.id, true, svg || null, allNodeArrays, getViewerActions());
            })
            .on('mouseleave', (_, d: any) => {
                const allNodeArrays = [currentSankeyData?.nodes || []].flat();
                handleNodeHover(d.id, false, svg || null, allNodeArrays, getViewerActions());
            });

        // Priority indicators are now included in HTML content

        // Update positions and attributes for both new and existing nodes
        const allNodes = nodeSelection.merge(nodeEnter as any)
            .attr('id', (d: any) => `node-${d.id}`)
            .attr('data-node-id', (d: any) => d.id)
            .attr('data-node-type', (d: any) => d.type);

        // Set initial positions for new nodes at correct horizontal position
        // Only animate opacity and vertical positioning
        allNodes.attr('transform', (d: any) => `translate(${d.x0}, ${d.y0})`);

        // Update show-more buttons after nodes are positioned
        setTimeout(() => {
            renderShowMoreButtons();
        }, 100);

        nodeSelection.exit()
            .transition()
            .duration(300)
            .style('opacity', 0)
            .remove();
    }







    /**
     * Render show-more buttons as SVG foreignObjects positioned under each column
     */
    function renderShowMoreButtons() {
        if (!svg) return;

        const mainGroup = svg.select('.main-group');
        if (mainGroup.empty()) return;
        
        // Use requestAnimationFrame to ensure DOM has updated with new nodes
        requestAnimationFrame(() => {
            // Recalculate positions based on current DOM state
            const currentPositions = calculateColumnPositions();
            if (!currentPositions) return;

            if (!svg) return;
            const mainGroup = svg.select('.main-group');
            
            // Remove existing show-more buttons
            mainGroup.selectAll('.show-more-button-group').remove();

            // Create button group
            const buttonGroup = mainGroup.append('g').attr('class', 'show-more-button-group');
            
            // Get button dimensions from CSS variables
            const computedStyle = getComputedStyle(document.documentElement);
            const buttonWidth = parseInt(computedStyle.getPropertyValue('--show-more-button-width')) || 140;
            const buttonHeight = parseInt(computedStyle.getPropertyValue('--show-more-button-height')) || 40;
            const buttonPadding = parseInt(computedStyle.getPropertyValue('--show-more-button-padding')) || 20;
            const buttonOverflow = parseInt(computedStyle.getPropertyValue('--show-more-button-overflow')) || 10;

            // Set up global button actions for onclick handlers
            (window as any).sankeyButtonActions = {
                toggleSymptoms: () => getViewerActions().toggleShowAllSymptoms(),
                toggleDiagnoses: () => getViewerActions().toggleShowAllDiagnoses(),
                toggleTreatments: () => getViewerActions().toggleShowAllTreatments()
            };

            // Add symptoms column button
            // Show button if there are items that could be filtered (or are being shown with showAll)
            const hasFilterableSymptoms = currentHiddenCounts.symptoms > 0 || currentThresholds.symptoms.showAll;
            if (hasFilterableSymptoms && currentPositions.symptomColumn) {
                const symptomButton = buttonGroup
                    .append('foreignObject')
                    .attr('x', currentPositions.symptomColumn.centerX - buttonWidth / 2)
                    .attr('y', currentPositions.symptomColumn.bottomY + buttonPadding - buttonOverflow/2)
                    .attr('width', buttonWidth)
                    .attr('height', buttonHeight)
                    .attr('class', 'show-more-foreign-object symptoms');

                symptomButton
                    .append('xhtml:div')
                    .attr('class', 'show-more-button-container')
                    .html(`
                        <button class="button -small" onclick="event.stopPropagation(); window.sankeyButtonActions?.toggleSymptoms()">
                            ${currentThresholds.symptoms.showAll ? 'Show fewer' : `Show more (${currentHiddenCounts.symptoms})`}
                        </button>
                    `);
            }

            // Add diagnoses column button
            // Show button if there are items that could be filtered (or are being shown with showAll)
            const hasFilterableDiagnoses = currentHiddenCounts.diagnoses > 0 || currentThresholds.diagnoses.showAll;
            if (hasFilterableDiagnoses && currentPositions.diagnosisColumn) {
                const diagnosisButton = buttonGroup
                    .append('foreignObject')
                    .attr('x', currentPositions.diagnosisColumn.centerX - buttonWidth / 2)
                    .attr('y', currentPositions.diagnosisColumn.bottomY + buttonPadding - buttonOverflow/2)
                    .attr('width', buttonWidth)
                    .attr('height', buttonHeight)
                    .attr('class', 'show-more-foreign-object diagnoses');

                diagnosisButton
                    .append('xhtml:div')
                    .attr('class', 'show-more-button-container')
                    .html(`
                        <button class="button -small" onclick="event.stopPropagation(); window.sankeyButtonActions?.toggleDiagnoses()">
                            ${currentThresholds.diagnoses.showAll ? 'Show fewer' : `Show more (${currentHiddenCounts.diagnoses})`}
                        </button>
                    `);
            }

            // Note: Treatment buttons are not shown since treatments are hidden based on 
            // orphaned node logic (when connected diagnoses are hidden), not direct thresholds
        });
    }




    // Expose navigation functions to parent via global window object temporarily
    // This is a workaround since we can't pass functions up directly
    if (typeof window !== 'undefined') {
        (window as any).sankeyNavigationFunctions = {
            focusNext: () => focusNextNode(focusableNodes, focusedNodeIndex, onfocusChange),
            focusPrevious: () => focusPreviousNode(focusableNodes, focusedNodeIndex, onfocusChange),
            selectFocused: () => selectFocusedNode(focusableNodes, focusedNodeIndex, getViewerActions(), onnodeSelect),
            clearSelection: () => {
                // Clear the unified visual state system
        getViewerActions().clearSelection();
            }
        };
    }






    

    /**
     * Update selection state using proper D3 update pattern (CSS-only, no re-render)
     */
    
    /**
     * Updates D3 Sankey layout positions without recreating DOM elements
     * Used when container size changes to preserve selection state
     */
    function updateSankeyLayout() {
        if (!svg || !currentSankeyData || !container) {
            console.warn('Cannot update layout: missing svg, currentSankeyData, or container');
            return;
        }
        
        
        // Get current container dimensions
        const bounds = container.getBoundingClientRect();
        const newWidth = Math.max(bounds.width, container.offsetWidth || 0);
        const newHeight = Math.max(bounds.height, container.offsetHeight || 0);
        
        // Update SVG viewBox if dimensions changed significantly
        if (Math.abs(newWidth - width) > 10 || Math.abs(newHeight - height) > 10) {
            width = newWidth;
            height = newHeight;
            svg.attr('viewBox', `0 0 ${width} ${height}`);
        }
        
        // Recalculate layout with new dimensions
        const chartWidth = width - margins.left - margins.right;
        const chartHeight = height - margins.top - margins.bottom;
        const htmlNodeWidth = isMobile ? 120 : 160;
        
        // Recalculate column positions
        const availableWidth = chartWidth;
        const columnWidth = availableWidth / 3;
        const columnCenterX = [
            columnWidth * 0.5,
            columnWidth * 1.5, 
            columnWidth * 2.5
        ];
        
        // Create a temporary sankey generator for position calculations
        const sankeyGenerator = sankey<SankeyNode, SankeyLink>()
            .nodeWidth(50)
            .nodePadding(isMobile ? 8 : 12)
            .extent([[0, 0], [chartWidth, chartHeight]])
            .nodeId(d => d.id)
            .nodeSort((a: SankeyNode, b: SankeyNode) => {
                if (a.type === 'symptom' && b.type === 'symptom') {
                    return (a.sortIndex || 0) - (b.sortIndex || 0);
                }
                return (b.value || 50) - (a.value || 50);
            });
        
        // Recalculate positions using existing node data
        let updatedResult: any;
        try {
            const nodesForD3 = currentSankeyData.nodes.map((d: any) => ({
                ...d,
                sourceLinks: [],
                targetLinks: [],
                value: d.value || 50
            }));

            const linksForD3 = currentSankeyData.links.map((d: any) => ({ 
                ...d,
                source: d.source,
                target: d.target,
                value: d.value || 1
            }));
            
            updatedResult = sankeyGenerator({
                nodes: nodesForD3,
                links: linksForD3
            });
            
            // Override positions with our column-based layout
            if (updatedResult?.nodes) {
                updatedResult.nodes.forEach((node: any) => {
                    const typeColumnMap = { symptom: 0, diagnosis: 1, treatment: 2 };
                    const targetColumn = typeColumnMap[node.type as keyof typeof typeColumnMap] ?? 1;
                    
                    const centerX = columnCenterX[targetColumn];
                    node.x0 = centerX - (htmlNodeWidth / 2);
                    node.x1 = centerX + (htmlNodeWidth / 2);
                });
                
                // Position nodes within columns
                const nodesByColumn: { symptom: any[], diagnosis: any[], treatment: any[] } = { 
                    symptom: [], diagnosis: [], treatment: [] 
                };
                updatedResult.nodes.forEach((node: any) => {
                    if (nodesByColumn[node.type as keyof typeof nodesByColumn]) {
                        nodesByColumn[node.type as keyof typeof nodesByColumn].push(node);
                    }
                });
                
                Object.values(nodesByColumn).forEach((columnNodes: any[]) => {
                    columnNodes.sort((a, b) => (b.value || 50) - (a.value || 50));
                    
                    let currentY = 20;
                    columnNodes.forEach((node) => {
                        const nodeHeight = Math.max(NODE_SIZE.MIN_HEIGHT_PX, node.value || NODE_SIZE.MIN_HEIGHT_PX);
                        node.y0 = currentY;
                        node.y1 = currentY + nodeHeight;
                        currentY = node.y1 + (isMobile ? 8 : 12);
                    });
                });
                
                // Update link positions to match new node positions
                if (updatedResult.links) {
                    updatedResult.links.forEach((link: any) => {
                        const sourceNode = updatedResult.nodes.find((n: any) => n.id === (typeof link.source === 'object' ? link.source.id : link.source));
                        const targetNode = updatedResult.nodes.find((n: any) => n.id === (typeof link.target === 'object' ? link.target.id : link.target));
                        
                        if (sourceNode && targetNode) {
                            link.source = sourceNode;
                            link.target = targetNode;
                            // Simplified link positioning for layout updates
                            link.y0 = sourceNode.y0 + (sourceNode.y1 - sourceNode.y0) / 2;
                            link.y1 = targetNode.y0 + (targetNode.y1 - targetNode.y0) / 2;
                            link.width = Math.max(1, link.value || 2);
                        }
                    });
                }
            }
        } catch (error) {
            console.error('Error in layout update calculation:', error);
            return;
        }
        
        if (!updatedResult?.nodes || !updatedResult?.links) {
            console.error('Invalid layout update result:', updatedResult);
            return;
        }
        
        // Update existing DOM elements positions using D3 update pattern
        // This preserves all existing classes and states
        
        // Get transition configuration based on device
        const transitionConfig = isMobile ? TRANSITION_CONFIG.MOBILE : TRANSITION_CONFIG.POSITION;
        const sizeConfig = isMobile ? TRANSITION_CONFIG.MOBILE : TRANSITION_CONFIG.SIZE;
        
        // Handle new, existing, and removed nodes using D3's enter/update/exit pattern
        const nodeGroup = svg.select('.node-group');
        const nodeSelection = nodeGroup.selectAll('.node')
            .data(updatedResult.nodes, (d: any) => d.id);
        
        // Track node selection changes
        
        // Handle new nodes (enter)
        const nodeEnter = nodeSelection.enter()
            .append('g')
            .attr('class', 'node')
            .attr('id', (d: any) => `node-${d.id}`)
            .attr('data-node-id', (d: any) => d.id)
            .attr('data-node-type', (d: any) => d.type)
            .classed('interactive-element', true)
            .style('opacity', 0)
            .attr('transform', (d: any) => `translate(${d.x0}, ${d.y0})`); // Set position immediately
            
        // Add foreignObject for new nodes
        nodeEnter.append('foreignObject')
            .attr('class', 'node-html')
            .attr('x', 0)
            .attr('y', 0)
            .attr('width', htmlNodeWidth)
            .attr('height', (d: any) => d.y1! - d.y0!)
            .attr('data-node-id', (d: any) => d.id)
            .classed('interactive-element', true)
            .html((d: any) => createNodeComponent(d, selectedNodeId, isMobile, nodeComponents))
            .on('click', (event: MouseEvent, d: any) => handleNodeClick(event, d, getViewerActions(), onnodeSelect))
            .on('touchstart', (event: TouchEvent, d: any) => handleNodeClick(event, d, getViewerActions(), onnodeSelect))
            .on('mouseenter', (_, d: any) => {
                const allNodeArrays = [currentSankeyData?.nodes || []].flat();
                handleNodeHover(d.id, true, svg || null, allNodeArrays, getViewerActions());
            })
            .on('mouseleave', (_, d: any) => {
                const allNodeArrays = [currentSankeyData?.nodes || []].flat();
                handleNodeHover(d.id, false, svg || null, allNodeArrays, getViewerActions());
            });
        
        // Fade in new nodes
        nodeEnter.transition()
            .duration(transitionConfig.duration * 0.3)
            .delay(100)
            .ease(d3.easeCubicOut)
            .style('opacity', 1);
        
        // Update existing nodes (update) - only animate Y position changes for nodes that moved
        nodeSelection
            .transition()
            .duration(transitionConfig.duration)
            .ease(transitionConfig.easing)
            // Remove stagger delay for synchronized transitions with links
            .attrTween('transform', function(d: any) {
                const node = d3.select(this);
                const currentTransform = node.attr('transform');
                
                // More robust parsing of current position
                let currentY = d.y0; // Fallback to target position
                
                if (currentTransform) {
                    const match = currentTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                    if (match && match[2]) {
                        const parsedY = parseFloat(match[2]);
                        if (!isNaN(parsedY)) {
                            currentY = parsedY;
                        }
                    }
                }
                
                // Only animate if Y position actually changed significantly
                const yDiff = Math.abs(currentY - d.y0);
                if (yDiff < 1) {
                    // Position hasn't changed much, just set immediately
                    return function(_: number) {
                        return `translate(${d.x0}, ${d.y0})`;
                    };
                }
                
                // Create smooth Y interpolator for nodes that actually moved
                const interpolateY = d3.interpolate(currentY, d.y0);
                
                return function(_: number) {
                    // X position immediate, Y position interpolates smoothly
                    return `translate(${d.x0}, ${interpolateY(_)})`;
                };
            });
        
        // Handle removed nodes (exit)
        nodeSelection.exit()
            .transition()
            .duration(transitionConfig.duration * 0.5)
            .style('opacity', 0)
            .remove();
        
        // Update foreignObject dimensions with coordinated timing
        svg.select('.node-group').selectAll('.node-html')
            .data(updatedResult.nodes, (d: any) => d.id)
            .attr('data-node-id', (d: any) => d.id)
            .transition()
            .duration(sizeConfig.duration)
            .ease(sizeConfig.easing)
            // Remove stagger delay for synchronized transitions
            .attr('height', (d: any) => d.y1! - d.y0!);
        
        // Update link paths using the same generator as in renderSankey
        const baseLinkGenerator: ((link: any) => string | null) = LINK_CONFIG.ALGORITHM === 'default'
            ? sankeyLinkHorizontal<any, any>()
            : getLinkPathGenerator(LINK_CONFIG.ALGORITHM, LINK_CONFIG.RENDER_MODE);

        const linkPathGenerator: (link: any) => string = LINK_CONFIG.ALGORITHM === 'default'
            ? (link: any) => sankeyLinkHorizontal<any, any>()(link) || ''
            : createEnhancedLinkGenerator(getLinkPathGenerator(LINK_CONFIG.ALGORITHM, LINK_CONFIG.RENDER_MODE));
        
        // Handle link transitions with enter/update/exit pattern - use same timing as nodes
        const pathConfig = transitionConfig; // Use same config as nodes for perfect synchronization
        const linkGroup = svg.select('.link-group');
        const linkSelection = linkGroup.selectAll<SVGPathElement, any>('.link')
            .data(updatedResult.links, (d: any) => `${d.source.id}-${d.target.id}`);
        
        // Handle new links (enter) - appear immediately with opacity fade-in
        const linkEnter = linkSelection.enter()
            .append('path')
            .attr('class', (d: any) => {
                const relType = (d.type || 'default').toLowerCase().replace(/\s+/g, '_');
                return `link rel-${relType}`;
            })
            .attr('id', (d: any) => {
                const sourceId = typeof d.source === 'object' ? d.source.id : d.source;
                const targetId = typeof d.target === 'object' ? d.target.id : d.target;
                return `link-${sourceId}-${targetId}`;
            })
            .attr('data-source-id', (d: any) => typeof d.source === 'object' ? d.source.id : d.source)
            .attr('data-target-id', (d: any) => typeof d.target === 'object' ? d.target.id : d.target)
            .attr('d', (d: any) => {
                if (LINK_CONFIG.ALGORITHM === 'default') {
                    return sankeyLinkHorizontal()(d);
                }
                return linkPathGenerator(d);
            })
            .style('opacity', 0);
        
        // Fade in new links
        linkEnter.transition()
            .duration(pathConfig.duration * 0.4)
            .delay(pathConfig.duration * 0.3)
            .ease(d3.easeCubicOut)
            .style('opacity', 0.2);
        
        // Update existing links (update) - smooth path transitions
        linkSelection
            .transition()
            .duration(pathConfig.duration)
            .ease(pathConfig.easing)
            .attr('d', (d: any) => {
                if (LINK_CONFIG.ALGORITHM === 'default') {
                    const result = sankeyLinkHorizontal<any, any>()(d);
                    return result || '';
                }
                return linkPathGenerator(d) || '';
            });
        
        // Remove old links (exit)
        linkSelection.exit()
            .transition()
            .duration(pathConfig.duration * 0.5)
            .style('opacity', 0)
            .remove();
        
    }
    
    
    


    function handleContainerResize(contentRect: DOMRectReadOnly) {
        const newWidth = Math.max(contentRect.width, 300);
        const newHeight = Math.max(contentRect.height, 200);
        
        // Check if resize is significant enough to update
        const significantWidthChange = Math.abs(newWidth - width) > 10; // Lower threshold for smoother updates
        const significantHeightChange = Math.abs(newHeight - height) > 10;
        
        if (significantWidthChange || significantHeightChange) {
            // Update dimensions (non-reactive variables)
            width = newWidth;
            height = newHeight;
            
            // Update viewBox for visual feedback
            if (svg) {
                svg.attr('viewBox', `0 0 ${width} ${height}`);
                
                // Update layout positions without re-rendering nodes
                if (currentSankeyData) {
                    updateSankeyLayout();
                }
            }
        }
    }


    /**
     * Map link width values to semantic strength classes
     */
    function getLinkStrengthClass(width: number): string {
        const calculatedWidth = calculateLinkWidth(width || 2);
        
        if (calculatedWidth <= 1) return 'strength-minimal';
        if (calculatedWidth <= 2) return 'strength-weak';
        if (calculatedWidth <= 4) return 'strength-moderate';
        if (calculatedWidth <= 8) return 'strength-strong';
        if (calculatedWidth <= 12) return 'strength-very-strong';
        return 'strength-maximum';
    }

    // Zoom event handlers
    function handleZoom(event: d3.D3ZoomEvent<SVGSVGElement, unknown>) {
        currentZoomTransform = event.transform;
        if (svg) {
            svg.select('g.main-group')
                .attr('transform', event.transform.toString());
        }
    }

    function handleZoomStart() {
        if (svg) {
            svg.classed('dragging-active', true);
        }
    }

    function handleZoomEnd() {
        if (svg) {
            svg.classed('dragging-active', false);
        }
    }

    // Expose zoom functions for external control
    if (typeof window !== 'undefined') {
        (window as any).sankeyZoomFunctions = {
            zoomIn: handleZoomIn,
            zoomOut: handleZoomOut,
            zoomToFit: handleZoomToFit,
            resetZoom: handleResetZoom,
            panBy: panByDirection,
            getCurrentZoom: () => currentZoomTransform.k
        };
    }

    // ZoomControls event handlers
    function handleZoomIn() {
        if (zoom && svg) {
            zoomIn(svg, zoom, ZOOM_CONFIG);
        }
    }

    function handleZoomOut() {
        if (zoom && svg) {
            zoomOut(svg, zoom, ZOOM_CONFIG);
        }
    }

    function handleZoomToFit() {
        if (zoom && svg) {
            zoomToFit(svg, zoom, ZOOM_CONFIG, width, height, currentSankeyData, isMobile);
        }
    }

    function handleResetZoom() {
        if (zoom && svg) {
            resetZoom(svg, zoom, ZOOM_CONFIG);
        }
    }

    // Pan functions
    function panByDirection(deltaX: number, deltaY: number) {
        if (zoom && svg) {
            panBy(svg, zoom, deltaX, deltaY, currentZoomTransform);
        }
    }

</script>

<div class="sankey-container" 
     bind:this={container}
     tabindex="0"
     role="application"
     aria-label="Interactive Sankey diagram with zoom and pan controls"
     style="--hover-link-opacity: {OPACITY.CSS_HOVER_LINK}; --hover-node-opacity: {OPACITY.CSS_HOVER_NODE}; --shadow-light-opacity: {OPACITY.SHADOW_LIGHT}; --shadow-medium-opacity: {OPACITY.SHADOW_MEDIUM}">
    {#if !currentSankeyData?.nodes?.length}
        <div class="empty-state">
            <p>{$t('session.empty-states.no-data')}</p>
        </div>
    {:else}

        <ZoomControls
            {isMobile}
            currentZoom={currentZoomTransform.k}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onZoomToFit={handleZoomToFit}
            onResetZoom={handleResetZoom}
        />
    {/if}
</div>

<!-- Persistent tooltip component -->
{#if tooltipData.visible}
    <div class="link-tooltip" style="left: {tooltipData.x}px; top: {tooltipData.y}px; transform: translate(-50%, -50%);">
        <LinkTooltip 
            relationshipType={tooltipData.relationshipType}
            relationshipLabel={tooltipData.relationshipLabel}
            actions={tooltipData.actions}
            {isMobile}
        />
    </div>
{/if}