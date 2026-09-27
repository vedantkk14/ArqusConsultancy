import pytest
from django.core.cache import cache


@pytest.fixture(autouse=True)
def _clean_cache():
    """Throttles and the login lockout live in the cache: start every test from zero."""
    cache.clear()
    yield
    cache.clear()


@pytest.fixture(autouse=True)
def _fast_hasher(settings):
    """PBKDF2 makes each login slow; the behaviour under test does not depend on the hasher."""
    settings.PASSWORD_HASHERS = ["django.contrib.auth.hashers.MD5PasswordHasher"]
