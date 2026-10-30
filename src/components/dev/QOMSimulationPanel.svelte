<script lang="ts">
  // Development-only QOM Simulation Panel
  // Use this component in development environments to test QOM simulation
  
  import { simulateRealisticMedicalQOM, SAMPLE_BASED_EXPERT_GENERATION } from '$lib/session/qom/qom-simulation';
  import { qomActions, qomMetrics } from '$lib/session/stores/qom-execution-store';
  
  interface Props {
    sessionId?: string;
    autoStart?: boolean;
  }
  
  let { 
    sessionId = 'dev-simulation-session',
    autoStart = false 
  }: Props = $props();
  
  let isRunning = $state(false);
  let simulationSpeed = $state(2500); // milliseconds between events
  let currentSimulation: (() => void) | null = null;
  let showExpertDetails = $state(false);
  
  // Reactive metrics for display
  const metrics = $derived($qomMetrics);
  
  function startSimulation() {
    if (isRunning) {
      console.warn('🚫 Simulation already running');
      return;
    }
    
    console.log('🏥 Starting realistic medical QOM simulation from dev panel');
    
    // Initialize QOM first
    qomActions.initialize(sessionId);
    
    // Start simulation with smart timing (simulationSpeed parameter ignored)
    isRunning = true;
    currentSimulation = simulateRealisticMedicalQOM(sessionId);
    
    // Auto-stop when simulation completes (smart timing uses variable delays)
    setTimeout(() => {
      isRunning = false;
      currentSimulation = null;
    }, 25000); // Estimated total duration for smart timing
  }
  
  function stopSimulation() {
    if (currentSimulation) {
      currentSimulation();
      currentSimulation = null;
    }
    isRunning = false;
    console.log('🛑 QOM simulation stopped');
  }
  
  function resetQOM() {
    stopSimulation();
    qomActions.initialize(sessionId);
    console.log('🔄 QOM reset');
  }
  
  // Auto-start if requested
  $effect(() => {
    if (autoStart && typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        startSimulation();
      }, 1000);
      return () => clearTimeout(timer);
    }
  });
</script>

<!-- Only show in development -->
{#if typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname.includes('dev'))}
  <div class="qom-simulation-panel">
    <div class="controls-section">
      <!--div class="control-group">
        <label for="session-id">Session ID:</label>
        <input 
          id="session-id"
          type="text" 
          bind:value={sessionId} 
          disabled={isRunning}
          placeholder="dev-simulation-session"
        />
      </div>
      
      <div class="control-group">
        <label for="speed">Event Interval (ms):</label>
        <input 
          id="speed"
          type="number" 
          bind:value={simulationSpeed} 
          disabled={isRunning}
          min="500"
          max="10000"
          step="500"
        />
      </div-->
      
      <div class="action-buttons">
        <button 
          class="btn btn-primary"
          onclick={startSimulation}
          disabled={isRunning}
        >
          {isRunning ? 'Running...' : '🏥 Start Medical Simulation'}
        </button>
        
        <button 
          class="btn btn-secondary"
          onclick={stopSimulation}
          disabled={!isRunning}
        >
          🛑 Stop
        </button>
        
        <button 
          class="btn btn-secondary"
          onclick={resetQOM}
          disabled={isRunning}
        >
          🔄 Reset
        </button>
      </div>
    </div>
    <!--
    {#if metrics}
      <div class="metrics-section">
        <h4>📊 Current Metrics</h4>
        <div class="metrics-grid">
          <div class="metric">
            <span class="label">Status:</span>
            <span class="value status-{metrics.status}">{metrics.status}</span>
          </div>
          <div class="metric">
            <span class="label">Nodes:</span>
            <span class="value">{metrics.completedNodes}/{metrics.totalNodes}</span>
          </div>
          <div class="metric">
            <span class="label">Cost:</span>
            <span class="value">${metrics.totalCost.toFixed(4)}</span>
          </div>
          <div class="metric">
            <span class="label">Duration:</span>
            <span class="value">{(metrics.totalDuration / 1000).toFixed(1)}s</span>
          </div>
        </div>
      </div>
    {/if}
    
    <div class="expert-details">
      <button 
        class="btn btn-ghost"
        onclick={() => showExpertDetails = !showExpertDetails}
      >
        {showExpertDetails ? '▼' : '▶'} Expert Generation Details
      </button>
      
      {#if showExpertDetails}
        <div class="expert-list">
          <p class="description">
            Based on sample.analysis.1.json findings, the simulation will probabilistically generate these medical experts:
          </p>
          
          {#each Object.entries(SAMPLE_BASED_EXPERT_GENERATION) as [key, expert]}
            <div class="expert-card">
              <div class="expert-header">
                <strong>{expert.name}</strong>
                <span class="probability">{(expert.triggerProbability * 100).toFixed(0)}% chance</span>
              </div>
              <div class="expert-focus">
                <strong>Focus:</strong> {expert.investigationFocus}
              </div>
              <div class="expert-context">
                <strong>Context:</strong> {expert.filteredContext.symptoms?.join(', ') || 'General assessment'}
              </div>
              <div class="expert-prompt">
                <strong>Custom Prompt:</strong> 
                <em>"{expert.customPrompt.substring(0, 100)}..."</em>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
    
    <div class="usage-note">
      <p><strong>💡 Usage:</strong> This panel demonstrates AI-by-AI expert generation based on realistic medical cases. 
      Each simulation run may generate different experts based on probabilistic triggering.</p>
    </div>-->
  </div>
{/if}

<style>
  .qom-simulation-panel {
    position: fixed;
    top: 5rem;
    right: 2rem;
    background: #f8fafc;
    border: 2px dashed #e2e8f0;
    border-radius: 0.8rem;
    padding: 1rem;
    margin: 2rem;
    font-family: system-ui, -apple-system, sans-serif;
    z-index: 100000;
  }
  
  .controls-section {
    margin-bottom: 2rem;
  }
  
  .action-buttons {
    display: flex;
    gap: 1rem;
    margin-top: 1.6rem;
  }
  
  .btn {
    padding: 0.8rem 1.6rem;
    border: none;
    border-radius: 0.6rem;
    font-size: 1.4rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }
  
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  .btn-primary {
    background: #3b82f6;
    color: white;
  }
  
  .btn-primary:hover:not(:disabled) {
    background: #2563eb;
  }
  
  .btn-secondary {
    background: #6b7280;
    color: white;
  }
  
  .btn-secondary:hover:not(:disabled) {
    background: #4b5563;
  }
</style>