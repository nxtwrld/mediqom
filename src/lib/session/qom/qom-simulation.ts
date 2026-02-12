// QOM Simulation Module
// Realistic medical expert generation based on sample.analysis.1.json

import { qomEventProcessor } from "./qom-event-processor";
import type {
  QOMEvent,
  NodeStartedEvent,
  NodeProgressEvent,
  NodeCompletedEvent,
  NodeFailedEvent,
  ExpertTriggeredEvent,
  RelationshipAddedEvent,
  ModelSwitchedEvent,
  QOMCompletedEvent,
  QOMInitializedEvent,
} from "$components/session/types/qom";

// Type for event sequence - either single event or parallel events
type EventStep = QOMEvent | QOMEvent[];

// Type for event step with timing metadata
interface TimedEventStep {
  events: EventStep;
  delayAfter: number; // Milliseconds to wait after processing this step
}

// Realistic Medical Expert Creation based on sample.analysis.1.json
const SAMPLE_BASED_EXPERT_GENERATION = {
  // Iron deficiency anemia (highest probability: 0.85)
  hematologist: {
    expertId: "hematologist_specialist",
    name: "Hematology Specialist",
    triggerProbability: 0.9, // Almost certain to trigger
    customPrompt:
      "You are a hematologist investigating iron deficiency anemia in a patient with fatigue, heavy menstruation, and hair thinning. Focus on iron studies interpretation and treatment options.",
    investigationFocus: "iron_deficiency_anemia_workup",
    filteredContext: {
      symptoms: ["fatigue", "heavy_menstruation", "hair_thinning"],
      labs: ["iron_studies_pending"],
      priority: "high",
    },
    layer: 3,
    processingTime: 2000,
    icon: "blood-drop",
  },

  // Hypothyroidism (second highest: 0.75)
  endocrinologist: {
    expertId: "endocrinologist_specialist",
    name: "Endocrinology Specialist",
    triggerProbability: 0.8,
    customPrompt:
      "You are an endocrinologist evaluating suspected hypothyroidism in a patient with fatigue, cold intolerance, dry skin, and family history of thyroid disease.",
    investigationFocus: "thyroid_function_assessment",
    filteredContext: {
      symptoms: ["fatigue", "cold_intolerance", "dry_skin", "weight_gain"],
      familyHistory: ["maternal_thyroid_disease"],
      priority: "high",
    },
    layer: 3,
    processingTime: 1500,
    icon: "thyroid",
  },

  // Depression (moderate probability: 0.6)
  psychiatrist: {
    expertId: "psychiatrist_specialist",
    name: "Psychiatry Specialist",
    triggerProbability: 0.7,
    customPrompt:
      "You are a psychiatrist assessing depression in a patient with mood changes, sleep disturbance, and cognitive symptoms. Consider medical causes vs primary psychiatric condition.",
    investigationFocus: "depression_assessment_medical_vs_psychiatric",
    filteredContext: {
      symptoms: ["mood_changes", "sleep_disturbance", "brain_fog"],
      medicalHistory: ["postpartum_period"],
      priority: "medium",
    },
    layer: 3,
    processingTime: 1000,
    icon: "brain",
  },

  // Fibroids (lower probability: 0.4) - May or may not trigger
  gynecologist: {
    expertId: "gynecologist_specialist",
    name: "Gynecology Specialist",
    triggerProbability: 0.5, // 50/50 chance based on lower confidence
    customPrompt:
      "You are a gynecologist evaluating heavy menstrual bleeding and potential fibroids. Assess need for imaging and treatment options.",
    investigationFocus: "heavy_menstrual_bleeding_fibroids",
    filteredContext: {
      symptoms: ["heavy_menstruation", "pelvic_pressure"],
      gynHistory: ["irregular_cycles"],
      priority: "medium",
    },
    layer: 3,
    processingTime: 1800,
    icon: "female",
  },
};

