"""CTC path tests; run in the optional alignment environment."""

import unittest

from lyricflow.timeline.contract import TimelineError


class CTCTests(unittest.TestCase):
    """Executed with .venv-alignment; no model download needed for these tests."""

    @classmethod
    def setUpClass(cls):
        try:
            import numpy
        except ImportError:
            raise unittest.SkipTest("CTC tests require the optional alignment environment")
        cls.np = numpy

    def test_blank_intro_gap_and_repeated_token(self):
        from lyricflow.timeline.ctc import forced_path

        np = self.np
        labels = [0] * 15 + [1, 1, 0, 2, 2] + [0] * 30 + [1, 1, 0, 1, 1] + [0] * 5
        p = np.full((len(labels), 3), 0.001)
        p[np.arange(len(labels)), labels] = 0.998
        spans = forced_path(np.log(p), [1, 2, 1, 1])
        self.assertEqual([(a, b) for a, b, _ in spans], [(15, 17), (18, 20), (50, 52), (53, 55)])
        with self.assertRaises(TimelineError):
            forced_path(np.log(p[:1]), [1, 1])

    def test_impossible_path_is_rejected(self):
        from lyricflow.timeline.ctc import forced_path

        np = self.np
        p = np.full((8, 3), -np.inf)
        p[:, 0] = 0
        with self.assertRaises(TimelineError):
            forced_path(p, [1, 2])

    def test_separated_vocal_gaps_keep_exact_source_offsets(self):
        from lyricflow.timeline.activity import compact_vocals, source_time

        np = self.np
        # Two sustained phrases separated by a thirty-second instrumental region.
        samples = np.zeros(50 * 16000, dtype=np.float32)
        samples[15 * 16000 : 18 * 16000] = 0.1
        samples[48 * 16000 : 49 * 16000] = 0.05
        compact, mapping = compact_vocals(samples)
        self.assertEqual(len(compact), 6 * 16000)
        self.assertEqual(source_time(0.5, mapping), 15)
        self.assertEqual(source_time(4.5, mapping), 48)
        self.assertEqual(source_time(4, mapping, end=True), 18.5)
        self.assertEqual(source_time(4, mapping), 47.5)
        with self.assertRaises(TimelineError):
            compact_vocals(np.zeros(16000, dtype=np.float32))
