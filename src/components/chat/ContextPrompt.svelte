<script lang="ts">
  import type { ContextPrompt } from '$lib/chat/types.d';
  import { t } from '$lib/i18n';

  interface Props {
    prompt: ContextPrompt;
  }

  let { prompt }: Props = $props();

  // State for clarifying question handling
  let selectedOptions = $state<string[]>([]);
  let customAnswer = $state('');

  const toggleOption = (option: string) => {
    if (prompt.questionData?.multiSelect) {
      selectedOptions = selectedOptions.includes(option)
        ? selectedOptions.filter(o => o !== option)
        : [...selectedOptions, option];
    } else {
      selectedOptions = [option];
    }
  };

  const submitAnswer = () => {
    const answers = customAnswer.trim()
      ? [...selectedOptions, customAnswer.trim()]
      : selectedOptions;
    prompt.onAnswer?.(answers);
  };

  const getToolIconName = (toolName?: string): string => {
    if (!toolName) return 'tool';

    const icons: Record<string, string> = {
      searchDocuments: 'search',
      getProfileData: 'profile',
      queryMedicalHistory: 'medical-history',
      getAssembledContext: 'context-assembly',
      getDocumentById: 'document'
    };

    return icons[toolName] || 'tool';
  };
</script>

<div class="context-prompt {prompt.type}">
  {#if prompt.type === 'tool'}
    <div class="tool-header">
      <svg class="tool-icon" width="20" height="20">
        <use href="/icons.svg#{getToolIconName(prompt.toolName)}" />
      </svg>
      <h4 class="tool-title">{prompt.title}</h4>
    </div>
  {/if}
  
  <p class="context-prompt-text">
    {$t(prompt.messageKey, { values: prompt.messageParams })}
  </p>
  
  {#if prompt.type === 'tool' && prompt.dataAccessDescription}
    <ul class="data-access-list">
      {#each prompt.dataAccessDescription as access}
        <li>{access}</li>
      {/each}
    </ul>
  {/if}
  
  {#if prompt.type === 'tool' && prompt.securityLevel}
    <div class="security-badge level-{prompt.securityLevel}">
      {$t('chat.tool.security.' + prompt.securityLevel)}
    </div>
  {/if}

  {#if prompt.type === 'clarifyingQuestion' && prompt.questionData}
    <div class="question-options">
      {#each prompt.questionData.options as option}
        <button
          class="option-btn"
          class:selected={selectedOptions.includes(option)}
          onclick={() => toggleOption(option)}
        >
          {option}
        </button>
      {/each}
    </div>

    {#if prompt.questionData.allowCustom !== false}
      <input
        type="text"
        class="custom-answer"
        placeholder={$t('app.chat.clarifyingQuestion.placeholder')}
        bind:value={customAnswer}
        onkeydown={(e) => e.key === 'Enter' && (selectedOptions.length > 0 || customAnswer.trim()) && submitAnswer()}
      />
    {/if}

    {#if prompt.questionData.context}
      <p class="question-context">{prompt.questionData.context}</p>
    {/if}

    <button
      class="submit-btn"
      disabled={selectedOptions.length === 0 && !customAnswer.trim()}
      onclick={submitAnswer}
    >
      {$t('app.buttons.continue')}
    </button>
  {/if}

  {#if prompt.type !== 'clarifyingQuestion'}
    <div class="context-actions">
      <button
        class="context-btn accept"
        onclick={prompt.onAccept}
      >
        {$t(prompt.acceptLabelKey)}
      </button>
      <button
        class="context-btn decline"
        onclick={prompt.onDecline}
      >
        {$t(prompt.declineLabelKey)}
      </button>
    </div>
  {/if}
</div>

<style>
  .context-prompt {
    margin-top: 8px;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid;
  }

  .context-prompt.document {
    background: var(--color-gray-300);
    border-color: var(--color-gray-400);
  }

  .context-prompt.profile {
    background: var(--color-interactivity-light);
    border-color: var(--color-interactivity-light);
  }

  .context-prompt.tool {
    background: var(--color-info-light);
    border-color: var(--color-info-light);
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 12px;
  }

  .tool-icon {
    color: var(--color-info);
    flex-shrink: 0;
  }

  .tool-title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
    color: var(--color-info-dark);
  }

  .context-prompt-text {
    margin: 0 0 12px 0;
    font-size: 14px;
    line-height: 1.4;
  }

  .context-prompt.document .context-prompt-text {
    color: var(--color-black);
  }

  .context-prompt.profile .context-prompt-text {
    color: var(--color-interactivity-dark);
  }

  .context-prompt.tool .context-prompt-text {
    color: var(--color-info-dark);
  }

  .data-access-list {
    margin: 12px 0;
    padding-left: 20px;
    font-size: 13px;
    color: var(--color-info-dark);
  }

  .data-access-list li {
    margin: 4px 0;
  }

  .security-badge {
    display: inline-block;
    padding: 4px 12px;
    margin-bottom: 12px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .security-badge.level-low {
    background: var(--color-positive-light);
    color: var(--color-positive-dark);
  }

  .security-badge.level-medium {
    background: var(--color-warning-light);
    color: var(--color-warning-dark);
  }

  .security-badge.level-high {
    background: var(--color-warning-light);
    color: var(--color-warning-dark);
  }

  .context-actions {
    display: flex;
    gap: 8px;
  }

  .context-btn {
    flex: 1;
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .context-btn.accept {
    color: var(--color-white);
  }

  .context-prompt.document .context-btn.accept {
    background: var(--color-positive);
  }

  .context-prompt.document .context-btn.accept:hover {
    background: var(--color-green);
  }

  .context-prompt.profile .context-btn.accept {
    background: var(--color-blue);
  }

  .context-prompt.profile .context-btn.accept:hover {
    background: var(--color-interactivity);
  }

  .context-prompt.tool .context-btn.accept {
    background: var(--color-purple);
  }

  .context-prompt.tool .context-btn.accept:hover {
    background: var(--color-info);
  }

  .context-btn.decline {
    background: var(--color-gray-400);
    color: var(--color-black);
  }

  .context-btn.decline:hover {
    background: var(--color-gray-500);
  }

  /* Clarifying Question Styles */
  .context-prompt.clarifyingQuestion {
    background: var(--color-gray-300);
    border-color: var(--color-gray-500);
  }

  .question-options {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 12px;
  }

  .option-btn {
    padding: 8px 16px;
    border: 2px solid var(--color-gray-600);
    border-radius: 20px;
    background: var(--color-white);
    color: var(--color-black);
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .option-btn:hover {
    background: var(--color-gray-400);
    border-color: var(--color-gray-800);
  }

  .option-btn.selected {
    background: var(--color-blue);
    border-color: var(--color-blue);
    color: var(--color-white);
  }

  .custom-answer {
    width: 100%;
    padding: 10px 14px;
    border: 1px solid var(--color-gray-500);
    border-radius: var(--radius-8);
    font-size: 14px;
    margin-bottom: 12px;
    box-sizing: border-box;
    background: var(--color-white);
  }

  .custom-answer:focus {
    outline: none;
    border-color: var(--color-blue);
    box-shadow: 0 0 0 3px var(--color-gray-400-alpha);
  }

  .custom-answer::placeholder {
    color: var(--color-gray-800);
  }

  .question-context {
    margin: 0 0 12px 0;
    font-size: 13px;
    color: var(--color-gray-800);
    font-style: italic;
  }

  .submit-btn {
    width: 100%;
    padding: 10px 20px;
    background: var(--color-blue);
    color: var(--color-white);
    border: none;
    border-radius: var(--radius-8);
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .submit-btn:hover:not(:disabled) {
    background: var(--color-interactivity);
    filter: brightness(0.9);
  }

  .submit-btn:disabled {
    background: var(--color-gray-500);
    color: var(--color-gray-800);
    cursor: not-allowed;
  }
</style>