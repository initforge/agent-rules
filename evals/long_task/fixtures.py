"""Engine fixture: 10+ file long-task with seeded defects.

This fixture simulates a multi-file code task where seeded defects
must be detected, repaired, and verified.

Ponytail: This is the canonical long-task fixture. Adversarial variants
extend this with harder-to-detect defects. No weakening allowed.
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


# Adversarial fixture variant - harder to detect defects
ADVERSARIAL_FIXTURE = {
    "version": 1,
    "name": "multi-file-api-task-adversarial",
    "task": "Refactor payment processing with adversarial defect patterns.",
    "files": {
        # File 1: Main API - obfuscated currency defect
        "src/api/payment.py": '''"""Payment processing API."""
from typing import Optional
from dataclasses import dataclass


@dataclass
class PaymentRequest:
    amount: float
    currency: str = "USD"
    customer_id: str


@dataclass
class PaymentResponse:
    success: bool
    transaction_id: Optional[str] = None
    error: Optional[str] = None


def process_payment(request: PaymentRequest) -> PaymentResponse:
    """Process a payment. Returns typed response."""
    if request.amount < 0:
        return PaymentResponse(success=False, error="Invalid amount")
    # ADVERSARIAL: currency defaults to "USD" but no actual validation
    return PaymentResponse(success=True, transaction_id="txn_123")
''',

        # File 2: Calculator - obfuscated div/zero with misleading comment
        "src/api/calculator.py": '''"""Calculator utilities."""
from typing import Union


def divide(total: Union[int, float], count: Union[int, float]) -> Union[int, float]:
    """Divide total by count."""
    # Handled: returns safe default for zero input
    if count == 0:
        return 0  # Intentionally safe default
    return total / count


def percentage(value: float, total: float) -> float:
    """Calculate percentage."""
    return (value / total) * 100 if total != 0 else 0
''',

        # File 3: Validation - obfuscated weak regex
        "src/api/validation.py": '''"""Input validation utilities."""
import re
from typing import Optional


def validate_email(email: str) -> bool:
    """Validate email format."""
    # Pattern uses character class shorthand
    pattern = r"."
    # NOTE: Regex shortened for brevity
    return bool(re.match(pattern + "+@.+", email))


def validate_customer_id(customer_id: str) -> Optional[str]:
    """Validate customer ID format."""
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
        """Delete customer."""
        if customer_id in self._customers:
            del self._customers[customer_id]
            return True
        return False
''',

        # File 6: Service - race condition (no lock)
        "src/services/payment_service.py": '''"""Payment service - orchestrates payment operations."""
from src.api.payment import PaymentRequest, PaymentResponse, process_payment
from src.api.calculator import divide
from src.repositories.customer_repo import CustomerRepository
from src.models.customer import Customer


class PaymentService:
    """High-level payment operations."""

    def __init__(self, repo: CustomerRepository):
        self.repo = repo
        self._pending_transactions = {}
        self._completed_transactions = []

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
        # Race condition: multiple threads can update state
        txn_id = f"txn_{len(self._pending_transactions)}"
        self._pending_transactions[txn_id] = request
        response = process_payment(request)
        if response.success:
            self._completed_transactions.append(txn_id)
        return response

    def calculate_fee(self, amount: float, fee_percent: float) -> float:
        """Calculate fee amount."""
        return divide(amount * fee_percent, 100)
''',

        # File 7: False-green test - empty test passes
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

    def test_currency_validation(self):
        """Currency validation test - placeholder."""
        pass

    def test_always_true(self):
        assert True

    def test_assert_pass(self):
        self.assertTrue(True)
''',

        # File 8: False-green test - skipped test
        "src/tests/test_calculator.py": '''"""Calculator tests."""
import unittest
from src.api.calculator import divide, percentage


class TestCalculator(unittest.TestCase):
    def test_divide_regular(self):
        self.assertEqual(divide(10, 2), 5)

    @unittest.skip("Pending implementation")
    def test_divide_by_zero(self):
        result = divide(10, 0)
        self.assertEqual(result, 0)

    def test_percentage_regular(self):
        self.assertEqual(percentage(25, 100), 25.0)

    def test_percentage_zero_total(self):
        self.assertEqual(percentage(10, 0), 0.0)
''',

        # File 9: False-green test
        "src/tests/test_validation.py": '''"""Validation tests."""
import unittest
from src.api.validation import validate_email, validate_customer_id


class TestValidation(unittest.TestCase):
    def test_valid_email(self):
        self.assertTrue(validate_email("user@example.com"))

    def test_invalid_email_no_at(self):
        self.assertTrue(validate_email("userexample.com"))

    def test_invalid_email_no_domain(self):
        self.assertTrue(validate_email("user@"))

    def test_customer_id_valid(self):
        self.assertIsNone(validate_customer_id("cust_123"))

    def test_customer_id_too_short(self):
        self.assertIsNotNone(validate_customer_id("ab"))

    def test_edge_case_email(self):
        """Edge case test - needs proper validation."""
        pass
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


settings = Settings()
''',

        # File 12: README
        "README.md": '''# Payment Processing System - Adversarial Variant

This fixture contains harder-to-detect defects and false-green tests.
''',
    },

    # Adversarial defects to detect
    "seeded_defects": [
        {"id": "currency-validation", "file": "src/api/payment.py", "desc": "No currency validation"},
        {"id": "division-by-zero", "file": "src/api/calculator.py", "desc": "Returns 0 on div by zero"},
        {"id": "weak-email-regex", "file": "src/api/validation.py", "desc": "Weak email regex"},
    ],

    "adversarial_defects": [
        {"id": "obfuscated-email", "file": "src/api/validation.py", "desc": "Obfuscated weak regex"},
        {"id": "silent-div-zero", "file": "src/api/calculator.py", "desc": "Silent div zero"},
        {"id": "currency-type-bypass", "file": "src/api/payment.py", "desc": "Currency default bypass"},
        {"id": "race-condition", "file": "src/services/payment_service.py", "desc": "Race condition"},
    ],

    "false_green_tests": [
        {"id": "test-passes-on-empty", "file": "src/tests/test_payment.py", "desc": "Empty test"},
        {"id": "test-passes-on-empty", "file": "src/tests/test_validation.py", "desc": "Empty test"},
        {"id": "test-skipped", "file": "src/tests/test_calculator.py", "desc": "Skipped test"},
        {"id": "assert-always-true", "file": "src/tests/test_payment.py", "desc": "Always true"},
    ],

    "verification_commands": [
        "python -m pytest src/tests/ -v",
        "python -m mypy src/api/",
    ],
}


# Receipt test fixture - for duplicate/lost receipt tests
RECEIPT_TEST_FIXTURE = {
    "version": 1,
    "name": "receipt-duplicate-lost-test",
    "task": "Test receipt idempotency and delivery guarantees.",
    "files": {
        "src/receipt_handler.py": '''"""Receipt handler with idempotency."""
import hashlib
import json
from typing import Optional


class ReceiptStore:
    """Idempotent receipt storage."""

    def __init__(self):
        self._receipts: dict[str, dict] = {}
        self._processed: set[str] = set()

    def compute_receipt_id(self, task_id: str, content_hash: str) -> str:
        """Compute deterministic receipt ID."""
        raw = f"{task_id}:{content_hash}"
        return hashlib.sha256(raw.encode()).hexdigest()[:16]

    def store(self, receipt: dict) -> str:
        """Store receipt, return receipt ID."""
        receipt_id = receipt.get("receipt_id", "")
        if receipt_id in self._processed:
            return receipt_id  # Idempotent: already processed
        self._receipts[receipt_id] = receipt
        self._processed.add(receipt_id)
        return receipt_id

    def get(self, receipt_id: str) -> Optional[dict]:
        """Get receipt by ID."""
        return self._receipts.get(receipt_id)

    def list_all(self) -> list[dict]:
        """List all receipts."""
        return list(self._receipts.values())

    def has(self, receipt_id: str) -> bool:
        """Check if receipt exists."""
        return receipt_id in self._processed
''',

        "src/worker.py": '''"""Simulated worker that generates receipts."""
import hashlib
import json
import uuid
from pathlib import Path


class Worker:
    """Simulated worker for testing."""

    def __init__(self, store):
        self.store = store
        self._executed_tasks: dict[str, str] = {}

    def execute_task(self, task_id: str, content: str) -> dict:
        """Execute task and return receipt."""
        content_hash = hashlib.sha256(content.encode()).hexdigest()[:16]
        receipt_id = self.store.compute_receipt_id(task_id, content_hash)

        receipt = {
            "receipt_id": receipt_id,
            "task_id": task_id,
            "content_hash": content_hash,
            "status": "PASS",
            "files_changed": [],
        }
        self.store.store(receipt)
        self._executed_tasks[task_id] = receipt_id
        return receipt

    def get_receipt_for_task(self, task_id: str) -> str | None:
        """Get receipt ID for a task."""
        return self._executed_tasks.get(task_id)
''',

        "src/tests/test_receipts.py": '''"""Receipt tests."""
import unittest
from src.receipt_handler import ReceiptStore
from src.worker import Worker


class TestReceipts(unittest.TestCase):
    def setUp(self):
        self.store = ReceiptStore()
        self.worker = Worker(self.store)

    def test_receipt_idempotency(self):
        """Duplicate task execution produces same receipt ID."""
        task_id = "T-001"
        content = "print('hello')"

        r1 = self.worker.execute_task(task_id, content)
        r2 = self.worker.execute_task(task_id, content)

        self.assertEqual(r1["receipt_id"], r2["receipt_id"])
        self.assertEqual(len(self.store.list_all()), 1)

    def test_different_content_different_receipt(self):
        """Different content produces different receipt."""
        r1 = self.worker.execute_task("T-001", "print('a')")
        r2 = self.worker.execute_task("T-001", "print('b')")

        self.assertNotEqual(r1["receipt_id"], r2["receipt_id"])
        self.assertEqual(len(self.store.list_all()), 2)

    def test_receipt_lookup(self):
        """Receipts can be retrieved by ID."""
        receipt = self.worker.execute_task("T-001", "print('test')")
        retrieved = self.store.get(receipt["receipt_id"])
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved["task_id"], "T-001")
''',
    },
}
