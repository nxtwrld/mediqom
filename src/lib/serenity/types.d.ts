export interface SerenityFormSchema {
  title: string;
  description: string;
  loincCode: string;
  sessionTiming: "pre" | "post";
  questions: SerenityQuestion[];
  scoringInterpretation: {
    ranges: SerenityScoreRange[];
  };
}

export interface SerenityQuestion {
  id: string;
  text: string;
  responseType: "likert";
  options: string[];
  scores: number[];
}

export interface SerenityScoreRange {
  minScore: number;
  maxScore: number;
  interpretation: string;
  guidance: string;
}

export interface SerenityFormResponse {
  success: boolean;
  formResponses: {
    facialExpression?: number;
    eyeMovement?: number;
    bodyMovement?: number;
    vocalizationBreathing?: number;
    environmentalEngagement?: number;
  };
  totalScore: number;
  interpretation: {
    range: string; // "Good", "Moderate", "Poor"
    guidance: string;
  };
  confidence: number;
  unansweredQuestions: string[];
  reasoning?: string;
}

export interface TranscriptionResult {
  text: string;
  confidence?: number;
  language?: string;
  duration?: number;
}
