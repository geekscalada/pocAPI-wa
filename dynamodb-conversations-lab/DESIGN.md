# DynamoDB Single Table Design — Conversations Domain

## Base Organization Decision

The primary axis of the base table is **the conversation and its children** (`CONV#<convId>`), because at runtime the most frequent operation is fetching a conversation together with its messages, actions, and history. Access patterns by office / status / businessLine are covered with **sparse GSIs** — only `Conversation` items project the GSI attributes; child items do not.

---

## Item Types — Base Table

| Entity | PK | SK | Notes |
|---|---|---|---|
| `Conversation` | `CONV#<convId>` | `METADATA` | All conversation attributes |
| `Message` | `CONV#<convId>` | `MSG#<updateTime_ISO>#<msgId>` | Sorted chronologically |
| `Action` | `CONV#<convId>` | `ACTION#<updateTime_ISO>#<eventId>` | Sorted chronologically |
| `HistoryStatusEvent` | `CONV#<convId>` | `HSE#<createdAt_ISO>` | Sorted chronologically |

`Configuration` **is not a separate item** — it is an embedded `Map` inside the `Conversation` item (1:1 cardinality, fixed and small size).

---

## GSIs — Phase 1

### GSI1 — AP1 and AP2: by `officeId + curstat + date`

```
GSI1PK  =  OFFICE#<officeId>#CURSTAT#<curstat>
GSI1SK  =  <updateTime_ISO>#<convId>
```

| Access Pattern | Key Condition |
|---|---|
| **AP1** — `curstat=START` for an office | `GSI1PK = "OFFICE#of1#CURSTAT#START"` + `GSI1SK BETWEEN "2026-01-01" AND "2026-04-02"` |
| **AP2** — `curstat=CLOSE` for an office | `GSI1PK = "OFFICE#of1#CURSTAT#CLOSE"` + `GSI1SK BETWEEN "2026-01-01" AND "2026-04-02"` |

**Why it works**: changing `curstat` from `START` to `CLOSE` updates the `GSI1PK` attribute. DynamoDB automatically removes the item from the `#CURSTAT#START` bucket and places it in `#CURSTAT#CLOSE`. No extra application logic required.

---

### GSI2 — AP3: by `officeId + motive + date`

```
GSI2PK  =  OFFICE#<officeId>#MOTIVE#<motive>
GSI2SK  =  <updateTime_ISO>#<convId>
```

| Access Pattern | Key Condition |
|---|---|
| **AP3** — conversations by motive and office | `GSI2PK = "OFFICE#of1#MOTIVE#3"` + `GSI2SK BETWEEN <d1> AND <d2>` |

---

## GSIs — Phase 2

### GSI4 — AP6 and AP7: by `officeId + agentId + curstat + date`

```
GSI4PK  =  OFFICE#<officeId>#AGENT#<agentId>#CURSTAT#<curstat>
GSI4SK  =  <updateTime_ISO>#<convId>
```

| Access Pattern | Key Condition |
|---|---|
| **AP6** — office + agent + `curstat=START` + date | `GSI4PK = "OFFICE#of1#AGENT#ag1#CURSTAT#START"` + `GSI4SK BETWEEN <d1> AND <d2>` |

**AP7 — office + agent + any curstat + date range**

Yes, this is directly extensible. Because `curstat` is a closed enum with only 3 values (`WAITING`, `START`, `CLOSE`), the strategy is **3 parallel queries on GSI4** — one per curstat value — and merge + sort in the application layer. This is cheaper than adding a fifth GSI and avoids a `FilterExpression` scan cost.

```
// 3 parallel QueryCommands on GSI4
OFFICE#of1#AGENT#ag1#CURSTAT#WAITING  →  SK BETWEEN d1 AND d2
OFFICE#of1#AGENT#ag1#CURSTAT#START    →  SK BETWEEN d1 AND d2
OFFICE#of1#AGENT#ag1#CURSTAT#CLOSE    →  SK BETWEEN d1 AND d2
// merge by updateTime_ISO in application
```

If AP7 becomes latency-critical (e.g. high-frequency dashboard), a **GSI5** can be introduced in Phase 3:
```
GSI5PK  =  OFFICE#<officeId>#AGENT#<agentId>
GSI5SK  =  <updateTime_ISO>#<convId>
```
This gives a single query for any curstat, at the cost of one extra GSI. Defer until there is a measured need.

> **Hot partition note:** The `#CURSTAT#CLOSE` partition per agent grows monotonically (CLOSE is a terminal state). Apply the same `#YYYY-MM` bucketing as GSI1 if a single agent handles a high volume of conversations per month.

---

### GSI3 — AP4 and AP5: by `businessLine (+ subBusinessLine) + date`

```
GSI3PK  =  BL#<businessLine>
GSI3SK  =  <updateTime_ISO>#<convId>
```

| Access Pattern | Key Condition | Extra |
|---|---|---|
| **AP4** — by businessLine | `GSI3PK = "BL#SA"` + `GSI3SK BETWEEN <d1> AND <d2>` | — |
| **AP5** — by businessLine + subBusinessLine | Same as AP4 | `FilterExpression: subBusinessLine = :sbl` |

AP5 with `FilterExpression` is efficient because `businessLine` already reduces fan-out substantially. If AP5 becomes latency-critical in the future, a **GSI4** can be added in Phase 3 with `PK = BL#<businessLine>#SUBBL#<subBusinessLine>`.

---

## Access Pattern → Index Mapping Summary

| AP | Index | PK | SK (range) | Extra |
|---|---|---|---|---|
| AP1 — office + START + date | GSI1 | `OFFICE#<oId>#CURSTAT#START` | date | — |
| AP2 — office + CLOSE + date | GSI1 | `OFFICE#<oId>#CURSTAT#CLOSE` | date | — |
| AP3 — office + motive + date | GSI2 | `OFFICE#<oId>#MOTIVE#<n>` | date | — |
| AP4 — businessLine + date | GSI3 | `BL#<bl>` | date | — |
| AP5 — bl + subBL + date | GSI3 | `BL#<bl>` | date | FilterExpression on subBL |
| AP6 — office + agent + START + date | GSI4 | `OFFICE#<oId>#AGENT#<aId>#CURSTAT#START` | date | — |
| AP7 — office + agent + any curstat + date | GSI4 | 3 parallel queries (one per curstat) | date | merge in app |
| Get conv + children | Base table | `CONV#<convId>` | `begins_with MSG#` \| `ACTION#` \| `HSE#` | — |

---

## Date Format Rules

`updateTime_ISO` must be in **ISO 8601 UTC without variable punctuation separators**, for example `2026-04-02T10:30:00.000Z`. This enables native lexicographic ordering in DynamoDB without any additional numeric index. The `<convId>` appended at the end of the SK guarantees collision-free ordering when two conversations share the same timestamp.

---

