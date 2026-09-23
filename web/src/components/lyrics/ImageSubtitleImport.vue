<script setup lang="ts">
import { useStudio } from '../../composables/useStudio';
import FileUpload from '../ui/FileUpload.vue';

const { sequence, subtitleEditor, imageSubtitleImport } = useStudio();
const exampleURL = `${import.meta.env.BASE_URL}examples/image-subtitles.json`;
const formatURL = `${import.meta.env.BASE_URL}examples/image-subtitles.md`;
</script>

<template>
  <section
    class="image-subtitle-import"
    aria-label="JSON 圖片字幕編排"
  >
    <h3>JSON 圖片字幕編排</h3>
    <p>先加入歌曲與圖片素材，再匯入 JSON，依檔名及歌詞開始時間連續貼齊圖片。</p>
    <div class="library-imports">
      <FileUpload
        label="匯入圖片字幕 JSON"
        accept=".json,application/json"
        :disabled="sequence.disabled.value || subtitleEditor.locked.value"
        @select="imageSubtitleImport.open($event[0])"
      />
      <a
        :href="exampleURL"
        download="image-subtitles.json"
        >下載 JSON 範例</a
      >
    </div>
    <p>匯入會替換畫面軌與字幕，音訊及素材保留。</p>
    <details>
      <summary>匯入說明</summary>
      <p>
        範例使用「清晨.png」、「海岸.png」、「夜色.png」，請先加入圖片，或將 name
        改為你的完整圖檔名稱（含副檔名及大小寫）。
      </p>
      <p>
        第一張從 0 秒顯示，後續依歌詞切換，最後一張延伸至音軌或字幕結尾。若音軌長度有變，請重新匯入
        JSON。
      </p>
      <a
        :href="formatURL"
        download="image-subtitles.md"
        >下載完整格式說明</a
      >
    </details>
    <p
      v-if="imageSubtitleImport.message.value"
      role="status"
    >
      {{ imageSubtitleImport.message.value }}
    </p>
  </section>
</template>

<style scoped>
.image-subtitle-import {
  border: 1px solid #ffffff30;
  border-radius: 6px;
  padding: 10px;
  display: grid;
  gap: 8px;
}
h3,
p {
  margin: 0;
}
h3 {
  font-size: 13px;
}
p {
  color: #bcbcbc;
  line-height: 1.6;
}
a {
  color: var(--accent);
  padding: 6px 0;
}
summary {
  cursor: pointer;
}
details p {
  margin-top: 6px;
}
</style>
