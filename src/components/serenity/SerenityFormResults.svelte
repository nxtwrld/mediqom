<script lang="ts">
  import type { SerenityFormResponse } from '$lib/serenity/types';

  interface Props {
    formResults: SerenityFormResponse;
    formType: 'pre' | 'post';
  }

  let { formResults, formType }: Props = $props();

  // Question definitions
  const questions = [
    {
      id: 'facialExpression',
      text: 'Facial Expression',
      options: ['Calm, relaxed', 'Mild grimacing, pursed lips', 'Marked pain, tension, furrowed brow']
    },
    {
      id: 'eyeMovement',
      text: 'Eye Movement',
      options: ['Calm gaze, interested in environment', 'Occasional darting, uncertainty', 'Markedly restless, closing eyes, avoiding gaze']
    },
    {
      id: 'bodyMovement',
      text: 'Body Movement / Restlessness',
      options: ['Calm, no signs of restlessness', 'Occasional small movements, hand/foot restlessness', 'Frequent movements, marked restlessness, muscle tension']
    },
    {
      id: 'vocalizationBreathing',
      text: 'Vocalization / Breathing',
      options: ['Calm breathing, no sounds', 'Occasional sighs, mild change in breathing', 'Frequent moaning, markedly irregular breathing']
    },
    {
      id: 'environmentalEngagement',
      text: 'Environmental Engagement',
      options: ['Interest, watches screen, responds', 'Brief attention, occasional disinterest', 'No response, refusal, turning away']
    }
  ];

  // Get score color
  function getScoreColor(totalScore: number): string {
    if (totalScore <= 3) return 'var(--color-positive)';
    if (totalScore <= 6) return 'var(--color-warning, #ffc107)';
    return 'var(--color-negative)';
  }

  // Get score percentage
  function getScorePercentage(totalScore: number): number {
    return (totalScore / 10) * 100;
  }
</script>

<div class="serenity-form-results">
  <h3>SERENITY {formType === 'pre' ? 'Pre-Session' : 'Post-Session'} Assessment Results</h3>

  <!-- Overall Score -->
  <div class="overall-score">
    <div class="score-header">
      <h4>Total Score: {formResults.totalScore} / 10</h4>
      <span class="interpretation" style="color: {getScoreColor(formResults.totalScore)}">
        {formResults.interpretation.range}
      </span>
    </div>
    <div class="score-bar">
      <div
        class="score-fill"
        style="width: {getScorePercentage(formResults.totalScore)}%; background-color: {getScoreColor(formResults.totalScore)}"
      ></div>
    </div>
    <p class="guidance">{formResults.interpretation.guidance}</p>
  </div>

  <!-- Question Responses -->
  <div class="questions">
    <h4>Observations</h4>
    {#each questions as question}
      {@const score = formResults.formResponses[question.id as keyof typeof formResults.formResponses]}
      {@const isAnswered = score !== undefined}
      <div class="question" class:unanswered={!isAnswered}>
        <div class="question-header">
          <span class="question-text">{question.text}</span>
          {#if isAnswered}
            <span class="question-score" style="color: {getScoreColor(score * 3.33)}">
              Score: {score}
            </span>
          {:else}
            <span class="question-unanswered">Not observed</span>
          {/if}
        </div>
        {#if isAnswered && score !== undefined}
          <p class="question-response">{question.options[score]}</p>
        {:else}
          <p class="question-response muted">No observation mentioned in transcript</p>
        {/if}
      </div>
    {/each}
  </div>

  <!-- LLM Metadata -->
  <div class="metadata">
    <p class="confidence">Confidence: {(formResults.confidence * 100).toFixed(0)}%</p>
    {#if formResults.unansweredQuestions.length > 0}
      <p class="unanswered-count">
        {formResults.unansweredQuestions.length} question{formResults.unansweredQuestions.length > 1 ? 's' : ''} not observed
      </p>
    {/if}
    {#if formResults.reasoning}
      <details class="reasoning">
        <summary>LLM Reasoning</summary>
        <p>{formResults.reasoning}</p>
      </details>
    {/if}
  </div>
</div>

<style>
  .serenity-form-results {
    border: 1px solid var(--color-border);
    border-radius: 0.8rem;
    padding: 2.4rem;
    margin-top: 2.4rem;
  }

  h3 {
    margin-top: 0;
    margin-bottom: 2.4rem;
    font-size: 2.4rem;
  }

  h4 {
    margin-top: 0;
    margin-bottom: 1.6rem;
    font-size: 1.8rem;
  }

  .overall-score {
    background: var(--color-surface, #f9f9f9);
    padding: 2.4rem;
    border-radius: 0.8rem;
    margin-bottom: 3.2rem;
  }

  .score-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.6rem;
  }

  .score-header h4 {
    margin: 0;
  }

  .interpretation {
    font-size: 2rem;
    font-weight: bold;
  }

  .score-bar {
    width: 100%;
    height: 2.4rem;
    background: var(--color-border);
    border-radius: 1.2rem;
    overflow: hidden;
    margin-bottom: 1.6rem;
  }

  .score-fill {
    height: 100%;
    transition: width 0.5s ease;
  }

  .guidance {
    font-size: 1.4rem;
    color: var(--color-text-secondary, #666);
    margin: 0;
  }

  .questions {
    margin-bottom: 2.4rem;
  }

  .question {
    border: 1px solid var(--color-border);
    border-radius: 0.4rem;
    padding: 1.6rem;
    margin-bottom: 1.2rem;
  }

  .question.unanswered {
    background: var(--color-surface, #f9f9f9);
    border-style: dashed;
  }

  .question-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.8rem;
  }

  .question-text {
    font-weight: bold;
  }

  .question-score {
    font-weight: bold;
  }

  .question-unanswered {
    color: var(--color-text-secondary, #666);
    font-style: italic;
  }

  .question-response {
    margin: 0;
    font-size: 1.4rem;
  }

  .question-response.muted {
    color: var(--color-text-secondary, #666);
    font-style: italic;
  }

  .metadata {
    padding-top: 1.6rem;
    border-top: 1px solid var(--color-border);
  }

  .confidence,
  .unanswered-count {
    font-size: 1.4rem;
    color: var(--color-text-secondary, #666);
    margin: 0.4rem 0;
  }

  .reasoning {
    margin-top: 1.6rem;
  }

  .reasoning summary {
    cursor: pointer;
    font-weight: bold;
    color: var(--color-interactivity);
  }

  .reasoning p {
    margin-top: 0.8rem;
    font-size: 1.4rem;
    padding-left: 1.6rem;
    border-left: 2px solid var(--color-border);
  }
</style>
