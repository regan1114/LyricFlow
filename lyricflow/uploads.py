"""Translate Flask form uploads into validated application input."""

from werkzeug.exceptions import BadRequest, RequestEntityTooLarge, UnsupportedMediaType

from .config import MAX_LYRICS_BYTES
from .errors import ValidationError
from .validation import parse_job_input


def text_field(request, name, limit):
    if name in request.files:
        raw = request.files[name].stream.read(limit + 1)
        if len(raw) > limit:
            raise ValidationError(f"{name} 欄位過長。")
        try:
            return raw.decode("utf-8-sig")
        except UnicodeDecodeError as error:
            raise ValidationError(f"{name} 必須是 UTF-8 文字檔。") from error
    value = request.form.get(name, "")
    if len(value.encode("utf-8")) > limit:
        raise ValidationError(f"{name} 欄位過長。")
    return value


def multipart_input(request):
    if request.mimetype != "multipart/form-data" or not request.mimetype_params.get("boundary"):
        raise UnsupportedMediaType("請使用 multipart/form-data，包含 audio 和 lyrics 欄位。")
    if not request.content_length:
        raise RequestEntityTooLarge("請提供 Content-Length；歌曲上限為 200 MB。")
    fields = list(request.form.keys()) + list(request.files.keys())
    if set(fields) - {"audio", "lyrics", "threads"}:
        raise ValidationError("僅接受 audio、lyrics、threads，每個欄位只能提供一次。")
    for name in set(fields):
        if len(request.form.getlist(name)) + len(request.files.getlist(name)) != 1:
            raise ValidationError("每個欄位只能提供一次。")
    if not {"audio", "lyrics"} <= set(fields):
        raise BadRequest("請同時提供 audio 音檔與 lyrics 歌詞，並確認 multipart 格式完整。")
    audio = request.files.get("audio")
    if audio is None or not audio.filename:
        raise ValidationError("audio 必須是歌曲檔案。")
    audio.stream.seek(0, 2)
    size = audio.stream.tell()
    audio.stream.seek(0)
    data = parse_job_input(
        {
            "name": audio.filename,
            "size": size,
            "lyrics": text_field(request, "lyrics", MAX_LYRICS_BYTES),
            "threads": text_field(request, "threads", 8) if "threads" in fields else 4,
        }
    )
    return data, audio.stream


def wait_requested(request):
    values = request.args.getlist("wait") or ["false"]
    if set(request.args) - {"wait"} or values not in (["true"], ["false"]):
        raise ValidationError("wait 參數必須為 true 或 false。")
    return values == ["true"]
