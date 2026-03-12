<script lang="ts">
    import { onMount, onDestroy } from 'svelte';
    import { browser } from '$app/environment';
    import { t } from '$lib/i18n';
    import type { DicomMetadata } from '$lib/files/dicom-handler';

    interface Props {
        dicomData: ArrayBuffer | ArrayBuffer[];
        metadata?: DicomMetadata;
    }

    let { dicomData, metadata }: Props = $props();

    let viewportDiv: HTMLDivElement;
    let isLoading = $state(true);
    let error = $state<string | null>(null);
    let windowLevel = $state({ wc: 0, ww: 0 });
    let activeTool = $state<string>('WindowLevel');
    let isInverted = $state(false);
    let rotation = $state(0);
    let isMultiFrame = $state(false);
    let currentSlice = $state(0);
    let totalSlices = $state(0);
    let showVoiDropdown = $state(false);
    let showColorMapDropdown = $state(false);

    // Cornerstone3D references
    let renderingEngine: any = null;
    let viewport: any = null;
    let toolGroup: any = null;
    const VIEWPORT_ID = 'dicomViewport';
    const RENDERING_ENGINE_ID = 'dicomRenderingEngine';
    const TOOL_GROUP_ID = 'dicomToolGroup';

    // Zoom configuration
    const ZOOM_SENSITIVITY = 0.001;
    const PINCH_SENSITIVITY = 0.08;
    const ZOOM_MIN = 0.1;
    const ZOOM_MAX = 50;

    function applyZoom(delta: number) {
        if (!viewport) return;
        const currentZoom = viewport.getZoom();
        const zoomFactor = 1 + delta * ZOOM_SENSITIVITY;
        const newZoom = Math.max(ZOOM_MIN, Math.min(currentZoom * zoomFactor, ZOOM_MAX));
        viewport.setZoom(newZoom);
        viewport.render();
    }

    const VOI_PRESETS = [
        { name: 'Default', wc: 0, ww: 0, auto: true },
        { name: 'Bone', wc: 500, ww: 2000 },
        { name: 'Lung', wc: -600, ww: 1500 },
        { name: 'Soft Tissue', wc: 40, ww: 400 },
        { name: 'Brain', wc: 40, ww: 80 },
        { name: 'Liver', wc: 60, ww: 150 },
    ];

    const COLOR_MAPS = [
        { id: 'Grayscale', name: 'Grayscale' },
        { id: 'Hot Iron', name: 'Hot Iron' },
        { id: 'PET', name: 'PET' },
        { id: 'Hot Metal Blue', name: 'Hot Metal Blue' },
    ];

    onMount(async () => {
        if (!browser) return;

        try {
            const { getCornerstone3D } = await import('$lib/files/cornerstone3d-init');
            const cs3d = await getCornerstone3D();
            const { core, tools } = cs3d;

            // Create rendering engine
            renderingEngine = new core.RenderingEngine(RENDERING_ENGINE_ID);

            // Enable element as a stack viewport
            renderingEngine.enableElement({
                viewportId: VIEWPORT_ID,
                element: viewportDiv,
                type: core.Enums.ViewportType.STACK,
            });

            viewport = renderingEngine.getViewport(VIEWPORT_ID);

            // Build image IDs from ArrayBuffer data
            const buffers = Array.isArray(dicomData) ? dicomData : [dicomData];
            const imageIds: string[] = [];

            for (const buffer of buffers) {
                const file = new File([buffer], 'image.dcm', { type: 'application/dicom' });
                const imageId = cs3d.dicomImageLoader.wadouri.fileManager.add(file);
                imageIds.push(imageId);
            }

            // Also check for multi-frame within a single DICOM
            // Parse NumberOfFrames from first buffer
            let numberOfFrames = 1;
            try {
                const dpMod = await import('dicom-parser');
                const dicomParser = dpMod.default || dpMod;
                const dataSet = dicomParser.parseDicom(new Uint8Array(buffers[0]));
                const framesStr = dataSet.string('x00280008');
                if (framesStr) {
                    numberOfFrames = parseInt(framesStr, 10) || 1;
                }
            } catch {
                // ignore parse errors
            }

            // For multi-frame DICOM, generate frame-specific imageIds
            let finalImageIds = imageIds;
            if (numberOfFrames > 1 && imageIds.length === 1) {
                finalImageIds = [];
                for (let i = 0; i < numberOfFrames; i++) {
                    finalImageIds.push(`${imageIds[0]}?frame=${i}`);
                }
            }

            isMultiFrame = finalImageIds.length > 1;
            totalSlices = finalImageIds.length;
            currentSlice = 0;

            // Set the stack
            await viewport.setStack(finalImageIds, 0);

            // Read initial viewport properties
            updateWindowLevelDisplay();

            // Create tool group
            toolGroup = tools.ToolGroupManager.createToolGroup(TOOL_GROUP_ID);
            toolGroup.addViewport(VIEWPORT_ID, RENDERING_ENGINE_ID);

            // Add tools to group
            toolGroup.addTool(tools.WindowLevelTool.toolName);
            toolGroup.addTool(tools.PanTool.toolName);
            toolGroup.addTool(tools.ZoomTool.toolName);
            toolGroup.addTool(tools.AngleTool.toolName);
            toolGroup.addTool(tools.LengthTool.toolName);
            if (isMultiFrame) {
                toolGroup.addTool(tools.StackScrollTool.toolName);
            }

            // Set default active: W/L on left mouse, zoom on right mouse + pinch, pan on 1-finger touch
            toolGroup.setToolActive(tools.WindowLevelTool.toolName, {
                bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
            });
            // Zoom on right mouse only — pinch handled by custom touch handler below
            toolGroup.setToolActive(tools.ZoomTool.toolName, {
                bindings: [
                    { mouseButton: tools.Enums.MouseBindings.Secondary },
                ],
            });
            toolGroup.setToolActive(tools.PanTool.toolName, {
                bindings: [{ numTouchPoints: 1 }],
            });
            if (isMultiFrame) {
                toolGroup.setToolActive(tools.StackScrollTool.toolName, {
                    bindings: [{ mouseButton: tools.Enums.MouseBindings.Wheel }],
                });
            }

            // Listen for image rendered to update W/L display
            viewportDiv.addEventListener(core.Enums.Events.IMAGE_RENDERED, handleImageRendered);

            // Listen for stack index change
            if (isMultiFrame) {
                viewportDiv.addEventListener(core.Enums.Events.STACK_NEW_IMAGE, handleStackNewImage);
            }

            renderingEngine.render();

            // Wheel zoom handler
            viewportDiv.addEventListener('wheel', (e: WheelEvent) => {
                e.preventDefault();
                applyZoom(-e.deltaY);
            }, { passive: false });

            // Touch pinch-to-zoom handler
            let lastTouchDistance: number | null = null;

            function getTouchDistance(touches: TouchList): number {
                const dx = touches[0].clientX - touches[1].clientX;
                const dy = touches[0].clientY - touches[1].clientY;
                return Math.sqrt(dx * dx + dy * dy);
            }

            // Touch pinch-to-zoom — capture phase to intercept before Cornerstone
            viewportDiv.addEventListener('touchstart', (e) => {
                if (e.touches.length === 2) {
                    e.stopPropagation();
                    lastTouchDistance = getTouchDistance(e.touches);
                }
            }, { capture: true, passive: false });

            viewportDiv.addEventListener('touchmove', (e) => {
                if (e.touches.length === 2 && lastTouchDistance !== null) {
                    e.preventDefault();
                    e.stopPropagation();
                    const dist = getTouchDistance(e.touches);
                    const pixelDelta = dist - lastTouchDistance;
                    const currentZoom = viewport?.getZoom() ?? 1;
                    const zoomFactor = 1 + pixelDelta * PINCH_SENSITIVITY;
                    const newZoom = Math.max(ZOOM_MIN, Math.min(currentZoom * zoomFactor, ZOOM_MAX));
                    if (viewport) {
                        viewport.setZoom(newZoom);
                        viewport.render();
                    }
                    lastTouchDistance = dist;
                }
            }, { capture: true, passive: false });

            viewportDiv.addEventListener('touchend', () => { lastTouchDistance = null; }, { capture: true });

            isLoading = false;
        } catch (e) {
            console.error('[DicomViewer] Failed to initialize:', e);
            error = e instanceof Error ? e.message : 'Failed to load DICOM image';
            isLoading = false;
        }
    });

    onDestroy(() => {
        if (!browser) return;
        try {
            if (toolGroup) {
                import('@cornerstonejs/tools').then(tools => {
                    tools.ToolGroupManager.destroyToolGroup(TOOL_GROUP_ID);
                }).catch(() => {});
            }
            if (renderingEngine) {
                renderingEngine.destroy();
            }
        } catch {
            // already destroyed
        }
    });

    function handleImageRendered() {
        updateWindowLevelDisplay();
    }

    function handleStackNewImage() {
        if (viewport) {
            currentSlice = viewport.getCurrentImageIdIndex();
        }
    }

    function updateWindowLevelDisplay() {
        if (!viewport) return;
        const props = viewport.getProperties();
        if (props?.voiRange) {
            const lower = props.voiRange.lower;
            const upper = props.voiRange.upper;
            const ww = upper - lower;
            const wc = lower + ww / 2;
            windowLevel = { wc: Math.round(wc), ww: Math.round(ww) };
        }
    }

    async function setActiveTool(toolName: string) {
        if (!toolGroup) return;
        const tools = await import('@cornerstonejs/tools');

        // Deactivate current primary tool
        toolGroup.setToolPassive(activeTool);

        // Activate new tool
        toolGroup.setToolActive(toolName, {
            bindings: [{ mouseButton: tools.Enums.MouseBindings.Primary }],
        });

        activeTool = toolName;
        showVoiDropdown = false;
        showColorMapDropdown = false;
    }

    function flipHorizontal() {
        if (!viewport) return;
        const camera = viewport.getCamera();
        viewport.setCamera({
            flipHorizontal: !camera.flipHorizontal,
        });
        viewport.render();
    }

    function flipVertical() {
        if (!viewport) return;
        const camera = viewport.getCamera();
        viewport.setCamera({
            flipVertical: !camera.flipVertical,
        });
        viewport.render();
    }

    function rotateCW() {
        if (!viewport) return;
        rotation = (rotation + 90) % 360;
        viewport.setProperties({ rotation });
        viewport.render();
    }

    function rotateCCW() {
        if (!viewport) return;
        rotation = (rotation - 90 + 360) % 360;
        viewport.setProperties({ rotation });
        viewport.render();
    }

    function toggleInvert() {
        if (!viewport) return;
        isInverted = !isInverted;
        viewport.setProperties({ invert: isInverted });
        viewport.render();
    }

    function resetView() {
        if (!viewport) return;
        viewport.resetCamera();
        viewport.resetProperties();
        isInverted = false;
        rotation = 0;
        updateWindowLevelDisplay();
        viewport.render();
    }

    function applyVoiPreset(preset: typeof VOI_PRESETS[number]) {
        if (!viewport) return;
        if (preset.auto) {
            viewport.resetProperties();
        } else {
            const lower = preset.wc - preset.ww / 2;
            const upper = preset.wc + preset.ww / 2;
            viewport.setProperties({
                voiRange: { lower, upper },
            });
        }
        viewport.render();
        updateWindowLevelDisplay();
        showVoiDropdown = false;
    }

    function applyColorMap(colorMapId: string) {
        if (!viewport) return;
        if (colorMapId === 'Grayscale') {
            viewport.setProperties({ colormap: undefined });
        } else {
            viewport.setColormap({ name: colorMapId });
        }
        viewport.render();
        showColorMapDropdown = false;
    }

    function handleSliceChange(e: Event) {
        const target = e.target as HTMLInputElement;
        const idx = parseInt(target.value, 10);
        if (viewport && !isNaN(idx)) {
            viewport.setImageIdIndex(idx);
            currentSlice = idx;
        }
    }

    function toggleAngleTool() {
        setActiveTool('Angle');
    }

    function toggleLengthTool() {
        setActiveTool('Length');
    }

    function closeDropdowns() {
        showVoiDropdown = false;
        showColorMapDropdown = false;
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dicom-viewer-wrapper" onclick={closeDropdowns}>
    {#if isLoading}
        <div class="loading-state">
            <div class="spinner"></div>
            <p>{$t('dicom.loading')}</p>
        </div>
    {:else if error}
        <div class="error-state">
            <p>{error}</p>
        </div>
    {/if}

    <div class="dicom-canvas" bind:this={viewportDiv}></div>

    {#if !isLoading && !error}
        <div class="dicom-toolbar">
            <!-- Tool buttons -->
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    class:-active={activeTool === 'WindowLevel'}
                    onclick={() => setActiveTool('WindowLevel')}
                    title={$t('dicom.window-level')}
                >
                    <!-- contrast: half-filled circle -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 0 20z" fill="currentColor"/></svg>
                </button>
                <button
                    class="toolbar-btn"
                    class:-active={activeTool === 'Pan'}
                    onclick={() => setActiveTool('Pan')}
                    title={$t('dicom.pan')}
                >
                    <!-- hand/move -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 9l-3 3 3 3M9 5l3-3 3 3M15 19l-3 3-3-3M19 9l3 3-3 3M2 12h20M12 2v20"/></svg>
                </button>
                <button
                    class="toolbar-btn"
                    class:-active={activeTool === 'Zoom'}
                    onclick={() => setActiveTool('Zoom')}
                    title={$t('dicom.zoom')}
                >
                    <svg class="icon"><use href="/icons.svg#search"></use></svg>
                </button>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Flip / Rotate -->
            <div class="toolbar-group">
                <button class="toolbar-btn" onclick={flipHorizontal} title={$t('dicom.flip-h')}>
                    <!-- flip-h -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v18M16 7l4 5-4 5M8 7L4 12l4 5"/></svg>
                </button>
                <button class="toolbar-btn" onclick={flipVertical} title={$t('dicom.flip-v')}>
                    <!-- flip-v -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12h18M7 8L12 4l5 4M7 16l5 4 5-4"/></svg>
                </button>
                <button class="toolbar-btn" onclick={rotateCCW} title={$t('dicom.rotate-ccw')}>
                    <!-- rotate-ccw -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>
                </button>
                <button class="toolbar-btn" onclick={rotateCW} title={$t('dicom.rotate-cw')}>
                    <!-- rotate-cw -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>
                </button>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Invert + Color + VOI -->
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    class:-active={isInverted}
                    onclick={toggleInvert}
                    title={$t('dicom.invert')}
                >
                    <!-- invert: moon/sun -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>
                </button>

                <!-- VOI Presets dropdown -->
                <div class="toolbar-dropdown">
                    <button
                        class="toolbar-btn"
                        onclick={(e) => { e.stopPropagation(); showVoiDropdown = !showVoiDropdown; showColorMapDropdown = false; }}
                        title={$t('dicom.voi-presets')}
                    >
                        VOI
                    </button>
                    {#if showVoiDropdown}
                        <div class="dropdown-menu">
                            {#each VOI_PRESETS as preset}
                                <button class="dropdown-item" onclick={() => applyVoiPreset(preset)}>
                                    {preset.name}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>

                <!-- Color Map dropdown -->
                <div class="toolbar-dropdown">
                    <button
                        class="toolbar-btn"
                        onclick={(e) => { e.stopPropagation(); showColorMapDropdown = !showColorMapDropdown; showVoiDropdown = false; }}
                        title={$t('dicom.color-map')}
                    >
                        <!-- palette -->
                        <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="13.5" cy="6.5" r="0.5" fill="currentColor"/><circle cx="17.5" cy="10.5" r="0.5" fill="currentColor"/><circle cx="8.5" cy="7.5" r="0.5" fill="currentColor"/><circle cx="6.5" cy="12.5" r="0.5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.93 0 1.5-.75 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-1 0-.83.67-1.5 1.5-1.5H16c3.31 0 6-2.69 6-6 0-5.52-4.48-9.99-10-9.99z"/></svg>
                    </button>
                    {#if showColorMapDropdown}
                        <div class="dropdown-menu">
                            {#each COLOR_MAPS as cm}
                                <button class="dropdown-item" onclick={() => applyColorMap(cm.id)}>
                                    {cm.name}
                                </button>
                            {/each}
                        </div>
                    {/if}
                </div>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Measurement tools -->
            <div class="toolbar-group">
                <button
                    class="toolbar-btn"
                    class:-active={activeTool === 'Angle'}
                    onclick={toggleAngleTool}
                    title={$t('dicom.angle')}
                >
                    <!-- angle -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 20h16M4 20L12 4M4 20l8-8"/></svg>
                </button>
                <button
                    class="toolbar-btn"
                    class:-active={activeTool === 'Length'}
                    onclick={toggleLengthTool}
                    title={$t('dicom.length')}
                >
                    <!-- ruler -->
                    <svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.17 8l-5.17-5.17-12 12L9.17 20l12-12zM8 12l2 2M11 9l2 2M14 6l2 2"/></svg>
                </button>
            </div>

            <div class="toolbar-separator"></div>

            <!-- Reset -->
            <button class="toolbar-btn" onclick={resetView} title={$t('dicom.reset')}>
                <svg class="icon"><use href="/icons.svg#anatomy-reset"></use></svg>
            </button>

            <!-- WC/WW info -->
            <div class="toolbar-info">
                <span>WC: {windowLevel.wc}</span>
                <span>WW: {windowLevel.ww}</span>
            </div>
        </div>

        <!-- Slice controls for multi-frame -->
        {#if isMultiFrame}
            <div class="slice-controls">
                <label class="slice-label">
                    {$t('dicom.slice')}: {currentSlice + 1} / {totalSlices}
                </label>
                <input
                    type="range"
                    min="0"
                    max={totalSlices - 1}
                    value={currentSlice}
                    oninput={handleSliceChange}
                    class="slice-slider"
                />
            </div>
        {/if}
    {/if}
</div>

<style>
    .dicom-viewer-wrapper {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        background: #000;
        position: relative;
        min-height: 400px;
    }

    .dicom-canvas {
        width: 100%;
        flex: 1;
        min-height: 500px;
        position: relative;
        touch-action: none;
        overflow: hidden;
    }

    .loading-state {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #aaa;
        z-index: 1;
    }

    .spinner {
        width: 40px;
        height: 40px;
        border: 4px solid #333;
        border-top: 4px solid #aaa;
        border-radius: 50%;
        animation: spin 1s linear infinite;
        margin-bottom: 1rem;
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    .error-state {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #f66;
        z-index: 1;
        padding: 2rem;
        text-align: center;
    }

    .dicom-toolbar {
        display: flex;
        align-items: center;
        padding: 0.375rem 0.5rem;
        background: #1a1a1a;
        color: #aaa;
        font-size: 0.75rem;
        gap: 0.25rem;
        flex-wrap: wrap;
        border-top: 1px solid #333;
    }

    .toolbar-group {
        display: flex;
        gap: 0.125rem;
    }

    .toolbar-separator {
        width: 1px;
        height: 1.5rem;
        background: #444;
        margin: 0 0.25rem;
    }

    .toolbar-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 0.25rem;
        padding: 0.3rem 0.4rem;
        background: #2a2a2a;
        color: #bbb;
        border: 1px solid #444;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.7rem;
        min-width: 1.75rem;
        height: 1.75rem;
        transition: background 0.15s, color 0.15s;
    }

    .toolbar-btn:hover {
        background: #444;
        color: #fff;
    }

    .toolbar-btn.-active {
        background: var(--color-interactivity, #4a9eff);
        color: #fff;
        border-color: var(--color-interactivity, #4a9eff);
    }

    .icon {
        width: 1rem;
        height: 1rem;
        fill: currentColor;
    }

    .toolbar-info {
        display: flex;
        gap: 0.75rem;
        font-family: monospace;
        font-size: 0.7rem;
        color: #888;
        margin-left: auto;
    }

    .toolbar-dropdown {
        position: relative;
    }

    .dropdown-menu {
        position: absolute;
        bottom: 100%;
        left: 0;
        background: #2a2a2a;
        border: 1px solid #555;
        border-radius: 4px;
        min-width: 8rem;
        z-index: 10;
        box-shadow: 0 -4px 12px rgba(0, 0, 0, 0.5);
        margin-bottom: 0.25rem;
    }

    .dropdown-item {
        display: block;
        width: 100%;
        padding: 0.4rem 0.75rem;
        background: none;
        border: none;
        color: #ccc;
        font-size: 0.75rem;
        text-align: left;
        cursor: pointer;
    }

    .dropdown-item:hover {
        background: #444;
        color: #fff;
    }

    .slice-controls {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.375rem 0.75rem;
        background: #1a1a1a;
        border-top: 1px solid #333;
    }

    .slice-label {
        color: #aaa;
        font-size: 0.75rem;
        font-family: monospace;
        white-space: nowrap;
    }

    .slice-slider {
        flex: 1;
        accent-color: var(--color-interactivity, #4a9eff);
    }

    /* Mobile responsive */
    @media (max-width: 640px) {
        .dicom-toolbar {
            gap: 0.125rem;
            padding: 0.25rem;
        }

        .toolbar-separator {
            display: none;
        }

        .toolbar-info {
            width: 100%;
            justify-content: center;
            margin-left: 0;
        }

        .toolbar-btn {
            padding: 0.25rem;
            min-width: 1.5rem;
            height: 1.5rem;
        }
    }
</style>
