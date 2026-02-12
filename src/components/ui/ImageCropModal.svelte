<!-- src/components/ui/ImageCropModal.svelte -->
<script lang="ts">
	import Cropper from 'svelte-easy-crop';
	import type { CropArea, OnCropCompleteEvent } from 'svelte-easy-crop';
	import Modal from './Modal.svelte';
	import { t } from '$lib/i18n';

	interface Props {
		image: string;
		oncrop?: (croppedImage: string) => void;
		oncancel?: () => void;
	}

	let { image, oncrop, oncancel }: Props = $props();

	let crop = $state({ x: 0, y: 0 });
	let zoom = $state(1);
	let pixelCrop: CropArea | null = $state(null);

	function handleCropComplete(e: OnCropCompleteEvent) {
		pixelCrop = e.pixels;
	}

	async function getCroppedImg(imageSrc: string, cropArea: CropArea): Promise<string> {
		const image = new Image();
		image.src = imageSrc;

		return new Promise((resolve, reject) => {
			image.onload = () => {
				const canvas = document.createElement('canvas');
				const ctx = canvas.getContext('2d');

				if (!ctx) {
					reject(new Error('Could not get canvas context'));
					return;
				}

				// Set canvas size to desired output size (max 256x256 for avatars)
				const outputSize = Math.min(256, cropArea.width, cropArea.height);
				canvas.width = outputSize;
				canvas.height = outputSize;

				// Draw the cropped portion scaled to output size
				ctx.drawImage(
					image,
					cropArea.x,
					cropArea.y,
					cropArea.width,
					cropArea.height,
					0,
					0,
					outputSize,
					outputSize
				);

				resolve(canvas.toDataURL('image/png'));
			};

			image.onerror = () => {
				reject(new Error('Failed to load image'));
			};
		});
	}

	async function handleConfirm() {
		if (!pixelCrop) return;

		try {
			const croppedImage = await getCroppedImg(image, pixelCrop);
			oncrop?.(croppedImage);
		} catch (error) {
			console.error('Error cropping image:', error);
		}
	}

	function handleCancel() {
		oncancel?.();
	}
</script>

<Modal onclose={handleCancel}>
	<div class="crop-container">
		<h3>{$t('app.profile.crop-image')}</h3>

		<div class="cropper-wrapper">
			<Cropper
				{image}
				bind:crop
				bind:zoom
				aspect={1}
				oncropcomplete={handleCropComplete}
			/>
		</div>

		<div class="zoom-control">
			<label for="zoom-slider">{$t('app.profile.zoom')}</label>
			<input
				id="zoom-slider"
				type="range"
				min="1"
				max="3"
				step="0.1"
				bind:value={zoom}
			/>
		</div>

		<div class="actions">
			<button class="button secondary" onclick={handleCancel}>
				{$t('app.general.cancel')}
			</button>
			<button class="button primary" onclick={handleConfirm}>
				{$t('app.general.confirm')}
			</button>
		</div>
	</div>
</Modal>

<style>
	.crop-container {
		display: flex;
		flex-direction: column;
		gap: 1rem;
		width: min(400px, 80vw);
	}

	.crop-container h3 {
		margin: 0;
		text-align: center;
	}

	.cropper-wrapper {
		position: relative;
		width: 100%;
		height: 300px;
		background: var(--color-gray-800);
		border-radius: var(--radius-8);
		overflow: hidden;
	}

	.zoom-control {
		display: flex;
		align-items: center;
		gap: 1rem;
	}

	.zoom-control label {
		flex-shrink: 0;
		font-size: 0.875rem;
		color: var(--color-text-secondary);
	}

	.zoom-control input[type="range"] {
		flex: 1;
		height: 6px;
		-webkit-appearance: none;
		appearance: none;
		background: var(--color-gray-500);
		border-radius: 3px;
		outline: none;
		border: 1px solid var(--color-gray-600);
	}

	.zoom-control input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		appearance: none;
		width: 20px;
		height: 20px;
		background: var(--color-blue);
		border-radius: 50%;
		cursor: pointer;
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
		border: 2px solid var(--color-white);
	}

	.zoom-control input[type="range"]::-moz-range-thumb {
		width: 20px;
		height: 20px;
		background: var(--color-blue);
		border-radius: 50%;
		cursor: pointer;
		border: 2px solid var(--color-white);
		box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
	}

	.zoom-control input[type="range"]::-webkit-slider-runnable-track {
		height: 6px;
		border-radius: 3px;
	}

	.zoom-control input[type="range"]::-moz-range-track {
		height: 6px;
		border-radius: 3px;
		background: var(--color-gray-500);
	}

	.actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
	}
</style>
