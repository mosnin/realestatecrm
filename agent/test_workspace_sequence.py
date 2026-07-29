import os
import sys
import unittest
from pathlib import Path

# Keep this dependency-free contract runnable from the repository root.
sys.path.insert(0, os.path.dirname(__file__))
from workspace_sequence import reserve_sequence


class WorkspaceSequenceTests(unittest.TestCase):
    def test_failed_callback_after_response_loss_uses_a_new_sequence(self):
        committed_sequence, next_sequence = reserve_sequence(1)
        failed_sequence, _ = reserve_sequence(next_sequence)
        self.assertEqual(committed_sequence, 1)
        self.assertEqual(failed_sequence, 2)

    def test_staging_callbacks_can_cross_vercel_protection(self):
        source = (Path(__file__).parent / "workspace_modal_app.py").read_text()
        self.assertIn('"x-vercel-protection-bypass"', source)
        self.assertIn('"CHIPPI_WORKSPACE_MODAL_BYPASS_SECRET_NAME"', source)
        self.assertIn('"CHIPPI_WORKSPACE_MODAL_ENDPOINT_SECRET_NAME"', source)
        self.assertIn(
            "secrets = [workspace_secret, bypass_secret, endpoint_secret]", source
        )
        self.assertIn("else modal.Secret.from_dict({})", source)
        self.assertIn(
            "else:\n"
            "    workspace_secret = modal.Secret.from_dict({})\n"
            "    bypass_secret = modal.Secret.from_dict({})\n"
            "    endpoint_secret = modal.Secret.from_dict({})",
            source,
        )
        self.assertIn('"fastapi[standard]>=0.115.0,<1"', source)
        self.assertIn('remote_path="/root/workspace_sequence.py"', source)
        self.assertNotIn("from fastapi.responses import JSONResponse\nfrom workspace_sequence", source)
        # Base-run and continuation callback/claim requests all share the
        # staging-protection header helper.
        self.assertEqual(source.count("headers=_callback_headers(signature)"), 4)


if __name__ == '__main__':
    unittest.main()
