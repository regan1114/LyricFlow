<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useStudio } from '../../composables/useStudio';
import { parseSubtitles, type SubtitleCue } from '../../domain/subtitles';
import { formatPlaybackTime } from '../../engine/time';
import MediaTracks from './MediaTracks.vue';
const { lyrics, player, recording, subtitleEditor: editor, sequence } = useStudio();
const cues = computed(() =>
  lyrics.isSyncing.value
    ? parseSubtitles(lyrics.syncLines.value.slice(0, lyrics.syncIndex.value).join('\n'))
    : editor.items.value,
);
const duration = computed(() =>
  Math.max(1, player.duration.value, ...cues.value.map((cue) => cue.endTime)),
);
const scroller = ref<HTMLElement | null>(null);
const available = ref(800);
const zoom = ref(1);
const width = computed(() => Math.max(available.value, available.value * zoom.value));
const scale = computed(() => width.value / duration.value);
const tickStep = computed(() => {
  const minimum = 90 / scale.value;
  const magnitude = 10 ** Math.floor(Math.log10(minimum));
  const normalized = minimum / magnitude;
  return Math.max(
    0.01,
    magnitude * (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10),
  );
});
function tickLabel(time: number) {
  const precision = tickStep.value < 0.1 ? 2 : 1;
  const fraction = (time % 1).toFixed(precision).slice(1);
  return formatPlaybackTime(time) + (tickStep.value < 1 ? fraction : '');
}
const ticks = computed(() =>
  Array.from(
    { length: Math.floor(duration.value / tickStep.value) + 1 },
    (unusedValue, index) => index * tickStep.value,
  ),
);
const disabled = computed(() => !player.isLoaded.value || recording.isRecording.value);
const guide = ref<number | null>(null);
const canSplit = computed(
  () =>
    editor.selectedIds.value.length === 1 &&
    editor.selected.value &&
    player.currentTime.value > editor.selected.value.time + 0.05 &&
    player.currentTime.value < editor.selected.value.endTime - 0.05,
);
let stopDrag: (() => void) | null = null;
let dragged = false;
const marquee = ref<{ left: number; top: number; width: number; height: number } | null>(null);
watch(
  () => editor.disabled.value,
  (value) => {
    if (value) stopDrag?.();
  },
);
function boxSelect(event: PointerEvent) {
  if (event.button !== 0 || editor.disabled.value) return;
  event.preventDefault();
  stopDrag?.();
  const track = event.currentTarget as HTMLElement;
  const previous = [...editor.selectedIds.value];
  const previousMedia = sequence.selectedId.value;
  const bounds = track.getBoundingClientRect();
  const start = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  const origin = { x: event.clientX, y: event.clientY };
  let pointer = { x: event.clientX, y: event.clientY };
  let moved = false;
  let frame = 0;
  let lastFrame = 0;
  // Freeze clip geometry during the gesture; scrolling only changes the track origin.
  const elements = track.querySelectorAll<HTMLElement>('.subtitle-clip');
  const rectangles = cues.value.map((cue, index) => {
    const element = elements[index];
    return {
      uid: cue.uid,
      left: element.offsetLeft,
      right: element.offsetLeft + element.offsetWidth,
      top: element.offsetTop,
      bottom: element.offsetTop + element.offsetHeight,
    };
  });
  function update() {
    if (!moved) return;
    const rect = track.getBoundingClientRect();
    const end = {
      x: Math.max(0, Math.min(width.value, pointer.x - rect.left)),
      y: Math.max(0, Math.min(rect.height, pointer.y - rect.top)),
    };
    const left = Math.min(start.x, end.x),
      top = Math.min(start.y, end.y);
    const right = Math.max(start.x, end.x),
      bottom = Math.max(start.y, end.y);
    marquee.value = { left, top, width: right - left, height: bottom - top };
    sequence.selectedId.value = null;
    editor.selectMany(
      rectangles
        .filter(
          (clip) =>
            clip.right >= left && clip.left <= right && clip.bottom >= top && clip.top <= bottom,
        )
        .map((clip) => clip.uid),
    );
  }
  function move(next: PointerEvent) {
    if (next.pointerId !== event.pointerId) return;
    pointer = { x: next.clientX, y: next.clientY };
    if (Math.hypot(pointer.x - origin.x, pointer.y - origin.y) >= 3) moved = true;
    update();
  }
  function scroll(now: number) {
    const elapsed = lastFrame ? Math.min(32, now - lastFrame) : 0;
    lastFrame = now;
    const container = scroller.value;
    if (moved && container) {
      const rect = container.getBoundingClientRect();
      const direction = pointer.x < rect.left + 24 ? -1 : pointer.x > rect.right - 24 ? 1 : 0;
      if (direction) container.scrollLeft += direction * elapsed * 0.5;
      update();
    }
    frame = requestAnimationFrame(scroll);
  }
  function finish(cancelled = false) {
    cancelAnimationFrame(frame);
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    marquee.value = null;
    if (cancelled) {
      editor.selectMany(previous);
      sequence.selectedId.value = previousMedia;
    } else if (!moved) {
      editor.selectMany([]);
      sequence.selectedId.value = null;
      if (!disabled.value) player.seek(start.x / scale.value);
    }
    stopDrag = null;
  }
  function up(next: PointerEvent) {
    if (next.pointerId === event.pointerId) finish();
  }
  function cancel() {
    finish(true);
  }
  stopDrag = cancel;
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
  frame = requestAnimationFrame(scroll);
}

