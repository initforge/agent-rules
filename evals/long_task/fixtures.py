"""Engine fixture: 10+ file long-task with seeded defects.

This fixture simulates a multi-file code task where seeded defects
must be detected, repaired, and verified.
"""
from __future__ import annotations

# Long-task fixture: 12-file project with 3 seeded defects
LONG_TASK_FIXTURE = {
    "version": 1,
    "name": "multi-file-api-task",
    "task": "Refactor payment processing to use typed response objects. Add validation. Fix division by zero in calculator.",
    "files": {
        # File 1: Main API
        "src/api/payment.py": '''"""Payment processing API."""
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
''',

        # File 2: Calculator with seeded defect
        "src/api/calculator.py": '''"""Calculator utilities."""
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
''',

        # File 3: User validation
        "src/api/validation.py": '''"""Input validation utilities."""
import re
from typing import Optional


def validate_email(email: str) -> bool:
    """Validate email format."""
    # SEEDED DEFECT 3: Weak regex - accepts invalid emails
    pattern = r".+@.+"
    return bool(re.match(pattern, email))


def validate_customer_id(customer_id: str) -> Optional[str]:
    """Validate customer ID format. Returns error message or None."""
    if not customer_id:
        return "Customer ID required"
    if len(customer_id) < 3:
        return "Customer ID too short"
    return None
''',

        # File 4: Models
        "src/models/customer.py": '''"""Customer model."""
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Customer:
    id: str
    email: str
    name: str
    created_at: datetime = datetime.now()

    def __post_init__(self):
        if not self.id:
            raise ValueError("Customer ID cannot be empty")
        if not self.email:
            raise ValueError("Email cannot be empty")
''',

        # File 5: Repository
        "src/repositories/customer_repo.py": '''"""Customer repository."""
from typing import Optional, List
from src.models.customer import Customer


class CustomerRepository:
    """In-memory customer storage."""

    def __init__(self):
        self._customers: dict[str, Customer] = {}

    def save(self, customer: Customer) -> None:
        """Save customer to storage."""
        self._customers[customer.id] = customer

    def find_by_id(self, customer_id: str) -> Optional[Customer]:
        """Find customer by ID."""
        return self._customers.get(customer_id)

    def find_all(self) -> List[Customer]:
        """Return all customers."""
        return list(self._customers.values())

    def delete(self, customer_id: str) -> bool:
        """Delete customer. Returns True if found and deleted."""
        if customer_id in self._customers:
            del self._customers[customer_id]
            return True
        return False
''',

        # File 6: Service layer
        "src/services/payment_service.py": '''"""Payment service - orchestrates payment operations."""
from src.api.payment import PaymentRequest, PaymentResponse, process_payment
from src.api.calculator import divide
from src.repositories.customer_repo import CustomerRepository
from src.models.customer import Customer


class PaymentService:
    """High-level payment operations."""

    def __init__(self, repo: CustomerRepository):
        self.repo = repo

    def charge_customer(self, customer_id: str, amount: float, currency: str) -> PaymentResponse:
        """Charge a customer by ID."""
        customer = self.repo.find_by_id(customer_id)
        if not customer:
            return PaymentResponse(success=False, error="Customer not found")

        request = PaymentRequest(
            amount=amount,
            currency=currency,
            customer_id=customer_id,
        )
        return process_payment(request)

    def calculate_fee(self, amount: float, fee_percent: float) -> float:
        """Calculate fee amount."""
        return divide(amount * fee_percent, 100)
''',

        # File 7: Tests for payment
        "src/tests/test_payment.py": '''"""Payment tests."""
import unittest
from src.api.payment import PaymentRequest, PaymentResponse, process_payment


class TestPayment(unittest.TestCase):
    def test_process_valid_payment(self):
        request = PaymentRequest(amount=100.0, currency="USD", customer_id="cust_1")
        response = process_payment(request)
        self.assertTrue(response.success)
        self.assertIsNotNone(response.transaction_id)

    def test_negative_amount_rejected(self):
        request = PaymentRequest(amount=-50.0, currency="USD", customer_id="cust_1")
        response = process_payment(request)
        self.assertFalse(response.success)

    def test_zero_amount_accepted(self):
        """BUG: Zero amount should be rejected but isn't."""
        request = PaymentRequest(amount=0.0, currency="USD", customer_id="cust_1")
        response = process_payment(request)
        self.assertTrue(response.success)  # This is the bug
''',

        # File 8: Tests for calculator
        "src/tests/test_calculator.py": '''"""Calculator tests."""
import unittest
from src.api.calculator import divide, percentage


class TestCalculator(unittest.TestCase):
    def test_divide_regular(self):
        self.assertEqual(divide(10, 2), 5)

    def test_divide_by_zero(self):
        """BUG: Should raise ValueError, returns 0 instead."""
        result = divide(10, 0)
        self.assertEqual(result, 0)  # Bug: should be ValueError

    def test_percentage_regular(self):
        self.assertEqual(percentage(25, 100), 25.0)

    def test_percentage_zero_total(self):
        self.assertEqual(percentage(10, 0), 0.0)
''',

        # File 9: Tests for validation
        "src/tests/test_validation.py": '''"""Validation tests."""
import unittest
from src.api.validation import validate_email, validate_customer_id


class TestValidation(unittest.TestCase):
    def test_valid_email(self):
        self.assertTrue(validate_email("user@example.com"))

    def test_invalid_email_no_at(self):
        """BUG: Weak regex accepts this."""
        self.assertTrue(validate_email("userexample.com"))

    def test_invalid_email_no_domain(self):
        """BUG: Weak regex accepts this."""
        self.assertTrue(validate_email("user@"))

    def test_customer_id_valid(self):
        self.assertIsNone(validate_customer_id("cust_123"))

    def test_customer_id_too_short(self):
        self.assertIsNotNone(validate_customer_id("ab"))
''',

        # File 10: Integration test
        "src/tests/test_integration.py": '''"""Integration tests."""
import unittest
from src.services.payment_service import PaymentService
from src.repositories.customer_repo import CustomerRepository
from src.models.customer import Customer


class TestIntegration(unittest.TestCase):
    def setUp(self):
        self.repo = CustomerRepository()
        self.service = PaymentService(self.repo)
        self.customer = Customer(id="cust_1", email="test@example.com", name="Test User")
        self.repo.save(self.customer)

    def test_charge_customer_success(self):
        response = self.service.charge_customer("cust_1", 100.0, "USD")
        self.assertTrue(response.success)

    def test_charge_nonexistent_customer(self):
        response = self.service.charge_customer("nonexistent", 100.0, "USD")
        self.assertFalse(response.success)

    def test_calculate_fee(self):
        fee = self.service.calculate_fee(100.0, 5.0)
        self.assertEqual(fee, 5.0)
''',

        # File 11: Config
        "config/settings.py": '''"""Application settings."""
from dataclasses import dataclass


@dataclass
class Settings:
    """Application configuration."""
    debug: bool = False
    api_version: str = "v1"
    max_amount: float = 10000.0
    supported_currencies: tuple = ("USD", "EUR", "GBP")

    @classmethod
    def from_env(cls) -> "Settings":
        """Load from environment variables."""
        import os
        return cls(
            debug=os.getenv("DEBUG", "false").lower() == "true",
            api_version=os.getenv("API_VERSION", "v1"),
            max_amount=float(os.getenv("MAX_AMOUNT", "10000.0")),
        )


# Global settings instance
settings = Settings()
''',

        # File 12: README
        "README.md": '''# Payment Processing System

Multi-file task demonstrating:
- Typed response objects
- Input validation
- Division by zero handling
- Test coverage

## Structure

- `src/api/` - API layer (payment, calculator, validation)
- `src/models/` - Data models
- `src/repositories/` - Data access
- `src/services/` - Business logic
- `src/tests/` - Test suite
- `config/` - Configuration

## Seeded Defects

1. **payment.py**: No currency validation
2. **calculator.py**: Division by zero returns 0 instead of raising
3. **validation.py**: Weak email regex
''',
    },

    # Seeded defects: IDs that should be detected
    "seeded_defects": [
        {"id": "currency-validation", "file": "src/api/payment.py", "desc": "No currency validation"},
        {"id": "division-by-zero", "file": "src/api/calculator.py", "desc": "Returns 0 on div by zero"},
        {"id": "weak-email-regex", "file": "src/api/validation.py", "desc": "Weak email regex"},
    ],

    # Verification: run these commands to verify repairs
    "verification_commands": [
        "python -m pytest src/tests/ -v",
        "python -m mypy src/api/",
    ],
}
