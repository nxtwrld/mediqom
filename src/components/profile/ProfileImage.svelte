<script lang="ts">
    import { type Profile } from '$lib/types.d';
    import { imgSrc } from '$lib/api/image';

    interface Props {
        profile?: Profile | null;
        size?: number;
    }

    let { profile = null, size = 3 }: Props = $props();

    let imageSrc = $state<string | null>(null);

    $effect(() => {
        const id = profile?.id;
        const avatarUrl = profile?.avatarUrl;

        if (!id || !avatarUrl) {
            imageSrc = null;
            return;
        }

        const url = `/v1/med/profiles/${id}/avatar?path=${avatarUrl}`;
        let blobUrl: string | null = null;
        let cancelled = false;

        imgSrc(url).then((src) => {
            if (cancelled) {
                if (src) URL.revokeObjectURL(src);
                return;
            }
            blobUrl = src;
            imageSrc = src;
        });

        return () => {
            cancelled = true;
            if (blobUrl) {
                URL.revokeObjectURL(blobUrl);
                blobUrl = null;
            }
            imageSrc = null;
        };
    });
</script>

<div class="avatar" style="width: min({size}em, 100%);">
{#if imageSrc}
    <img src={imageSrc} loading="lazy" alt="Photo of {profile?.fullName}" class="profile-image" />
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