const observer = new ResizeObserver(() => {
  available.value = scroller.value?.clientWidth || 800;
});
onMounted(() => {
  if (scroller.value) observer.observe(scroller.value);
  window.addEventListener('keydown', keyboard);
});
onBeforeUnmount(() => {
  stopDrag?.();
  observer.disconnect();
  window.removeEventListener('keydown', keyboard);
});
function seek(event: PointerEvent) {
  if (disabled.value) return;
  const bounds = event.currentTarget as HTMLElement;
  player.seek((event.clientX - bounds.getBoundingClientRect().left) / scale.value);
}
function select(cue: SubtitleCue) {
  sequence.selectedId.value = null;
  if (!dragged) editor.selectedId.value = cue.uid;
  if (!dragged && !disabled.value) player.seek(cue.time);
  dragged = false;
}
function drag(event: PointerEvent, cue: SubtitleCue, mode: 'move' | 'start' | 'end') {
  if (event.button !== 0 || editor.disabled.value) return;
  event.preventDefault();
  event.stopPropagation();
  stopDrag?.();
  sequence.selectedId.value = null;
  if (mode !== 'move' || !editor.selectedSet.value.has(cue.uid)) editor.selectedId.value = cue.uid;
  const originals = editor.selectedItems.value.map((item) => ({ ...item }));
  const original = { ...cue };
  const origin = event.clientX;
  const originScroll = scroller.value?.scrollLeft || 0;
  const pixelsPerSecond = scale.value;
  const candidates = [
    0,
    player.currentTime.value,
    ...cues.value
      .filter((item) => !editor.selectedSet.value.has(item.uid))
      .flatMap((item) => [item.time, item.endTime]),
  ];
  dragged = false;
  editor.begin();
  function move(pointer: PointerEvent) {
    if (editor.disabled.value) {
      finish(true);
      return;
    }
    if (!dragged && Math.abs(pointer.clientX - origin) < 3) return;
    dragged = true;
    const delta =
      (pointer.clientX - origin + (scroller.value?.scrollLeft || 0) - originScroll) /
      pixelsPerSecond;
    let start = mode === 'end' ? original.time : original.time + delta;
    let end = mode === 'start' ? original.endTime : original.endTime + delta;
    guide.value = null;
    if (editor.snapping.value) {
      const edges = mode === 'move' ? [start, end] : [mode === 'start' ? start : end];
      let distance = Math.min(0.35, 8 / pixelsPerSecond);
      let adjustment = 0;
      for (const edge of edges)
        for (const candidate of candidates) {
          if (Math.abs(candidate - edge) < distance) {
            distance = Math.abs(candidate - edge);
            adjustment = candidate - edge;
            guide.value = candidate;
          }
        }
      if (mode !== 'end') start += adjustment;
      if (mode !== 'start') end += adjustment;
    }
    if (mode === 'move' && start < 0) {
      end -= start;
      start = 0;
    }
    start = Math.max(0, Math.min(start, end - 0.05));
    end = Math.max(start + 0.05, end);
    if (mode === 'move') {
      editor.moveMany(originals, start - original.time);
      return;
    }
    editor.update(cue.uid, {
      time: Math.round(start * 1000) / 1000,
      endTime: Math.round(end * 1000) / 1000,
    });
  }
  function finish(cancelled = false) {
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', up);
    window.removeEventListener('pointercancel', cancel);
    window.removeEventListener('blur', cancel);
    if (cancelled) editor.cancel();
    else editor.commit();
    guide.value = null;
    stopDrag = null;
  }
  function up() {
    finish();
  }
  function cancel() {
    finish(true);
  }
  stopDrag = cancel;
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', cancel);
  window.addEventListener('blur', cancel);
}
function keyboard(event: KeyboardEvent) {
  if (event.key === 'Escape' && stopDrag) {
    stopDrag();
    return;
  }
  if (
    marquee.value ||
    lyrics.isSyncing.value ||
    recording.isRecording.value ||
    (event.target instanceof Element &&
      event.target.closest('input, textarea, select, [contenteditable="true"]'))
  )
    return;
  const key = event.key.toLowerCase();
  const targetEditor = sequence.selected.value ? sequence : editor;
  if ((event.metaKey || event.ctrlKey) && key === 'z') {
    event.preventDefault();
    if (event.shiftKey) targetEditor.redo();
    else targetEditor.undo();
  } else if ((event.metaKey || event.ctrlKey) && key === 'd') {
    event.preventDefault();
    targetEditor.duplicate();
  } else if (key === 'delete' || key === 'backspace') {
    event.preventDefault();
    targetEditor.remove();
  } else if (key === 's' && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    targetEditor.split(player.currentTime.value);
  } else if (key === ' ' && !(event.target instanceof Element && event.target.closest('button'))) {
    event.preventDefault();
    void player.toggle();
  } else if (key === 'escape') stopDrag?.();
}
async function wheel(event: WheelEvent) {
  if (!event.metaKey && !event.ctrlKey) return;
  event.preventDefault();
  const container = scroller.value;
  if (!container) return;
  const anchor = event.clientX - container.getBoundingClientRect().left;
  const fraction = (container.scrollLeft + anchor) / width.value;
  zoom.value = Math.max(1, Math.min(32, zoom.value * Math.exp(-event.deltaY * 0.005)));
  await nextTick();
  container.scrollLeft = fraction * width.value - anchor;
}
</script>

