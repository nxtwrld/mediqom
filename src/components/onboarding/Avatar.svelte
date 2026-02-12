<!-- src/routes/account/Avatar.svelte -->
<script lang="ts">
	import { run } from 'svelte/legacy';

	import { onMount, createEventDispatcher } from 'svelte';
	import { t } from '$lib/i18n';
	import { logger } from '$lib/logging/logger';
	import ImageCropModal from '$components/ui/ImageCropModal.svelte';

	interface Props {
		size?: number;
		url?: string;
		id: string;
		editable?: boolean;
	}

	let {
		size = 10,
		url = $bindable(),
		id,
		editable = false
	}: Props = $props();

	let avatarUrl: string | null = $state(null)
	let uploading = $state(false)
	let files: FileList | undefined = $state()
	let loaded: boolean = $state(false);
	let showCropModal = $state(false);
	let imageToCrop: string | null = $state(null);
	let fileInputElement: HTMLInputElement | undefined = $state();
	let skipNextDownload = $state(false);

	const dispatch = createEventDispatcher()

	const downloadImage = async (path: string) => {
		try {

			const data = await fetch(`/v1/med/profiles/${id}/avatar?path=${path}`).then((res) => res.blob())

			// blob data to base64
			const reader = new FileReader();
			reader.readAsDataURL(data);
			reader.onloadend = function() {
				const base64data = reader.result;
				avatarUrl = base64data as string;
			}
		} catch (error) {
			logger.api.error('Error downloading image: ', error)
		}
	}

	const handleFileSelect = async () => {
		if (!files || files.length === 0) {
			return;
		}

		const file = files[0];
		const base64 = await toBase64(file) as string;
		imageToCrop = base64;
		showCropModal = true;
	}

	const handleCrop = async (croppedImage: string) => {
		showCropModal = false;
		imageToCrop = null;

		try {
			uploading = true;
			const filenameNew = `${Math.random()}.png`;

			const { filename } = await fetch(`/v1/med/profiles/${id}/avatar`, {
				method: 'POST',
				body: JSON.stringify({ file: croppedImage, filename: filenameNew, type: 'image/png' }),
			})
			.then((res) => res.json())
			.catch((error) => {
				logger.api.error('Error uploading avatar:', error)
			})

			// Set flag to skip re-download since we already have the image
			skipNextDownload = true;
			// Set the cropped image for immediate display
			avatarUrl = croppedImage;
			// Update the URL binding
			url = filename;

			setTimeout(() => {
				dispatch('upload')
			}, 100)
		} catch (error) {
			if (error instanceof Error) {
				alert(error.message)
			}
		} finally {
			uploading = false;
			resetFileInput();
		}
	}

	const handleCropCancel = () => {
		showCropModal = false;
		imageToCrop = null;
		resetFileInput();
	}

	const resetFileInput = () => {
		if (fileInputElement) {
			fileInputElement.value = '';
		}
		files = undefined;
	}

	async function toBase64(file: File) {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.readAsDataURL(file);
			reader.onload = () => resolve(reader.result);
			reader.onerror = reject;
		});
	}

	run(() => {
		if (loaded && url) {
			if (skipNextDownload) {
				skipNextDownload = false;
				return;
			}
			downloadImage(url);
		}
	});

	onMount(() => {
		loaded = true;
	})
</script>

<div class="container">
	{#if avatarUrl}
		<img
			src={avatarUrl}
			alt={avatarUrl ? 'Avatar' : 'No image'}
			class="avatar image"
			style="height: {size}em; width: {size}em;"
		/>
	{:else}
		<div class="avatar no-image" style="height: {size}em; width: {size}em;">
			<svg>
				<use href="/icons.svg#user" />
			</svg>
		</div>
	{/if}
	{#if editable}
	<input type="hidden" name="avatarUrl" value={url} />

	<div class="upload" style="width: {size}em;">
		<label class="button primary block" for="single">
			{uploading ? $t('app.profile.uploading') : $t('app.profile.upload')}
		</label>
		<input
			style="visibility: hidden; position:absolute;"
			type="file"
			id="single"
			accept="image/*"
            class="button"
			bind:files
			bind:this={fileInputElement}
			onchange={handleFileSelect}
			disabled={uploading}
		/>
	</div>
	{/if}
</div>

{#if showCropModal && imageToCrop}
	<ImageCropModal
		image={imageToCrop}
		oncrop={handleCrop}
		oncancel={handleCropCancel}
	/>
{/if}


<style>
	.container {
		display: flex;
		flex-direction: column;
		align-items: center;
		position: relative;
		width: 100%;
		height: 100%;
	}
	.avatar {
		border-radius: 50%;
		width: 100%;
		height: 100%;
	}

	.avatar svg {
		width: 100%;
		height: 100%;
		padding: 1rem;
		fill: var(--color-gray-300);
	}

	.no-image {
		background-color: var(--color-gray-500);
	}

	.upload {
		position: absolute;
		margin-top: 1em;
		bottom: .2rem;
		left: 50%;
		transform: translatex(-50%);
		display: flex;
		flex-direction: column;
		align-items: center;
	}
</style>