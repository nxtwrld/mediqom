<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';

  // Convert reactive assignments to $derived
  let error = $derived($page.url.searchParams.get('error') || $t('app.auth.unknown-error'));
  let errorDetails = $derived($page.url.searchParams.get('errorDetails'));
  let redirectUrl = $derived($page.url.searchParams.get('redirect') || '/auth');

  let showDetails = $state(false);
</script>

<svelte:head>
  <title>{$t('app.auth.error-title')}</title>
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-gray-50">
  <div class="max-w-md w-full space-y-8">
    <div class="text-center">
      <div class="mx-auto h-12 w-12 text-red-500">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"></path>
        </svg>
      </div>
      <h2 class="mt-6 text-3xl font-extrabold text-gray-900">
        {$t('app.auth.error-title')}
      </h2>
      <p class="mt-2 text-sm text-gray-600">
        {error}
      </p>
    </div>

    <div class="space-y-4">
      <div class="text-center">
        <a
          href="/auth"
          class="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
        >
          {$t('app.auth.try-again')}
        </a>
      </div>

      {#if redirectUrl && redirectUrl !== '/auth'}
        <div class="text-center">
          <a
            href={redirectUrl}
            class="w-full flex justify-center py-2 px-4 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
          >
            {$t('app.auth.return-to-app')}
          </a>
        </div>
      {/if}

      {#if errorDetails}
        <div class="text-center">
          <button
            onclick={() => showDetails = !showDetails}
            class="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            {showDetails ? $t('app.auth.hide-details') : $t('app.auth.show-details')}
          </button>

          {#if showDetails}
            <div class="mt-2 p-2 bg-gray-100 rounded text-xs text-left overflow-auto">
              <pre>{errorDetails}</pre>
            </div>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>