<template>
  <section
    class="subtitle-timeline"
    aria-label="影片時間軸"
  >
    <header class="timeline-heading">
      <h2>時間軸</h2>
      <span>字幕軌道 · {{ cues.length }} 段 · 已選 {{ editor.selectedIds.value.length }} 段</span>
      <output
        >{{ formatPlaybackTime(player.currentTime.value) }} /
        {{ formatPlaybackTime(duration) }}</output
      >
    </header>
    <div class="subtitle-tools">
      <button
        :disabled="editor.disabled.value || !editor.canUndo.value"
        @click="editor.undo"
      >
        復原
      </button>
      <button
        :disabled="editor.disabled.value || !editor.canRedo.value"
        @click="editor.redo"
      >
        重做
      </button>
      <button
        :disabled="editor.disabled.value || !canSplit"
        @click="editor.split(player.currentTime.value)"
      >
        分割字幕
      </button>
      <button
        :disabled="editor.disabled.value || !editor.selected.value"
        @click="editor.duplicate"
      >
        複製字幕
      </button>
      <button
        :disabled="editor.disabled.value || !editor.selected.value"
        @click="editor.remove"
      >
        刪除字幕
      </button>
      <button
        :aria-pressed="editor.snapping.value"
        @click="editor.snapping.value = !editor.snapping.value"
      >
        吸附
      </button>
      <button
        :aria-pressed="editor.locked.value"
        :disabled="lyrics.isSyncing.value || recording.isRecording.value"
        @click="editor.locked.value = !editor.locked.value"
      >
        {{ editor.locked.value ? '解鎖字幕軌道' : '鎖定字幕軌道' }}
      </button>
      <label class="subtitle-zoom"
        >縮放
        <input
          v-model.number="zoom"
          aria-label="時間軸縮放"
          type="range"
          min="1"
          max="32"
          step="0.25"
      /></label>
      <button @click="zoom = 1">適合</button>
    </div>
    <div class="media-sequence-tools">
      <button
        :disabled="sequence.disabled.value || !sequence.canUndo.value"
        @click="sequence.undo"
      >
        復原影音
      </button>
      <button
        :disabled="sequence.disabled.value || !sequence.canRedo.value"
        @click="sequence.redo"
      >
        重做影音
      </button>
      <button
        :disabled="sequence.disabled.value || !sequence.selected.value"
        @click="sequence.split(player.currentTime.value)"
      >
        分割影音
      </button>
      <button
        :disabled="sequence.disabled.value || !sequence.selected.value"
        @click="sequence.duplicate"
      >
        複製影音
      </button>
      <button
        :disabled="sequence.disabled.value || !sequence.selected.value"
        @click="sequence.remove"
      >
        刪除影音片段
      </button>
      <label
        ><input
          v-model="sequence.linkSubtitles.value"
          type="checkbox"
          :disabled="sequence.disabled.value"
        />連動字幕</label
      >
      <span>作品 {{ formatPlaybackTime(sequence.duration.value) }}</span>
    </div>
    <div
      ref="scroller"
      class="subtitle-scroll"
      @wheel="wheel"
    >
      <div
        class="subtitle-track-content"
        :style="{ width: `${width}px` }"
      >
        <div
          class="timeline-ruler"
          @pointerdown="seek"
        >
          <span
            v-for="tick in ticks"
            :key="tick"
            :style="{ left: `${tick * scale}px` }"
            >{{ tickLabel(tick) }}</span
          >
        </div>
        <input
          type="range"
          min="0"
          :max="duration"
          step="0.01"
          :value="player.currentTime.value"
          :disabled="disabled"
          aria-label="時間軸播放位置"
          @input="player.seek(Number(($event.target as HTMLInputElement).value))"
        />
        <div
          class="subtitle-track"
          role="group"
          aria-label="字幕軌道"
          title="從空白處拖曳框選字幕；點空白處取消選取"
          @pointerdown.self="boxSelect"
        >
          <span
            v-if="!cues.length"
            class="track-empty"
            >匯入 LRC／SRT，或在右側輸入歌詞並開始對時。</span
          >
          <button
            v-for="cue in cues"
            :key="cue.uid"
            type="button"
            class="subtitle-clip"
            :class="{
              selected: editor.selectedSet.value.has(cue.uid),
              active:
                player.currentTime.value >= cue.time && player.currentTime.value < cue.endTime,
            }"
            :style="{
              left: `${cue.time * scale}px`,
              width: `${Math.max(3, (cue.endTime - cue.time) * scale)}px`,
            }"
            :title="cue.text"
            :aria-pressed="editor.selectedSet.value.has(cue.uid)"
            :aria-label="`跳至字幕：${cue.text || '空白'} ${formatPlaybackTime(cue.time)}`"
            @pointerdown="drag($event, cue, 'move')"
            @click="select(cue)"
          >
            <i
              class="subtitle-trim start"
              title="拖曳調整開始時間"
              @pointerdown.stop="drag($event, cue, 'start')"
            />
            <span>{{ cue.text || '空白' }}</span>
            <i
              class="subtitle-trim end"
              title="拖曳調整結束時間"
              @pointerdown.stop="drag($event, cue, 'end')"
            />
          </button>
          <div
            v-if="marquee"
            class="subtitle-marquee"
            :style="{
              left: `${marquee.left}px`,
              top: `${marquee.top}px`,
              width: `${marquee.width}px`,
              height: `${marquee.height}px`,
            }"
            aria-hidden="true"
          />
          <i
            class="subtitle-playhead"
            :style="{ '--playhead-x': `${player.currentTime.value * scale}px` }"
          />
          <i
            v-if="guide !== null"
            class="subtitle-snap-guide"
            :style="{ left: `${guide * scale}px` }"
          />
        </div>
        <MediaTracks :scale="scale" />
      </div>
    </div>
  </section>
</template>
