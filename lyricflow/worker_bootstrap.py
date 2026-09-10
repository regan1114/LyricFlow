"""Wait until the server has assigned this process to its Windows Job Object."""

import subprocess
import sys


def main():
    if sys.stdin.buffer.read(1) != b"\n":
        return 1
    # No shell: filenames, Unicode and spaces stay separate arguments.
    with subprocess.Popen(sys.argv[1:], stdin=subprocess.DEVNULL) as process:
        return process.wait()


if __name__ == "__main__":
    raise SystemExit(main())
