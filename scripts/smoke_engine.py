"""Optional installed-engine smoke check using synthetic silence, never user media.

This checks plumbing and model loading, not recognition or song timing accuracy.
"""

import subprocess
import tempfile
import wave
from pathlib import Path

from imageio_ffmpeg import get_ffmpeg_exe

from lyricflow.config import Settings
from lyricflow.factory import create_app
from lyricflow.recognition import prepare_wav
from lyricflow.validation import parse_job_input


def main():
    if not Settings().ready:
        raise SystemExit("Run python scripts/setup.py first.")
    with tempfile.TemporaryDirectory(prefix="lyric 中文 smoke ") as directory:
        root = Path(directory)
        source = root / "九月 九.wav"
        with wave.open(str(source), "wb") as audio:
            audio.setparams((2, 2, 44100, 0, "NONE", "not compressed"))
            audio.writeframes(b"\0" * (44100 * 4 * 2))
        prepare_wav(source, root / "converted.wav")
        with wave.open(str(root / "converted.wav"), "rb") as audio:
            assert (audio.getnchannels(), audio.getframerate()) == (1, 16000)
        compressed = root / "九月 九.mp3"
        subprocess.run(
            [get_ffmpeg_exe(), "-nostdin", "-v", "error", "-i", str(source), str(compressed)],
            check=True,
            timeout=30,
        )
        app = create_app(Settings(jobs_directory=root / "jobs"))
        service = app.extensions["alignment_service"]
        try:
            for media in [source, compressed]:
                with media.open("rb") as stream:
                    job = service.submit(
                        parse_job_input(
                            {
                                "name": media.name,
                                "size": media.stat().st_size,
                                "lyrics": "海會回答嗎",
                                "threads": 2,
                            }
                        ),
                        stream,
                    )
                job = service.wait(job["id"])
                assert job["status"] == "done", job["message"]
                path, _ = service.resource(job["id"], "srt")
                path.read_text(encoding="utf-8-sig")
                response = app.test_client().get(job["srt_url"], base_url="http://127.0.0.1:8080")
                try:
                    assert response.status_code == 200
                    assert "attachment" in response.headers["Content-Disposition"]
                    response.get_data().decode("utf-8-sig")
                finally:
                    response.close()
        finally:
            service.close()
    print("Installed engine smoke check passed (synthetic audio; no accuracy claim).")


if __name__ == "__main__":
    main()
