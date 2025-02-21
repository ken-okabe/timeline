from timeline import Timeline
from typing import Optional, Dict, Any

def log(a: Any) -> None:
    print(a)

print("--------------------------------------------")
# Example 1: String Timeline
# Initialize Timeline with Null
timeline_ref = Timeline[Optional[str]](None)
# Map the Timeline
timeline_ref.map(log)

timeline_ref.next("Hello")
timeline_ref.next("World!")
timeline_ref.next("Python")
timeline_ref.next(None)

print("--------------------------------------------")
# Example 2: Integer Object Timeline
# Initialize Timeline with Null
timeline_number = Timeline[Optional[int]](None)
# Map the Timeline
timeline_number.map(lambda value: log(value))

timeline_number.next(1)
timeline_number.next(2)
timeline_number.next(3)
timeline_number.next(None)

print("--------------------------------------------")
# Example 3: Command Object Timeline
def is_null(value: Any) -> bool:
    return value is None

class CommandObj:
    def __init__(self, cmd: str, msg: str):
        self.cmd = cmd
        self.msg = msg
    
    def __repr__(self) -> str:
        return f"CommandObj(cmd='{self.cmd}', msg='{self.msg}')"

# Initialize Timeline with Null
timeline_obj = Timeline[Optional[CommandObj]](None)
# Map the Timeline
# If the value is Null, do nothing
# Otherwise, log the value
# This behavior is similar to Promise .then() method
timeline_obj.map(lambda value: log(value) if not is_null(value) else None)

timeline_obj.next(CommandObj("text", "Hello"))
timeline_obj.next(CommandObj("text", "Bye"))
timeline_obj.next(None)  # do nothing