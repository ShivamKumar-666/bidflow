from itsdangerous import URLSafeTimedSerializer, SignatureExpired, BadSignature
from config import Config

def generate_verification_token(email: str) -> str:
    """
    Sign the email address with a time-limited token.
    Token expires after 24 hours (86400 seconds).
    """
    s = URLSafeTimedSerializer(Config.EMAIL_TOKEN_SECRET)
    return s.dumps(email, salt='email-verification')


def confirm_verification_token(token: str, max_age: int = 86400):
    """
    Decode and validate the token.
    Returns the email address on success.
    Raises SignatureExpired or BadSignature on failure.
    """
    s = URLSafeTimedSerializer(Config.EMAIL_TOKEN_SECRET)
    # max_age enforced here — itsdangerous checks the embedded timestamp
    return s.loads(token, salt='email-verification', max_age=max_age)


def generate_reset_token(email: str) -> str:
    """
    Generate a time-limited password-reset token.
    Token expires after 1 hour (3600 seconds).
    """
    s = URLSafeTimedSerializer(Config.EMAIL_TOKEN_SECRET)
    return s.dumps(email, salt='password-reset')


def confirm_reset_token(token: str, max_age: int = 3600):
    """
    Validate a password-reset token.
    Returns the email address on success.
    Raises SignatureExpired or BadSignature on failure.
    """
    s = URLSafeTimedSerializer(Config.EMAIL_TOKEN_SECRET)
    return s.loads(token, salt='password-reset', max_age=max_age)