// Generate realistic QOM events based on sample medical case with smart timing
export function createRealisticMedicalQOMEvents(
  sessionId: string,
): TimedEventStep[] {
  const eventSequence: TimedEventStep[] = [];

  // Step 1: QOM initialization (no delay - immediate start)
  eventSequence.push({
    events: {
      type: "qom_initialized",
      qomModelId: "universal_medical_qom_v2",
      nodes: [], // Empty - store will preserve existing nodes from configuration
      links: [], // Empty - store will preserve existing links from configuration
    } as unknown as QOMInitializedEvent,
    delayAfter: 0, // Immediate transition to first node
  });

  // Step 2: Session input node starts (immediate transition)
  eventSequence.push({
    events: {
      type: "node_started",
      nodeId: "session_input",
      nodeName: "Session Data",
      model: "gpt-4",
      provider: "openai",
    } as NodeStartedEvent,
    delayAfter: 100, // Brief processing time for data input
  });

  // Step 3: Session input completes (immediate child start)
  eventSequence.push({
    events: {
      type: "node_completed",
      nodeId: "session_input",
      duration: 100,
      cost: 0,
      tokenUsage: {
        input: 0,
        output: 0,
      },
      output: {
        rawTranscript:
          "Patient presents with fatigue, heavy menstruation, and mood changes",
        sessionMetadata: { sessionId },
      },
    } as unknown as NodeCompletedEvent,
    delayAfter: 0, // Immediate child start - no delay
  });

  // Step 4: Medical Relevance Detector starts (immediate transition)
  eventSequence.push({
    events: {
      type: "node_started",
      nodeId: "symptoms_detector",
      nodeName: "Relevance Detector",
      model: "gpt-4",
      provider: "openai",
    } as NodeStartedEvent,
    delayAfter: 1500, // AI processing time for medical relevance detection
  });

  // Step 5: Symptoms detector completes (immediate child start)
  eventSequence.push({
    events: {
      type: "node_completed",
      nodeId: "symptoms_detector",
      duration: 1500,
      cost: 0.018,
      tokenUsage: {
        input: 800,
        output: 400,
      },
      output: {
        detectedSymptoms: [
          "fatigue",
          "heavy_menstruation",
          "hair_thinning",
          "cold_intolerance",
          "dry_skin",
          "mood_changes",
          "sleep_disturbance",
        ],
        symptomSeverity: {
          fatigue: 8,
          heavy_menstruation: 7,
          mood_changes: 6,
        },
        medicalRelevance: 0.9,
        analysisDecision: "proceed_with_analysis",
      },
    } as unknown as NodeCompletedEvent,
    delayAfter: 0, // Immediate start of parallel analysis nodes
  });

  // Step 6: Start parallel analysis nodes (safety monitor + quorum manager)
  eventSequence.push({
    events: [
      {
        type: "node_started",
        nodeId: "safety_monitor",
        nodeName: "Safety Monitor",
        model: "gpt-4",
        provider: "openai",
      } as NodeStartedEvent,
      {
        type: "node_started",
        nodeId: "quorum_manager",
        nodeName: "Quorum Manager",
        model: "gpt-4",
        provider: "openai",
      } as NodeStartedEvent,
    ],
    delayAfter: 1000, // Brief delay to allow UI to show both nodes starting
  });

  // For simulation purposes, trigger all experts (no probability filtering)
  const triggeredExperts = Object.entries(SAMPLE_BASED_EXPERT_GENERATION).map(
    ([key, expert]) => ({ key, expert }),
  );

  // Step 7: Trigger expert nodes (while quorum manager is still running)
  if (triggeredExperts.length > 0) {
    const expertTriggerEvents: ExpertTriggeredEvent[] = triggeredExperts.map(
      ({ expert }) =>
        ({
          type: "expert_triggered",
          parentId: "quorum_manager",
          expertId: expert.expertId,
          expertName: expert.name,
          triggerConditions: Object.keys(expert.filteredContext.symptoms || {}),
          layer: expert.layer,
        }) as ExpertTriggeredEvent,
    );

    eventSequence.push({
      events: expertTriggerEvents,
      delayAfter: 500, // Brief delay to show expert generation visually
    });
  }

  // Step 8: Safety monitor completes (standalone node - uses processing delay)
  eventSequence.push({
    events: {
      type: "node_completed",
      nodeId: "safety_monitor",
      duration: 2000,
      cost: 0.015,
      tokenUsage: {
        input: 600,
        output: 350,
      },
      output: {
        safetyAlerts: [],
        riskAssessment: "low",
        contraindications: [],
      },
    } as unknown as NodeCompletedEvent,
    delayAfter: 1000, // Brief delay before starting expert processing
  });

  // Step 9: Start all expert nodes in parallel (immediate after trigger)
  if (triggeredExperts.length > 0) {
    const expertStartEvents: NodeStartedEvent[] = triggeredExperts.map(
      ({ expert }) =>
        ({
          type: "node_started",
          nodeId: expert.expertId,
          nodeName: expert.name,
          model: "gpt-4",
          provider: "openai",
        }) as NodeStartedEvent,
    );

    eventSequence.push({
      events: expertStartEvents,
      delayAfter: 0, // Experts start immediately after being triggered
    });
  }

  // Step 10: Quorum manager completes (has child nodes - no delay for children)
  eventSequence.push({
    events: {
      type: "node_completed",
      nodeId: "quorum_manager",
      duration: 4500,
      cost: 0.032,
      tokenUsage: {
        input: 1500,
        output: 900,
      },
      output: {
        symptoms: [],
        diagnoses: [],
        treatments: [],
        questions: [],
        confidence: 0.78,
        reasoning: `Complex multi-system symptoms require ${triggeredExperts.length} specialist evaluations for comprehensive analysis`,
        expertId: "quorum_manager",
        layer: 2,
        customExpertsGenerated: triggeredExperts.map(
          ({ expert }) => expert.expertId,
        ),
      },
    } as unknown as NodeCompletedEvent,
    delayAfter: 0, // No delay - children (expert processing) can begin immediately
  });

  // Step 11: Experts complete (each at different times based on processing time)
  // We'll complete them in order of processing time for more realistic simulation
  const sortedExperts = [...triggeredExperts].sort(
    (a, b) => a.expert.processingTime - b.expert.processingTime,
  );

  sortedExperts.forEach(({ key, expert }, index) => {
    const analysis = generateSpecialistAnalysis(key, expert);
    const isLastExpert = index === sortedExperts.length - 1;

    eventSequence.push({
      events: {
        type: "node_completed",
        nodeId: expert.expertId,
        duration: expert.processingTime,
        cost: 0.045,
        tokenUsage: {
          input: 1800,
          output: 1100,
        },
        output: analysis,
      } as unknown as NodeCompletedEvent,
      delayAfter: isLastExpert ? 0 : 500, // No delay for last expert (triggers consensus), brief gap for others
    });
  });

  // Step 12: Consensus merger starts (immediate after experts complete)
  if (triggeredExperts.length > 0) {
    eventSequence.push({
      events: {
        type: "node_started",
        nodeId: "consensus_merger",
        nodeName: "Consensus Builder",
        model: "gpt-4-turbo",
        provider: "openai",
      } as NodeStartedEvent,
      delayAfter: 4200, // Processing time for consensus building
    });

    // Step 13: Consensus merger completes (immediate child start)
    eventSequence.push({
      events: {
        type: "node_completed",
        nodeId: "consensus_merger",
        duration: 4200,
        cost: 0.035,
        tokenUsage: {
          input: 2500,
          output: 1200,
        },
        output: generateConsensusAnalysis(triggeredExperts),
      } as unknown as NodeCompletedEvent,
      delayAfter: 0, // Immediate transition to final output
    });
  }

  // Step 14: Final output node starts (immediate after consensus)
  eventSequence.push({
    events: {
      type: "node_started",
      nodeId: "final_output",
      nodeName: "Final Medical Analysis",
      model: "gpt-4",
      provider: "openai",
    } as NodeStartedEvent,
    delayAfter: 1000, // Processing time for final output
  });

  // Step 15: Final output completes (triggers completion)
  eventSequence.push({
    events: {
      type: "node_completed",
      nodeId: "final_output",
      duration: 1000,
      cost: 0.01,
      tokenUsage: {
        input: 500,
        output: 200,
      },
      output: {
        finalRecommendations: "Based on comprehensive analysis...",
        confidenceScores: { overall: 0.85 },
        expertAttributions: triggeredExperts.map(({ expert }) => expert.name),
      },
    } as unknown as NodeCompletedEvent,
    delayAfter: 0, // Immediate QOM completion
  });

  // Step 16: QOM completion (final event)
  eventSequence.push({
    events: {
      type: "qom_completed",
      totalDuration: 15000, // Approximate total duration
      totalCost: 0.18,
      nodeCount: 6 + triggeredExperts.length,
      successCount: 6 + triggeredExperts.length,
      failureCount: 0,
      parallelExpertsGenerated: triggeredExperts.length,
      consensusAchieved: true,
      finalOutput: {
        symptoms: [],
        diagnoses: [],
        treatments: [],
        questions: [],
        confidence: 0.85,
        reasoning: `Integrated analysis from ${triggeredExperts.length} specialists based on sample medical case`,
        expertId: "consensus_merger",
        layer: 4,
        expertContributions: triggeredExperts.map(
          ({ expert }) => `${expert.name}: ${expert.investigationFocus}`,
        ),
      },
    } as QOMCompletedEvent,
    delayAfter: 0, // Final event - no delay needed
  });

  return eventSequence;
}

