# Claim format

Each parity claim is a structured JSON object with the following schema.

## Top-level structure

```json
{
  "id": "PC-001",
  "dimension": "visual",
  "claim": "The populated list view matches reference template layout, spacing, and typography",
  "viewport": "desktop",
  "viewport_width": 1280,
  "viewport_height": 720,
  "state": "populated",
  "target_selector": ".list-view",
  "expected": {
    "description": "List view header aligned left, 16px padding, 14px Roboto regular, #333 text",
    "reference_selector": ".template-list-view",
    "visual_baseline_path": ".agent/parity-baselines/PC-001-populated-desktop.png",
    "a11y_role": "list",
    "a11y_children_min": 1,
    "console_errors": 0,
    "network_errors": 0
  },
  "proof_profile": "ui-parity",
  "required_evidence": [
    "screenshot",
    "a11y_snapshot",
    "console_log",
    "network_log"
  ],
  "environment": {
    "viewport": "desktop",
    "browser": "chromium",
    "font_hint": "Roboto, Arial, sans-serif",
    "locale": "vi-VN",
    "timezone": "Asia/Ho_Chi_Minh",
    "data_fixture": "5fedu-employees-3-records",
    "dpr": 2
  }
}
```

## Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | yes | Unique claim identifier (e.g., `PC-001`) |
| `dimension` | string | yes | One of: `visual`, `responsive`, `behavioral`, `accessibility`, `console`, `network`, `data-state` |
| `claim` | string | yes | Human-readable claim statement |
| `viewport` | string | yes | `desktop` or `mobile` |
| `viewport_width` | integer | no | Width in pixels (default: 1280 desktop, 375 mobile) |
| `viewport_height` | integer | no | Height in pixels (default: 720 desktop, 812 mobile) |
| `state` | string | yes | One of: `loading`, `populated`, `empty`, `error`, `hover`, `focus`, `keyboard`, `touch` |
| `target_selector` | string | no | CSS selector for the target element |
| `expected` | object | yes | Expected observable outcome (see below) |
| `proof_profile` | string | yes | Evidence profile from `automation/evidence-profiles.json` |
| `required_evidence` | array | yes | Evidence kinds required: `screenshot`, `a11y_snapshot`, `console_log`, `network_log`, `source_assertion`, `visual_diff` |
| `environment` | object | yes | Environment pinning configuration |
| `accepted_deviation` | object | no | Owner-approved deviation if applicable |

## Expected fields

| Field | Type | Required | Description |
|---|---|---|---|
| `description` | string | no | Optional human-readable expected behavior |
| `reference_selector` | string | no | CSS selector on reference/template page |
| `visual_baseline_path` | string | no | Path to expected screenshot baseline |
| `a11y_role` | string | no | Expected ARIA role |
| `a11y_children_min` | integer | no | Minimum number of a11y children |
| `console_errors` | integer | no | Maximum allowed console errors (default: 0) |
| `network_errors` | integer | no | Maximum allowed network failures (default: 0) |
| `behavior_assertions` | array | no | List of behavioral assertions as `{ "type": "...", "target": "...", "value": "..." }` |

## Environment fields

| Field | Type | Required | Description |
|---|---|---|---|
| `viewport` | string | yes | `desktop` or `mobile` |
| `browser` | string | no | Browser name (default: `chromium`) |
| `font_hint` | string | no | Expected font stack |
| `locale` | string | no | Locale string (default: `vi-VN`) |
| `timezone` | string | no | Timezone string (default: `Asia/Ho_Chi_Minh`) |
| `data_fixture` | string | no | Data fixture identifier |
| `dpr` | number | no | Device pixel ratio (default: 2) |

## Accepted deviation

```json
{
  "accepted_deviation": {
    "field": "padding",
    "expected": "16px",
    "actual": "14px",
    "reason": "Target uses 14px padding per design system update approved on 2025-06-15",
    "approved_by": "owner",
    "approved_at": "2025-06-15T10:00:00Z"
  }
}
```

## Claim packet (multiple claims)

```json
{
  "meta": {
    "name": "5fedu employee list parity",
    "version": 1,
    "created_at": "2025-07-25T00:00:00Z",
    "source_template": "/workspace/templates/employee-list",
    "template_commit": "abc123def456",
    "target_project": "5fedu-erp",
    "target_branch": "feature/employee-list"
  },
  "environment_defaults": {
    "browser": "chromium",
    "locale": "vi-VN",
    "timezone": "Asia/Ho_Chi_Minh",
    "dpr": 2
  },
  "claims": [
    { ... },
    { ... }
  ]
}
```
