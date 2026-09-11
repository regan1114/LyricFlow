import type { StudioSettings } from '../config/settings';
export function applyColorKey(pixels: Uint8ClampedArray, hex: string, tolerance: number) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16));
  const threshold = tolerance * 2.55;
  for (let index = 0; index < pixels.length; index += 4) {
    const distance = Math.max(
      ...channels.map((channel, offset) => Math.abs(pixels[index + offset] - channel)),
    );
    if (distance > threshold) continue;
    const opacity = threshold === 0 ? 0 : Math.max(0, (distance - threshold / 2) / (threshold / 2));
    pixels[index + 3] = Math.round(pixels[index + 3] * opacity);
  }
  return pixels;
}

export function processOverlay(
  image: HTMLImageElement | null,
  settings: Pick<StudioSettings, 'enableColorKeying' | 'overlayKeyColor' | 'overlayKeyTolerance'>,
) {
  if (!image || !settings.enableColorKeying) return image;
  const canvas = document.createElement('canvas');
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return image;
  context.drawImage(image, 0, 0);
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
  applyColorKey(imageData.data, settings.overlayKeyColor, settings.overlayKeyTolerance);
  context.putImageData(imageData, 0, 0);
  return canvas;
}
