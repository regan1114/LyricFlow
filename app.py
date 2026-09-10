#!/usr/bin/env python3
"""Launch the local Flask interface and API with the existing command."""

from lyricflow.factory import create_app
from lyricflow.server import main

__all__ = ["create_app"]

if __name__ == "__main__":
    main()
