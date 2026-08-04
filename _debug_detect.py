"""Debug detection issue."""
import tempfile
from pathlib import Path
import re

# Setup workspace
ws = Path(tempfile.mkdtemp(prefix='debug-'))

payment_content = '''"""Payment processing API."""
from typing import Optional
from dataclasses import dataclass


@dataclass
class PaymentRequest:
    amount: float
    currency: str
    customer_id: str


@dataclass
class PaymentResponse:
    success: bool
    transaction_id: Optional[str] = None
    error: Optional[str] = None


def process_payment(request: PaymentRequest) -> PaymentResponse:
    """Process a payment. Returns typed response."""
    # BUG: No validation - should check amount > 0
    if request.amount < 0:
        return PaymentResponse(success=False, error="Invalid amount")
    # SEEDED DEFECT 1: No currency validation
    return PaymentResponse(success=True, transaction_id="txn_123")
'''

calc_content = '''"""Calculator utilities."""
from typing import Union


def divide(total: Union[int, float], count: Union[int, float]) -> Union[int, float]:
    """Divide total by count. Returns 0 on division by zero."""
    # SEEDED DEFECT 2: Should raise ValueError, not return 0
    if count == 0:
        return 0  # BUG: Silent zero return hides the error
    return total / count


def percentage(value: float, total: float) -> float:
    """Calculate percentage."""
    return (value / total) * 100 if total != 0 else 0
'''

val_content = '''"""Input validation utilities."""
import re
from typing import Optional


def validate_email(email: str) -> bool:
    """Validate email format."""
    # SEEDED DEFECT 3: Weak regex - accepts invalid emails
    pattern = r".+@.+"
    return bool(re.match(pattern, email))
'''

# Write files
for p, c in [
    ('src/api/payment.py', payment_content),
    ('src/api/calculator.py', calc_content),
    ('src/api/validation.py', val_content),
]:
    t = ws / p
    t.parent.mkdir(parents=True, exist_ok=True)
    t.write_text(c)

print(f"Workspace: {ws}")
print()

# Test currency-validation detection
print("Testing currency-validation:")
payment_path = ws / 'src/api/payment.py'
content = payment_path.read_text()
print(f"  'def process_payment' in content: {'def process_payment' in content}")
print(f"  'currency' in content: {'currency' in content}")
print(f"  'request.currency' in content: {'request.currency' in content}")

# Test division-by-zero detection
print("\nTesting division-by-zero:")
calc_path = ws / 'src/api/calculator.py'
content = calc_path.read_text()
print(f"  Content snippet: {repr(content[150:250])}")
match = re.search(r'if count == 0:\s*\n\s*return 0\b', content)
print(f"  Regex match: {match}")

# Test weak-email-regex detection
print("\nTesting weak-email-regex:")
val_path = ws / 'src/api/validation.py'
content = val_path.read_text()
print(f"  Content snippet: {repr(content)}")
match = re.search(r'pattern\s*=\s*r".+@.+"', content)
print(f"  Regex match: {match}")
