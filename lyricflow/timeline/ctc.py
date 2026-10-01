"""Monotonic CTC Viterbi path. Never decode/replace the supplied target text."""

from .contract import TimelineError


def forced_path(log_probs, tokens, blank=0):
    import numpy as np

    frames, vocabulary = log_probs.shape
    if not tokens or any(t == blank or t < 0 or t >= vocabulary for t in tokens):
        raise TimelineError("ALIGNMENT_FAILED", "歌詞 token 無效。")
    minimum = len(tokens) + sum(a == b for a, b in zip(tokens, tokens[1:]))
    states = 2 * len(tokens) + 1
    if frames < minimum or frames * states > 120_000_000:
        raise TimelineError(
            "ALIGNMENT_LIMIT", "音訊與歌詞長度超出可對齊範圍。", suggestion="請以歌曲段落分開對齊。"
        )
    labels = np.full(states, blank, dtype=np.int32)
    labels[1::2] = tokens
    skip_allowed = np.zeros(states, dtype=bool)
    skip_allowed[2:] = (labels[2:] != blank) & (labels[2:] != labels[:-2])
    previous = np.full(states, -np.inf, dtype=np.float32)
    previous[0] = 0
    trace = np.zeros((frames, states), dtype=np.uint8)
    for frame in range(frames):
        step = np.r_[-np.inf, previous[:-1]]
        skip = np.r_[-np.inf, -np.inf, previous[:-2]]
        skip[~skip_allowed] = -np.inf
        choices = np.stack((previous, step, skip))
        directions = choices.argmax(axis=0)
        trace[frame] = directions
        previous = choices[directions, np.arange(states)] + log_probs[frame, labels]
    state = states - 1 if previous[-1] >= previous[-2] else states - 2
    if not np.isfinite(previous[state]):
        raise TimelineError("ALIGNMENT_FAILED", "找不到完整的歌詞聲學路徑。")
    assigned = [[] for _ in tokens]
    for frame in range(frames - 1, -1, -1):
        if state % 2:
            assigned[state // 2].append(frame)
        state -= int(trace[frame, state])
    result = []
    for token, indices in zip(tokens, assigned):
        if not indices:
            raise TimelineError("ALIGNMENT_FAILED", "部分歌詞未取得聲學時間。")
        result.append(
            (indices[-1], indices[0] + 1, float(np.exp(log_probs[indices, token]).mean()))
        )
    return result
