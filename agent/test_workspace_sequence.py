import os
import sys
import unittest

# Keep this dependency-free contract runnable from the repository root.
sys.path.insert(0, os.path.dirname(__file__))
from workspace_sequence import reserve_sequence


class WorkspaceSequenceTests(unittest.TestCase):
    def test_failed_callback_after_response_loss_uses_a_new_sequence(self):
        committed_sequence, next_sequence = reserve_sequence(1)
        failed_sequence, _ = reserve_sequence(next_sequence)
        self.assertEqual(committed_sequence, 1)
        self.assertEqual(failed_sequence, 2)


if __name__ == '__main__':
    unittest.main()
