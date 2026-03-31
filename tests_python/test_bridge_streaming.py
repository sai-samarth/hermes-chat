import unittest

from bridge.hermes_bridge import format_sse_event, parse_worker_event_line


class BridgeStreamingTests(unittest.TestCase):
    def test_format_sse_event_serializes_named_json_event(self):
        self.assertEqual(
            format_sse_event("delta", {"text": "hi"}),
            'event: delta\ndata: {"text":"hi"}\n\n'
        )

    def test_parse_worker_event_line_decodes_json_line(self):
        self.assertEqual(
            parse_worker_event_line('{"type":"delta","delta":"hi"}\n'),
            {"type": "delta", "delta": "hi"}
        )

    def test_parse_worker_event_line_rejects_non_object_payloads(self):
        with self.assertRaises(ValueError):
            parse_worker_event_line('[1,2,3]\n')


if __name__ == "__main__":
    unittest.main()