// Generate realistic specialist analysis based on sample.analysis.1.json findings
function generateSpecialistAnalysis(specialistType: string, expert: any) {
  const baseAnalysis = {
    confidence: 0.8,
    reasoning: `Specialized ${expert.name} analysis based on filtered patient context`,
    investigationFocus: expert.investigationFocus,
    customPromptUsed: expert.customPrompt,
  };

  switch (specialistType) {
    case "hematologist":
      return {
        ...baseAnalysis,
        recommendation:
          "Complete iron studies, consider IV iron therapy if deficient",
        findings: [
          "Symptoms consistent with iron deficiency anemia",
          "Heavy menstruation likely contributing factor",
          "Recommend comprehensive iron panel and CBC",
        ],
        confidence: 0.85,
        priority: "high",
      };

    case "endocrinologist":
      return {
        ...baseAnalysis,
        recommendation:
          "TSH, T4, T3, anti-TPO antibodies; consider thyroid replacement therapy",
        findings: [
          "Classic hypothyroid symptom constellation",
          "Family history supports thyroid dysfunction",
          "Recommend complete thyroid function assessment",
        ],
        confidence: 0.82,
        priority: "high",
      };

    case "psychiatrist":
      return {
        ...baseAnalysis,
        recommendation:
          "Comprehensive psychiatric evaluation; rule out medical causes first",
        findings: [
          "Mood and cognitive symptoms present",
          "Consider secondary depression vs primary psychiatric",
          "Recommend coordinated care with medical specialists",
        ],
        confidence: 0.7,
        priority: "medium",
      };

    case "gynecologist":
      return {
        ...baseAnalysis,
        recommendation:
          "Pelvic ultrasound, consider hormonal management options",
        findings: [
          "Heavy menstrual bleeding pattern concerning",
          "Potential structural causes require imaging",
          "Multiple treatment options available",
        ],
        confidence: 0.65,
        priority: "medium",
      };

    default:
      return baseAnalysis;
  }
}

