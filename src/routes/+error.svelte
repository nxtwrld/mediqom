<script lang="ts">
  import { page } from '$app/stores';
  import { t } from '$lib/i18n';
</script>

<div class="error-page">
  <h1>{$t('app.error.title', { values: { status: $page.status } })}</h1>
  <p>{$page.error?.message || $t('app.error.unexpected')}</p>
  <a href="/auth">{$t('app.error.go-to-login')}</a>
</div>

<style>
  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem;
    text-align: center;
  }

  h1 {
    font-size: 2rem;
    margin-bottom: 1rem;
  }

  p {
    margin-bottom: 2rem;
    color: #666;
  }

  a {
    color: #3880ff;
    text-decoration: none;
  }
</style>
