<script setup lang="ts">
import { onBeforeUnmount } from 'vue';
import { LockKeyhole } from '@lucide/vue';
import { useStudio } from '../../composables/useStudio';
import type { MediaClip } from '../../domain/mediaSequence';
const props = defineProps<{ scale: number }>();
const { sequence, player, mediaTab, subtitleEditor } = useStudio();
let cleanup: (() => void) | null = null;
let moved = false;
onBeforeUnmount(() => cleanup?.());
function select(clip: MediaClip) {
  if (sequence.visualLocked.value && clip.track === 'V1') return;
  sequence.selectedId.value = clip.id;
  subtitleEditor.selectedId.value = null;
  mediaTab.value = 'assets';
  if (!moved) player.seek(clip.start);
  moved = false;
}
function drag(event: PointerEvent, clip: MediaClip, mode: 'move' | 'start' | 'end') {
  if (
    sequence.disabled.value ||
    (sequence.visualLocked.value && clip.track === 'V1') ||
    event.button !== 0
  )
    return;
  event.preventDefault();
  event.stopPropagation();
  cleanup?.();
  sequence.selectedId.value = clip.id;
  subtitleEditor.selectedId.value = null;
  mediaTab.value = 'assets';
  const original = { ...clip };
  const asset = sequence.assetMap.value.get(clip.assetId)!;
  const origin = event.clientX;
  const scale = props.scale;
  const scroller = (event.currentTarget as HTMLElement).closest('.subtitle-scroll');
  const scroll = scroller?.scrollLeft || 0;
  moved = false;
  sequence.begin();
  function move(pointer: PointerEvent) {
    if (sequence.disabled.value || (sequence.visualLocked.value && clip.track === 'V1')) {
      end(true);
      return;
    }
    if (!moved && Math.abs(pointer.clientX - origin) < 3) return;
    moved = true;
    let delta = (pointer.clientX - origin + (scroller?.scrollLeft || 0) - scroll) / scale;
    if (subtitleEditor.snapping.value) delta = Math.round(delta * 10) / 10;
    let start = original.start,
      length = original.duration,
      trim = original.trimStart;
    if (mode === 'move') start = Math.max(0, original.start + delta);
    else if (mode === 'end')
      length = Math.max(
        0.05,
        Math.min(
          original.duration + delta,
          asset.kind === 'image' ? Infinity : asset.duration - trim,
        ),
      );
    else {
      delta = Math.max(-original.start, Math.min(original.duration - 0.05, delta));
      if (asset.kind !== 'image') delta = Math.max(-original.trimStart, delta);
      start += delta;
      length -= delta;
      if (asset.kind !== 'image') trim += delta;
    }
    sequence.update(clip.id, { start, duration: length, trimStart: trim });
  }
  function end(cancel = false) {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', abort);
    window.removeEventListener('blur', abort);
    if (cancel) sequence.cancel();
    else sequence.commit();
    cleanup = null;
  }
  function up() {
    end();
  }
  function abort() {
    end(true);
  }
  cleanup = abort;
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', abort);
  window.addEventListener('blur', abort);
}
</script>
<template>
  <div
    v-for="track in sequence.tracks.value"
    :key="track"
    class="media-track-row"
    :class="{ 'is-locked': track === 'V1' && sequence.visualLocked.value }"
    :aria-disabled="track === 'V1' && sequence.visualLocked.value"
    :aria-label="`${track} ${track === 'V1' ? '畫面軌道' : '音訊軌道'}`"
    role="group"
  >
    <div class="media-track-label">
      {{ track }} · {{ track === 'V1' ? '圖片／影片' : track === 'A1' ? '主要音訊' : '配音／配樂' }}
      <span
        v-if="track === 'V1' && sequence.visualLocked.value"
        class="track-lock-label"
        ><LockKeyhole :size="12" /> 自動模式 · 已鎖定</span
      >
    </div>
    <div class="media-track-clips">
      <span
        v-if="!sequence.clips.value.some((clip) => clip.track === track)"
        class="media-track-empty"
        >{{
          track === 'V1' && sequence.visualLocked.value
            ? '圖片正由自動編排控制；到 Dashboard 切換「手動時間軸」即可解鎖。'
            : `從素材庫加入${track === 'V1' ? '圖片／影片' : '音訊'}`
        }}</span
      >
      <button
        v-for="clip in sequence.clips.value.filter((item) => item.track === track)"
        :key="clip.id"
        class="media-clip"
        :disabled="track === 'V1' && sequence.visualLocked.value"
        :class="{ selected: sequence.selectedId.value === clip.id, audio: track !== 'V1' }"
        :style="{
          left: `${clip.start * scale}px`,
          width: `${Math.max(4, clip.duration * scale)}px`,
        }"
        :aria-label="`選取影音片段：${sequence.assetMap.value.get(clip.assetId)?.name}`"
        @pointerdown="drag($event, clip, 'move')"
        @click="select(clip)"
      >
        <i
          class="subtitle-trim start"
          @pointerdown.stop="drag($event, clip, 'start')"
        />
        {{ sequence.assetMap.value.get(clip.assetId)?.name }}
        <i
          class="subtitle-trim end"
          @pointerdown.stop="drag($event, clip, 'end')"
        />
      </button>
      <i
        class="subtitle-playhead"
        :style="{ '--playhead-x': `${player.currentTime.value * scale}px` }"
      />
    </div>
  </div>
</template>
