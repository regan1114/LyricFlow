import { onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { processOverlay } from '../services/colorKey';
import type { RenderResources } from '../engine/resources';
import type { StudioSettings } from '../config/settings';

export type VisualMedia =
  | { id: string; name: string; type: 'image'; url: string; element: HTMLImageElement }
  | { id: string; name: string; type: 'video'; url: string; element: HTMLVideoElement };
export type LayerKind = 'logo' | 'overlay' | 'core';
type Layers = Record<LayerKind, VisualMedia | null>;

export function useMediaLibrary(
  resources: RenderResources,
  settings: StudioSettings,
  reportError: (message: string) => void,
) {
  const backgrounds = shallowRef<VisualMedia[]>([]);
  const layerFiles = shallowRef<Record<LayerKind, File | null>>({
    logo: null,
    overlay: null,
    core: null,
  });
  const layers = shallowRef<Layers>({ logo: null, overlay: null, core: null });
  let disposed = false;

  function release(media: VisualMedia | null) {
    if (!media) return;
    if (media.element instanceof HTMLVideoElement) {
      media.element.pause();
      media.element.removeAttribute('src');
      media.element.load();
    }
    if (media.url.startsWith('blob:')) URL.revokeObjectURL(media.url);
  }

  async function loadVisual(
    fileOrUrl: File | string,
    displayName?: string,
  ): Promise<VisualMedia | null> {
    const isFile = fileOrUrl instanceof File;
    const type = isFile && fileOrUrl.type.startsWith('video/') ? 'video' : 'image';
    const url = isFile ? URL.createObjectURL(fileOrUrl) : fileOrUrl;
    const element = type === 'video' ? document.createElement('video') : new Image();
    const media = {
      id: crypto.randomUUID(),
      name: isFile ? fileOrUrl.name : displayName || '內建場景',
      type,
      url,
      element,
    } as VisualMedia;
    element.crossOrigin = 'anonymous';
    if (element instanceof HTMLVideoElement) {
      element.muted = true;
      element.playsInline = true;
      element.preload = 'auto';
    }
    try {
      await new Promise<void>((resolve, reject) => {
        const readyEvent = type === 'video' ? 'loadeddata' : 'load';
        const timeout = setTimeout(() => finish(new Error(`載入逾時：${media.name}`)), 20000);
        function finish(error?: Error) {
          clearTimeout(timeout);
          element.removeEventListener(readyEvent, ready);
          element.removeEventListener('error', failed);
          if (error) reject(error);
          else resolve();
        }
        const ready = () => finish();
        const failed = () => finish(new Error(`無法載入：${media.name}`));
        element.addEventListener(readyEvent, ready, { once: true });
        element.addEventListener('error', failed, { once: true });
        element.src = url;
      });
      if (disposed) {
        release(media);
        return null;
      }
      return media;
    } catch (error) {
      release(media);
      throw error;
    }
  }

  let backgroundRequest = 0;
  function cancelBackgroundLoad() {
    backgroundRequest++;
  }
  function clearBackgrounds() {
    backgroundRequest++;
    backgrounds.value.forEach(release);
    backgrounds.value = [];
  }

  async function setBuiltInBackground(url: string, name: string) {
    const request = ++backgroundRequest;
    const media = await loadVisual(url, name);
    if (!media || media.type !== 'image') return;
    if (request !== backgroundRequest || disposed) {
      release(media);
      return;
    }
    clearBackgrounds();
    backgrounds.value = [media];
  }

  const layerRequest = { logo: 0, overlay: 0, core: 0 };
  const layerRefs = {
    logo: ['logoImgRef', 'logoVideoRef'],
    core: ['coreImageRef', 'coreVideoRef'],
    overlay: ['overlayImgRef'],
  } as const;
  function clearLayer(kind: LayerKind) {
    layerRequest[kind]++;
    release(layers.value[kind]);
    layers.value = { ...layers.value, [kind]: null };
    layerFiles.value = { ...layerFiles.value, [kind]: null };
    layerRefs[kind].forEach((key) => {
      resources[key].current = null;
    });
    if (kind === 'core') resources.coreMediaCacheRef.current = null;
    if (kind === 'overlay') resources.processedOverlayRef.current = null;
  }

  async function setLayer(kind: LayerKind, file: File) {
    const request = ++layerRequest[kind];
    const media = await loadVisual(file);
    if (!media) return;
    if (kind === 'overlay' && media.type !== 'image') {
      release(media);
      throw new Error('疊圖僅支援圖片。');
    }
    if (request !== layerRequest[kind]) {
      release(media);
      return;
    }
    commitLayer(kind, media, file);
  }

  function commitLayer(kind: LayerKind, media: VisualMedia, file: File) {
    clearLayer(kind);
    layerFiles.value = { ...layerFiles.value, [kind]: file };
    layers.value = { ...layers.value, [kind]: media };
    const [imageRef, videoRef] = layerRefs[kind];
    if (media.type === 'image') resources[imageRef].current = media.element;
    else if (videoRef) resources[videoRef].current = media.element;
    if (media.type === 'video') {
      media.element.loop = true;
      void media.element.play().catch(() => reportError('此瀏覽器暫時無法播放圖層影片。'));
    }
    if (kind === 'overlay') updateOverlay();
  }

  onMounted(async () => {
    const request = ++layerRequest.logo;
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}logo.png`);
      if (!response.ok) throw new Error('無法讀取預設 Logo。');
      const file = new File([await response.blob()], 'logo.png', { type: 'image/png' });
      if (disposed || request !== layerRequest.logo) return;
      const media = await loadVisual(file);
      if (!media) return;
      if (request !== layerRequest.logo) {
        release(media);
        return;
      }
      commitLayer('logo', media, file);
    } catch {
      if (!disposed && request === layerRequest.logo) reportError('預設 Logo 載入失敗。');
    }
  });

  function updateOverlay() {
    resources.processedOverlayRef.current = processOverlay(
      resources.overlayImgRef.current,
      settings,
    );
  }
  watch(
    () => [settings.enableColorKeying, settings.overlayKeyColor, settings.overlayKeyTolerance],
    updateOverlay,
  );
  onBeforeUnmount(() => {
    disposed = true;
    backgrounds.value.forEach(release);
    Object.values(layers.value).forEach(release);
  });
  return {
    loadVisual,
    backgrounds,
    layers,
    layerFiles,
    commitLayer,
    release,
    cancelBackgroundLoad,
    setBuiltInBackground,
    clearBackgrounds,
    setLayer,
    clearLayer,
  };
}
