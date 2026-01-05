<script lang="ts">
  import { page } from '$app/stores';
</script>

<div class="error-page">
  <h1>Error {$page.status}</h1>
  <p>{$page.error?.message || 'An unexpected error occurred'}</p>
  <a href="/auth">Go to Login</a>
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
