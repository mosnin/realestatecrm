import os
import sys
import unittest
from pathlib import Path

# Keep this dependency-free contract runnable from the repository root.
sys.path.insert(0, os.path.dirname(__file__))
from workspace_sequence import (
    is_safe_workspace_filename,
    reserve_sequence,
    validate_workspace_files,
    validate_workspace_run_request,
    validate_workspace_task_request,
)


class WorkspaceSequenceTests(unittest.TestCase):
    def test_failed_callback_after_response_loss_uses_a_new_sequence(self):
        committed_sequence, next_sequence = reserve_sequence(1)
        failed_sequence, _ = reserve_sequence(next_sequence)
        self.assertEqual(committed_sequence, 1)
        self.assertEqual(failed_sequence, 2)

    def test_workspace_file_vocabulary_accepts_real_files_and_rejects_paths(self):
        for name in (
            "brief.md",
            "launch-checklist.md",
            "comps.csv",
            "handoff.md",
            "workspace-follow-up-1.md",
            "workspace-follow-up-42.md",
            "workspace-report-1.md",
            "workspace-report-42.md",
            "workspace-comps-1.csv",
            "workspace-comps-42.csv",
            "workspace-actions-1.json",
            "workspace-actions-42.json",
        ):
            self.assertTrue(is_safe_workspace_filename(name), name)
        for name in (
            "../brief.md",
            "/workspace/brief.md",
            "workspace-follow-up-0.md",
            "workspace-follow-up-01.md",
            "workspace-report-0.md",
            "workspace-report-01.md",
            "workspace-report-1.csv",
            "workspace-comps-1.md",
            "workspace-actions-1.txt",
            "notes.txt",
            None,
        ):
            self.assertFalse(is_safe_workspace_filename(name), name)

    def test_outer_workspace_validator_accepts_repeated_typed_continuations(self):
        files = [
            {"name": "brief.md", "content": "Seller prefers Thursday."},
            {"name": "comps.csv", "content": "address\nPrior home\n"},
            {"name": "workspace-report-1.md", "content": "# Prior report\n"},
            {"name": "workspace-comps-1.csv", "content": "address\nPrior home\n"},
            {"name": "workspace-actions-1.json", "content": '{"actions": []}\n'},
            {"name": "workspace-report-2.md", "content": "# Latest report\n"},
            {"name": "workspace-actions-2.json", "content": '{"actions": []}\n'},
        ]

        self.assertTrue(validate_workspace_files(files))

    def test_outer_workspace_validator_preserves_manifest_bounds(self):
        valid = {"name": "workspace-report-1.md", "content": "# Report\n"}
        invalid_manifests = (
            [],
            [valid, dict(valid)],
            [{"name": "../workspace-report-1.md", "content": "# Report\n"}],
            [{"name": "workspace-report-1.csv", "content": "# Report\n"}],
            [{"name": "workspace-report-1.md", "content": b"not text"}],
            [{"name": "workspace-report-1.md", "content": "x" * 32_001}],
            [
                {"name": f"workspace-report-{sequence}.md", "content": "ok"}
                for sequence in range(1, 18)
            ],
            "not a manifest",
            None,
        )
        for files in invalid_manifests:
            with self.subTest(files=type(files).__name__):
                self.assertFalse(validate_workspace_files(files))

    def test_launch_payload_validators_reject_pre_callback_failures(self):
        run = {
            "run_id": "00000000-0000-4000-8000-000000000001",
            "space_id": "space-1",
            "launch_token": "launch-1",
            "goal": "Prepare the listing packet",
            "packet": {},
        }
        task = {
            "task_id": "00000000-0000-4000-8000-000000000002",
            "run_id": run["run_id"],
            "space_id": run["space_id"],
            "launch_token": "launch-2",
            "instruction": "Prepare review",
            "files": [{"name": "workspace-report-1.md", "content": "# Prior\n"}],
            "task_sequence": 2,
            "execution_plan": {},
        }

        self.assertTrue(validate_workspace_run_request(run))
        self.assertTrue(validate_workspace_task_request(task))
        for key in ("run_id", "space_id", "launch_token", "goal", "packet"):
            with self.subTest(request="run", missing=key):
                self.assertFalse(validate_workspace_run_request({**run, key: None}))
        for key in (
            "task_id",
            "run_id",
            "space_id",
            "launch_token",
            "instruction",
            "files",
            "task_sequence",
            "execution_plan",
        ):
            with self.subTest(request="task", missing=key):
                self.assertFalse(validate_workspace_task_request({**task, key: None}))

    def test_launch_endpoints_validate_before_claiming(self):
        source = (Path(__file__).parent / "workspace_modal_app.py").read_text()
        base_start = source.index("async def launch_workspace(item: dict):")
        task_start = source.index("async def launch_workspace_task(item: dict):")
        base_endpoint = source[base_start:task_start]
        task_endpoint = source[task_start:]

        self.assertLess(
            base_endpoint.index("validate_workspace_run_request(item, MAX_GOAL)"),
            base_endpoint.index("_claim_launch(item)"),
        )
        self.assertLess(
            task_endpoint.index("validate_workspace_task_request(item, MAX_GOAL)"),
            task_endpoint.index("_claim_task_launch(item)"),
        )

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
        self.assertNotIn(
            "from fastapi.responses import JSONResponse\nfrom workspace_sequence", source
        )
        # Base-run and continuation callback/claim requests all share the
        # staging-protection header helper.
        self.assertEqual(source.count("headers=_callback_headers(signature)"), 4)

    def test_follow_up_callbacks_carry_the_accepted_launch_token(self):
        source = (Path(__file__).parent / "workspace_modal_app.py").read_text()
        self.assertIn(
            "task_id, run_id, space_id, launch_token = "
            'str(item.get("task_id", "")), str(item.get("run_id", "")), '
            'str(item.get("space_id", "")), str(item.get("launch_token", ""))',
            source,
        )
        self.assertIn(
            '"task_id": task_id, "run_id": run_id, "space_id": space_id, '
            '"launch_token": launch_token, "sequence": current_sequence',
            source,
        )


if __name__ == '__main__':
    unittest.main()
