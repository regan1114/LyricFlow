"""Compose an isolated Flask application and its application services."""

import atexit
import socket

from flask import Flask, jsonify, request
from werkzeug.exceptions import ClientDisconnected, Forbidden, HTTPException, LengthRequired

from .config import MAX_AUDIO_BYTES, Settings
from .errors import (
    JobBusyError,
    JobConflictError,
    JobNotFoundError,
    ServiceClosedError,
    ValidationError,
)
from .job_store import JobStore
from .process_runner import ProcessRunner
from .processor import AlignmentProcessor
from .routes import api, web
from .service import AlignmentService

CSP = (
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
    "media-src 'self' blob:; connect-src 'self'; frame-ancestors 'none'"
)


def create_app(settings=None, service=None):
    settings = settings or Settings()
    app = Flask(__name__, static_folder=None)
    app.config.update(
        MAX_CONTENT_LENGTH=MAX_AUDIO_BYTES + 128 * 1024,
        MAX_FORM_MEMORY_SIZE=128 * 1024,
        MAX_FORM_PARTS=3,
    )
    app.json.ensure_ascii = False
    if service is None:
        store = JobStore(settings.jobs_path)
        runner = ProcessRunner(store)
        service = AlignmentService(store, runner, AlignmentProcessor(settings, store, runner))
    app.extensions.update(alignment_service=service, settings=settings)
    atexit.register(service.close)
    app.register_blueprint(api)
    app.register_blueprint(web)

    @app.before_request
    def require_local_request():
        hosts = {f"127.0.0.1:{settings.port}", f"localhost:{settings.port}"}
        if request.host not in hosts:
            raise Forbidden("僅接受本機連線。")
        origin = request.headers.get("Origin")
        if origin and origin not in {"http://" + host for host in hosts}:
            raise Forbidden("此要求不是來自本機介面。")
        # Browsers can issue cross-site requests without an Origin header (e.g. images).
        # Native clients do not send Fetch Metadata and remain supported.
        if request.headers.get("Sec-Fetch-Site") == "cross-site":
            raise Forbidden("此要求不是來自本機介面。")
        if request.method == "POST" and request.headers.get("Transfer-Encoding"):
            raise LengthRequired("請提供 Content-Length；不支援 chunked 上傳。")

    @app.after_request
    def response_headers(response):
        response.headers.update(
            {
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
                "Cross-Origin-Resource-Policy": "same-origin",
                "Content-Security-Policy": CSP,
            }
        )
        return response

    @app.errorhandler(ValidationError)
    def invalid_input(error):
        return jsonify(error=str(error)), 400

    @app.errorhandler(JobNotFoundError)
    def missing_job(error):
        return jsonify(error=str(error)), 404

    @app.errorhandler(JobConflictError)
    def conflicting_job(error):
        body = {"error": str(error)}
        if isinstance(error, JobBusyError):
            body["job_id"] = error.job_id
        return jsonify(body), 409

    @app.errorhandler(ServiceClosedError)
    def closed_service(error):
        return jsonify(error=str(error)), 503

    @app.errorhandler(HTTPException)
    def http_error(error):
        if isinstance(error, ClientDisconnected) and isinstance(error.__context__, socket.timeout):
            return jsonify(error="上傳逾時，請重新傳送。"), 408
        return jsonify(error=error.description), error.code

    @app.errorhandler(Exception)
    def unexpected_error(error):
        app.logger.exception("Unhandled API error")
        return jsonify(error="本機程式發生錯誤，詳細紀錄保留在啟動視窗。"), 500

    return app
