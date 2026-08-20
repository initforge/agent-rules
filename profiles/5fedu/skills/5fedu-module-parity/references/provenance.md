# Parity asset migration provenance

On the P1 migration, these live assets moved byte-for-byte from
`profiles/5fedu/projects/parity/` into this skill. The Git blob IDs below
are the source bytes immediately before the move; the file names retain the
same relative suffix under `references/`.

| Source-relative asset | Git blob |
|---|---|
| `contracts/no-vision-worker-contract.md` | `ee0abaced1f8769cbf40eb88c3b3065b3b5b9334` |
| `examples/nhap-hang/architecture-adaptation.yaml` | `3b0f0ce88a05c4df50317e036b189201a8c20aa3` |
| `examples/nhap-hang/behavior-contract.yaml` | `cb2ebf260c5b68339da055c7f3ca4551e745e33e` |
| `examples/nhap-hang/deviations.yaml` | `503ff07ab08345e00ebdb746f3e15c65c2172db5` |
| `examples/nhap-hang/fixtures/*` | `32a6722cd7234e4795761f7590e1f8b5264c6070`, `05f3f68b0c0d3683e1c45d536136d3b67db06cc6`, `14119494f5f886538b8f9a5ee71f34a79d050bb4`, `e451c8144f4ad3d38194f63289e29e0982364408` |
| `examples/nhap-hang/proof.yaml` | `c011026a017c81e18b84269d016a2063086b1577` |
| `examples/nhap-hang/source.lock.yaml` | `126ff926221b520fc190f809e9fd1c2bdebf00df` |
| `examples/nhap-hang/structural-map.yaml` | `13fb550816d601b09caf821c129d48497e9c6389` |
| `examples/nhap-hang/target.yaml` | `07e54fb8e958463473a2f63eec791ad6dbc073b7` |
| `examples/nhap-hang/visual-contract.yaml` | `336fdeb395fafc0fc4298952425b3db15c093ade` |
| `questions/question-strategy.md` | `02397229035ac7d374a072111302cbd5acdbca8c` |
| `schemas/*.schema.yaml` | `eb0c351da1910bbfefd7eb10ca3ae8b52ff8c6a4`, `08c0eb588fb09b7c76641c282882513231bb6112`, `e918af31dbda3545ddda17a02fa007c624136d4b`, `2fe39c2813a0b811596529acf18b39954aac2a00`, `59944d3fe4758ca9827b31dd45ec9b617da4dc31`, `a715f99ebc8d3a6e03d4c0e56f614eadfd043b5b`, `39d9d7a45d94e2697fdf689228670fae45097233`, `4bd9665c6044b66413e259868ad7aaf02330cd2e` |
| `workflow/planning-workflow.md` | `cfa67af664b9c9ff6b011b782184ce34a6150270` |

The validator and this provenance record are new P1 assets. They add hard
gates; they do not rewrite the moved contracts, workflow, schemas, examples,
questions, or negative fixtures.

## ASN11 engine cutover — historical reference artifacts

On 2026-07-27, the transitional Python validator was replaced by the canonical
TypeScript engine as the single source of truth for all parity packet validation.

| Historical asset | Final Git blob | Disposition |
|---|---|---|
| `validate-parity-packet.py` | `30f582e3cff146ab9de8439c29a40ffcce2a06b2` | DEPRECATED — retained for provenance only. The canonical engine (`npx @initforge/agent-rules-engine validate <packet>`) now owns all packet validation: shape, cross-document semantics, YAML parsing, and resource-limit enforcement. |

The Python validator was a bridge during P1 schema conversion (ASN01-ASN09) and
documentation update (ASN10). With ASN11, the engine cutover is complete.
Python byte content is preserved in the DEPRECATED header of
`validate-parity-packet.py`.
