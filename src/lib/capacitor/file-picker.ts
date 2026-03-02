import { Camera, CameraResultType, CameraSource } from '@capacitor/camera';

/** Pick multiple images from the device photo library */
export async function pickFromGallery(): Promise<File[]> {
    const result = await Camera.pickImages({ quality: 90, limit: 10 });
    return Promise.all(
        result.photos.map(async (photo) => {
            const res = await fetch(photo.webPath!);
            const blob = await res.blob();
            return new File([blob], `photo_${Date.now()}.${photo.format}`, {
                type: `image/${photo.format}`,
            });
        }),
    );
}

/** Capture a photo using the device camera */
export async function captureFromCamera(): Promise<File | null> {
    const photo = await Camera.getPhoto({
        quality: 90,
        allowEditing: false,
        resultType: CameraResultType.Uri,
        source: CameraSource.Camera,
    });
    if (!photo.webPath) return null;
    const res = await fetch(photo.webPath);
    const blob = await res.blob();
    return new File([blob], `scan_${Date.now()}.${photo.format}`, {
        type: `image/${photo.format}`,
    });
}
