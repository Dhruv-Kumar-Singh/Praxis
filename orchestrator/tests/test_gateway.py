import pytest
from app.gateway.model_gateway import ModelGateway, CircuitBreakerOpenError, BudgetExceededError

def test_circuit_breaker_trips():
    gw = ModelGateway()
    gw.failure_threshold = 2
    gw.recovery_timeout = 100.0

    gw._record_failure()
    assert gw.circuit_open is False

    gw._record_failure()
    assert gw.circuit_open is True

    with pytest.raises(CircuitBreakerOpenError):
        gw._check_circuit()

def test_session_token_budget_exceeded():
    gw = ModelGateway()
    session_id = "test_budget_sess"

    # Under budget
    gw.track_session_usage(session_id, tokens=1000)
    assert gw.session_usage[session_id]["tokens"] == 1000

    # Over budget
    with pytest.raises(BudgetExceededError):
        gw.track_session_usage(session_id, tokens=50000)
