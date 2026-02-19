<script lang="ts">
    import { type Profile } from '$lib/types.d';

    
    interface Props {
        profile?: Profile | null;
        size?: number;
    }

    let { profile = null, size = 3 }: Props = $props();
</script>

<div class="avatar " style="width: min({size}em, 100%);">
{#if profile && profile.avatarUrl}
    <img src={`/v1/med/profiles/${profile.id}/avatar?path=${profile.avatarUrl}`} loading="lazy" alt="Photo of {profile.fullName}" class="profile-image" />
{:else}
    <svg>
        <use href="/icons.svg#user" />
    </svg>

{/if}
</div>



<style>
    .avatar {
        border-radius: 25%;
        width: 100%;
       /* height: 100%;*/
        background-color: var(--color-gray-500);
        display: flex;
        justify-content: center;
        align-items: center;
        overflow: hidden;
        border: 1px solid var(--color-gray-500);
        box-shadow: 0 .3rem .2rem -.1rem var(--color-gray-800);
        aspect-ratio: 1/1;
    }

    .avatar img {
        width: 100%;
        height: 100%;
        object-fit: cover;
    }

    .avatar svg {
        width: 100%;
        height: 100%;
        margin: 10%;
        fill: var(--color-gray-300);
    }
</style>