// Generate consensus analysis integrating all specialist perspectives
function generateConsensusAnalysis(triggeredExperts: any[]) {
  const expertNames = triggeredExperts.map(({ expert }) => expert.name);

  return {
    consensusRecommendation:
      "Coordinated multi-specialty evaluation with iron deficiency and thyroid function as primary concerns",
    expertAgreements: [
      "All specialists agree on need for laboratory evaluation",
      "Fatigue likely has multiple contributing factors",
      "Coordinated care approach recommended",
    ],
    expertDisagreements: [
      "Priority ordering varies between specialists",
      "Treatment urgency assessment differs by specialty",
    ],
    finalReasoning: `Integration of ${expertNames.length} specialist perspectives provides comprehensive differential diagnosis`,
    confidence: 0.85,
    prioritizedActions: [
      "Complete blood count and iron studies (hematology priority)",
      "Thyroid function tests (endocrinology priority)",
      "Coordinate medical evaluation before psychiatric treatment",
      "Consider gynecologic evaluation for menstrual issues",
    ],
    participatingExperts: expertNames,
  };
}

// Main simulation function - now uses smart timing with context-aware delays
export function simulateRealisticMedicalQOM(
  sessionId: string,
  _intervalMs = 2500,
) {
  const eventSequence = createRealisticMedicalQOMEvents(sessionId);

  console.log("🏥 Starting realistic medical QOM simulation with smart timing");
  console.log(`📊 Generated ${eventSequence.length} event steps`);

  let currentStep = 0;
  let timeoutId: number | null = null;

  const processNextStep = () => {
    if (currentStep >= eventSequence.length) {
      console.log("🎬 Realistic medical QOM simulation completed");
      return;
    }

    // Get current timed event step
    const timedStep = eventSequence[currentStep];
    const stepEvents = Array.isArray(timedStep.events)
      ? (timedStep.events as QOMEvent[])
      : [timedStep.events as QOMEvent];

    console.log(
      `🎭 Step ${currentStep + 1}: Processing ${stepEvents.length} event(s), delay after: ${timedStep.delayAfter}ms`,
    );

    // Process all events in this step
    stepEvents.forEach((event) => {
      //console.log(`   📅 ${event.type}`);
      qomEventProcessor.processEvent(event);
    });

    currentStep++;

    // Schedule next step with smart delay
    if (currentStep < eventSequence.length) {
      const delay = timedStep.delayAfter; // Use smart delay from timing metadata
      if (delay > 0) {
        console.log(
          `⏱️  Waiting ${delay}ms before next step (${delay === 0 ? "immediate parent→child" : "processing time"})`,
        );
      }
      timeoutId = window.setTimeout(processNextStep, delay);
    }
  };

  // Start processing the first step
  processNextStep();

  // Return cleanup function
  return () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  };
}

// Export individual expert definitions for reference
export { SAMPLE_BASED_EXPERT_GENERATION };
