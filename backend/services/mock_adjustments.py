# Pending one-shot adjustments from automation events to mock sensor state.
# automation_engine.py writes here; sensors.py _mock_loop reads and applies them.
_pending: dict[str, dict[str, float]] = {}


def apply_adjustment(farm_id: str, field: str, delta: float) -> None:
    farm = _pending.setdefault(farm_id, {})
    farm[field] = farm.get(field, 0.0) + delta


def pop_adjustments(farm_id: str) -> dict[str, float]:
    return _pending.pop(farm_id, {})
