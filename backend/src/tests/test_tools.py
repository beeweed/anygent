"""Schema-level tests for the tool registry. Run with `pytest`."""

from ..agent.tools import FILE_READ_TOOL, FILE_WRITE_TOOL, get_tools, tool_names


def test_tool_names():
    assert set(tool_names()) == {"file_write", "file_read"}


def test_file_write_schema():
    schema = FILE_WRITE_TOOL["function"]
    assert schema["name"] == "file_write"
    props = schema["parameters"]["properties"]
    assert set(props.keys()) == {"file_path", "content"}
    assert schema["parameters"]["required"] == ["file_path", "content"]


def test_file_read_schema():
    schema = FILE_READ_TOOL["function"]
    assert schema["name"] == "file_read"
    props = schema["parameters"]["properties"]
    assert set(props.keys()) == {"file_path"}
    assert schema["parameters"]["required"] == ["file_path"]


def test_all_tools_are_openai_format():
    for t in get_tools():
        assert t["type"] == "function"
        assert "function" in t
        assert "name" in t["function"]
        assert "parameters" in t["function"]
