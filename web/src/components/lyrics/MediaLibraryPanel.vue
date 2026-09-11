<script setup lang="ts">
import { useStudio } from '../../composables/useStudio';
import FileUpload from '../ui/FileUpload.vue';
import { formatPlaybackTime } from '../../engine/time';
import type { MediaClip, MediaTrack } from '../../domain/mediaSequence';
const { sequence, player, importFiles, recording, reportError, subtitleFilename } = useStudio();
const { assets, selected, assetMap, disabled, visualLocked } = sequence;
function edit(field: keyof MediaClip, event: Event) {
  if (!selected.value) return;
  const input = event.target as HTMLInputElement;
  const value = field === 'track' ? (input.value as MediaTrack) : input.valueAsNumber;
  if (!sequence.update(selected.value.id, { [field]: value })) {
    input.value = String(selected.value[field]);
    reportError('片段時間無效：開始須為 0 以上，長度至少 0.05 秒，裁切範圍不能超過原始檔案。');
  }
}
</script>
<template>
  <div class="media-library-panel">
    <div class="library-imports">
      <FileUpload
        label="加入圖片／影片素材"
        accept="image/*,video/*"
        multiple
        :disabled="disabled"
        @select="importFiles('background', $event)"
      />
      <FileUpload
        label="加入音訊素材"
        accept="audio/*"
        multiple
        :disabled="disabled"
        @select="importFiles('audio', $event)"
      />
      <FileUpload
        label="替換字幕檔"
        accept=".srt,.lrc,.txt"
        :disabled="recording.isRecording.value"
        @select="importFiles('subtitles', $event)"
      />
    </div>
    <p class="caption-notice">
      {{
        sequence.busy.value
          ? '正在讀取素材…'
          : visualLocked
            ? '自動模式：圖片會自動參與編排，影片僅保留在素材區。音訊仍可加入時間軸。'
            : '加入時間軸後才會播放；可重複使用同一素材。'
      }}
    </p>
    <p
      v-if="subtitleFilename"
      class="library-subtitle"
    >
      字幕：{{ subtitleFilename }}（單份）
    </p>
    <button
      :disabled="disabled || !assets.some((asset) => !visualLocked || asset.kind === 'audio')"
      @click="sequence.addAll"
    >
      {{ visualLocked ? '全部音訊加入時間軸' : '全部依序加入時間軸' }}
    </button>
    <div class="library-assets">
      <article
        v-for="asset in assets"
        :key="asset.id"
        class="library-asset"
      >
        <img
          v-if="asset.kind === 'image'"
          :src="asset.url"
          alt=""
        />
        <video
          v-else-if="asset.kind === 'video'"
          :src="asset.url"
          preload="metadata"
          muted
          playsinline
        />
        <span
          v-else
          class="audio-asset-icon"
          >♫</span
        >
        <div class="asset-info">
          <strong :title="asset.name">{{ asset.name }}</strong
          ><small>{{
            asset.kind === 'image'
              ? visualLocked
                ? '圖片 · 自動編排中'
                : '圖片 · 預設 5 秒'
              : `${asset.kind === 'video' ? '影片' : '音訊'} · ${formatPlaybackTime(asset.duration)}`
          }}</small>
        </div>
        <div class="asset-actions">
          <button
            :aria-label="`加入時間軸：${asset.name}`"
            :disabled="disabled || (visualLocked && asset.kind !== 'audio')"
            @click="sequence.add(asset.id)"
          >
            {{ visualLocked && asset.kind !== 'audio' ? '已鎖定' : '加入' }}
          </button>
          <button
            v-if="asset.kind === 'audio'"
            :disabled="disabled"
            :aria-label="`加入第二音軌：${asset.name}`"
            @click="sequence.add(asset.id, 'A2', player.currentTime.value)"
          >
            配音軌
          </button>
          <button
            :disabled="disabled || sequence.clips.value.some((clip) => clip.assetId === asset.id)"
            :aria-label="`移除素材：${asset.name}`"
            @click="sequence.removeAsset(asset.id)"
          >
            移除
          </button>
        </div>
      </article>
      <p
        v-if="!assets.length"
        class="caption-notice"
      >
        一次選取多張圖片、多部影片或多個 MP3／WAV 檔案。
      </p>
    </div>
    <fieldset
      v-if="selected"
      class="media-clip-properties"
      :disabled="disabled"
    >
      <legend>片段：{{ assetMap.get(selected.assetId)?.name }}</legend>
      <label
        >開始（秒）<input
          aria-label="影音片段開始"
          type="number"
          min="0"
          step="0.01"
          :value="selected.start"
          @change="edit('start', $event)"
      /></label>
      <label
        >長度（秒）<input
          aria-label="影音片段長度"
          type="number"
          min="0.05"
          step="0.01"
          :value="selected.duration"
          @change="edit('duration', $event)"
      /></label>
      <label v-if="assetMap.get(selected.assetId)?.kind !== 'image'"
        >來源起點（秒）<input
          aria-label="影音片段來源起點"
          type="number"
          min="0"
          step="0.01"
          :value="selected.trimStart"
          @change="edit('trimStart', $event)"
      /></label>
      <label v-if="selected.track !== 'V1'"
        >音軌<select
          aria-label="影音片段音軌"
          :value="selected.track"
          @change="edit('track', $event)"
        >
          <option>A1</option>
          <option>A2</option>
        </select></label
      >
      <label v-if="assetMap.get(selected.assetId)?.kind === 'video'"
        ><input
          type="checkbox"
          aria-label="啟用影片原音"
          :checked="!selected.muted"
          @change="
            sequence.enableVideoAudio(selected.id, ($event.target as HTMLInputElement).checked)
          "
        />啟用影片原音</label
      >
      <template v-if="assetMap.get(selected.assetId)?.kind === 'audio'">
        <label
          ><input
            type="checkbox"
            aria-label="音訊片段靜音"
            :checked="selected.muted"
            @change="
              sequence.update(selected.id, { muted: ($event.target as HTMLInputElement).checked })
            "
          />靜音</label
        >
      </template>
      <label v-if="assetMap.get(selected.assetId)?.kind !== 'image'"
        >音量<input
          aria-label="影音片段音量"
          type="range"
          min="0"
          max="2"
          step="0.01"
          :value="selected.volume"
          @change="edit('volume', $event)"
      /></label>
    </fieldset>
  </div>
</template>
