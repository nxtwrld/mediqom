<script lang="ts">
    // Root page - redirect logic is handled in +page.ts for Capacitor builds
</script>

<div class="placer">
    <div>
        <img src="/icon.svg" alt="mediqom logo" />

        <h1>mediqom</h1>
        <h2>Medical Intelligence to Query, Organize, and Monitor</h2>
        <!--h2>query cure</h2-->
    </div>
</div>

<a href="/auth" class="pi">&#x3C0;</a>


<style>
    :global(html), :global(body) {
        margin: 0;
        padding: 0;
        height: 100%;
        font-family: "Mulish", sans-serif;
        font-optical-sizing: auto;
    }

    .placer {
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: center;
        background-color: var(--color-gray-600);
        width: 100vw;
        height: 100vh;
    }
    img {
        width: 20vh;
        max-width: 20vh;
        max-height: 20vh;
        aspect-ratio: 1/1;
        margin-left: -10%;
    }
    h1 {
        font-size: 3rem;
        color: var(--color-white);
        font-weight: 400;
        margin: 1rem 0 1rem;
        font-family: "Montserrat", sans-serif;
        font-optical-sizing: auto;
    }
    h2 {
        font-size: 2rem;
        color: var(--color-white);
        font-weight: 405;
        margin-top: 1rem;
        font-family: "Montserrat", sans-serif;
        font-optical-sizing: auto;
    }
    .pi {
        position: absolute;
        bottom: .2rem;
        right: .2rem;
        font-size: .8rem;
        color: var(--color-white);
        text-decoration: none;
    }
</style>