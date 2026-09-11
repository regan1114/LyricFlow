"""HTTP adapters: parse requests, call the service and construct responses."""

import re
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file, send_from_directory
from werkzeug.exceptions import NotFound, RequestEntityTooLarge, ServiceUnavailable

from .uploads import multipart_input, wait_requested
from .validation import parse_job_input

api = Blueprint("api", __name__, url_prefix="/api")
web = Blueprint("web", __name__)


def alignment_service():
    return current_app.extensions["alignment_service"]


def download(job_id, kind, direct=False):
    path, job = alignment_service().resource(job_id, kind)
    extension = ".srt" if direct else ".draft.srt"
    filename = Path(job["name"]).stem + (extension if kind == "srt" else ".review.txt")
    response = send_file(
        path,
        as_attachment=kind != "audio",
        download_name=job["name"] if kind == "audio" else filename,
        mimetype="application/x-subrip; charset=utf-8" if kind == "srt" else None,
        conditional=True,
    )
    if kind == "audio":
        response.headers["Accept-Ranges"] = "bytes"
    else:
        response.headers["X-Lyric-Flow-Job-Id"] = job_id
    return response


@api.get("/health")
def health():
    return jsonify(app="lyric-flow", ready=current_app.extensions["settings"].ready)


@api.post("/jobs")
def create_job():
    if not request.content_length or request.content_length > 65536:
        raise RequestEntityTooLarge("歌詞內容過長或空白。")
    job = alignment_service().create(parse_job_input(request.get_json()))
    return jsonify(job), 201


@api.get("/jobs/<job_id>")
def job_status(job_id):
    return jsonify(alignment_service().get(job_id))


@api.post("/jobs/<job_id>/audio")
def upload_audio(job_id):
    job = alignment_service().upload(job_id, request.stream, request.content_length)
    return jsonify(job), 202


@api.post("/jobs/<job_id>/cancel")
def cancel_job(job_id):
    return jsonify(alignment_service().cancel(job_id))


@api.post("/jobs/<job_id>/retry")
def retry_job(job_id):
    if not request.content_length or request.content_length > 1024 * 1024:
        raise RequestEntityTooLarge("請提供 1 MB 以內的補辨識時間資料。")
    return jsonify(alignment_service().retry(job_id, request.get_json())), 202


@api.get("/jobs/<job_id>/audio")
def audio_file(job_id):
    return download(job_id, "audio")


@api.get("/jobs/<job_id>/srt")
def srt_file(job_id):
    return download(job_id, "srt")


@api.get("/jobs/<job_id>/report")
def review_file(job_id):
    return download(job_id, "report")


@api.post("/align")
def align():
    should_wait = wait_requested(request)
    data, stream = multipart_input(request)
    job = alignment_service().submit(data, stream)
    if not should_wait:
        return jsonify(job), 202
    job = alignment_service().wait(job["id"])
    if job["status"] == "done":
        return download(job["id"], "srt", direct=True)
    return jsonify(error=job["message"], job_id=job["id"], status=job["status"]), (
        422 if job["status"] == "error" else 409
    )


@web.get("/")
def index():
    directory = current_app.extensions["settings"].web_path
    if not (directory / "index.html").is_file():
        raise ServiceUnavailable("前端尚未建置，請在專案根目錄執行 npm ci 與 npm run build。")
    return send_from_directory(directory, "index.html", conditional=False)


@web.get("/<path:filename>")
def asset(filename):
    if filename.startswith("api/") or any(part.startswith(".") for part in filename.split("/")):
        raise NotFound()
    response = send_from_directory(current_app.extensions["settings"].web_path, filename)
    if re.fullmatch(r"assets/.+-[A-Za-z0-9_-]{8,}\.(?:js|css)", filename):
        response.headers["Cache-Control"] = "private, max-age=31536000, immutable"
    else:
        response.headers["Cache-Control"] = "private, max-age=0, must-revalidate"
    return response
