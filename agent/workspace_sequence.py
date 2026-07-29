"""Small dependency-free replay primitive for Workspace callback sequencing."""

def reserve_sequence(next_sequence: int) -> tuple[int, int]:
    """Reserve before transport so response loss cannot reuse an event ID."""
    return next_sequence, next_sequence + 1
