# Model routing by capability and risk

Route by logical class and risk input, never by hardcoded provider model names. The canonical policy is `automation/model-policy.json`; projects use their installed host copy.

## Logical classes

| Class | Typical work |
|---|---|
| Utility | deterministic commands, search, inventory, stateless lookup |
| Economy | mechanical edits, narrow checks, retrieval, routine research |
| Standard | ordinary implementation, planning, integration review, normal features |
| Expert | architecture, shared contracts, security/migration/concurrency, adversarial review, repeated failure |

## Routing inputs

Evaluate these before selecting a class. Record the reason when the class is higher than economy.

| Input | Meaning |
|---|---|
| Uncertainty | How well the outcome is known in advance |
| Dependency breadth | Number and coupling of affected interfaces/modules |
| Shared contract changes | Whether the work modifies contracts others depend on |
| Blast radius | Impact scope if the change fails |
| Reversibility | Whether the change can be cleanly rolled back |
| Security/data risk | Exposure of credentials, PII, access control, data integrity |
| Cross-layer state | Whether the change touches multiple architectural layers |
| Architecture ambiguity | How much discovery is needed before implementation |
| Proof difficulty | How hard it is to produce fresh evidence |
| Repeated failure | Number of prior failed attempts on the same work |
| User model override | Explicit model selection by the user, always preserved |

## Role defaults

| Role or work type | Default class |
|---|---|
| Command/search/inventory worker | utility |
| Bounded mechanical implementation | economy |
| Normal feature implementation | standard |
| Architecture/shared contract/integration | expert |
| Security/migration/concurrency review | expert |
| Deterministic verifier | cheapest sufficient class (economy or standard) |
| Vision-dependent parity review | requires vision capability, independent of class |

## Escalation

Escalate one class level per trigger, up to expert. Record the specific trigger as the escalation reason. Multiple triggers may escalate directly to expert.

Triggers:
- uncertainty high
- architecture ambiguity unresolved
- shared contract changes affecting 3+ dependents
- blast radius high or critical
- irreversible migration or data transformation
- security or data risk present
- cross-layer state change touching 2+ layers
- proof difficulty high
- repeated failure count >= 2
- user model override requesting higher class

Cost savings cannot override a mandatory capability requirement. A cheaper class may be used only when all routing inputs are satisfied at that class level.

## Fallback

Fallback to the next available class when the requested class is unavailable. Record the fallback_reason. If no class is available, attestation_status is UNVERIFIED.

Missing class mapping is an error, never a silent fallback to an unmapped class. Do not consider a model verified merely because its config file contains the intended ID; request runtime attestation.

## Requested/resolved/observed

Every route produces all three states:

- **Requested**: logical class and effort the coordinator determined
- **Resolved**: provider, model family, and effort the adapter selected
- **Observed**: runtime-attested provider, model, and effort; or UNVERIFIED when unobtainable

Missing host attestation is unknown, never inferred from request or resolution. A platform adapter supplies the actual native model ID in the resolved and observed fields.
