---
name: dynamodb-stp-lab
description: "DynamoDB Single Table Design (STP) learning labs with AWS CDK v2 TypeScript. Use when: building a DynamoDB single table lab, learning STP, designing access patterns, modeling PK/SK/GSI, creating didactic DynamoDB exercises, single table pattern tutorial, DynamoDB CDK lab, teaching STP, sparse GSI, overloaded indexes, conversational domain modeling. DO NOT USE for production multi-table DynamoDB setups, unrelated CDK stacks, or general DynamoDB CRUD without STP focus."
argument-hint: "domain or concept to explore (e.g. 'conversations domain', 'evolve model with new access pattern', 'phase 2 GSI')"
---

# DynamoDB Single Table Pattern — Didactic Lab Skill

## When to Use
- Building a new DynamoDB STP learning lab from scratch
- Adding a new phase or access pattern to an existing lab
- Teaching or exploring single-table modeling decisions (PK/SK/GSI choices)
- Creating seed data, query examples, or README docs for a DynamoDB lab
- Comparing single-table vs multi-table approaches for a given domain

## When NOT to Use
- Production systems (this skill targets learning, not enterprise patterns)
- Purely operational DynamoDB work (backups, capacity tuning, migrations)
- General CDK stacks with no DynamoDB STP focus
- Multi-table relational designs where STP adds no value

---

## Workflow — 9-Step Lab Construction

Follow these steps **in order**. If the user skips a step, complete it with sensible defaults and note your assumptions.

### Step 1 — Identify Access Patterns
Before touching code, list every access pattern the lab will exercise.
Use the [Access Patterns Template](./templates/access-patterns.md).

**Guiding questions:**
- What entities exist? (e.g. User, Conversation, Message, Ticket)
- How will each entity be read? (by ID, by owner, by date range, status filter)
- What are the write patterns? (create, update, soft-delete)
- Which queries are latency-sensitive? → these drive the base table design
- Which queries are secondary → candidate GSIs

**Rule:** Do not define PK/SK until you have at least 3 access patterns.

### Step 2 — Propose Initial Model
With access patterns in hand, propose the minimum viable model:
- Choose a generic PK name (`PK`) and SK name (`SK`) — overloaded, not entity-specific
- Define the value format (e.g. `USER#<userId>`, `CONV#<convId>`)
- Map each access pattern to the table key or a GSI
- Document trade-offs: what is fast, what requires a GSI, what is intentionally deferred

Use the [Modeling Principles Guide](./docs/stp-principles.md) for decision criteria.

### Step 3 — Define PK / SK / GSI
Output a table like:

| Entity            | PK                | SK                    | Purpose                      |
|-------------------|-------------------|-----------------------|------------------------------|
| User              | `USER#<id>`       | `PROFILE`             | Fetch user by ID             |
| Conversation      | `USER#<ownerId>`  | `CONV#<convId>`       | List conversations by owner  |
| Message           | `CONV#<convId>`   | `MSG#<timestamp>#<id>`| List messages in a convo     |
| GSI1-PK           | `STATUS#<status>` | `CONV#<convId>`       | List open conversations (sparse GSI) |

**Rules:**
- On-demand billing unless there is a strong reason to switch
- Sparse GSIs: only add the GSI attribute to items that need it
- No more than 2 GSIs in the first phase — introduce more in later phases
- Always justify each index with an access pattern

### Step 4 — Generate CDK Stack
Use the [CDK Stack Template](./templates/cdk-stack.ts) as a starting point.

**Requirements:**
- CDK v2, TypeScript
- `RemovalPolicy.DESTROY` + `autoDeleteObjects` (lab only)
- On-demand billing (`PAY_PER_REQUEST`)
- Point-in-time recovery OFF (keep cost at zero for a lab)
- Add only the GSIs defined in Step 3
- Export table name and ARN as `CfnOutput`
- Stack name must be descriptive: e.g. `DynamoSTPConversationsLab`

### Step 5 — Generate Seed Script
Create `seed.ts` (or `seed.js`) with realistic sample data.

**Requirements:**
- At least 2 users, 3 conversations, 8–12 messages spread across conversations
- Include at least one soft-deleted conversation (for sparse GSI demo)
- Use `BatchWriteItem` via AWS SDK v3 (`@aws-sdk/client-dynamodb` or `lib-dynamodb`)
- Print a summary of what was written
- Idempotent: running seed twice must not break the model

Use the [Seed Script Template](./templates/seed.ts) as foundation.

### Step 6 — Generate Query Examples
Create `queries.ts` with one function per access pattern.

**Requirements:**
- Each function maps 1:1 to an access pattern from Step 1
- Use `QueryCommand`, never `ScanCommand` for keyed patterns
- Show `ProjectionExpression` to select only needed attributes
- Include **one paginated query** using `LastEvaluatedKey`
- Include **one sparse GSI query** (e.g. open conversations)
- Show the raw DynamoDB SDK call AND a brief comment explaining key condition

See [Query Examples](./examples/queries.ts).

### Step 7 — Write Didactic README
Generate a `README.md` for the lab using the [README Template](./templates/readme-lab.md).

**Required sections:**
1. Domain and goal of the lab
2. Entities and relationships (diagram or ASCII table)
3. Access patterns (numbered list with description)
4. Table design with PK/SK table and reasoning
5. GSI design with reasoning
6. Deploy instructions
7. Run seed instructions
8. Query examples with expected output
9. Experiments / Retos section (min 3 challenges)
10. Typical mistakes / Anti-patterns
11. Cleanup / Destroy instructions
12. Phase 2 preview (what comes next)

### Step 8 — Propose Model Evolution Exercises
Design at least 3 "what if" challenges that require the learner to change the model:

**Example challenges:**
- "A user can now be a member of a group. How do you add group membership queries without breaking existing patterns?"
- "You need to list all messages by a specific author across all conversations. Design the GSI."
- "Add a reaction system (emoji reactions to messages). How does STP handle this without a new table?"

For each challenge, provide:
- The new access pattern
- A hint (what key or index to consider)
- The solution (in a collapsible `<details>` block in README)

### Step 9 — Cleanup Guide
Add an explicit `CLEANUP.md` or section in README:

```bash
# Destroy the lab stack (CDK)
cd infra && npx cdk destroy DynamoSTPConversationsLab

# Verify no leftover resources
aws dynamodb list-tables --region <region>
```

- Confirm table is deleted
- Remind about CloudWatch logs if Lambda was used
- Note estimated cost for a typical 1-hour session: ~$0.00 on-demand with lab-scale data

---

## Default Domain

**Conversations / Chat / Tickets / Messaging**

Unless the user requests otherwise, build the lab around this domain:
- Entities: `User`, `Conversation`, `Message`
- Possible extension: `Attachment`, `Reaction`, `ConversationMember`

If a different domain better illustrates a specific STP concept (e.g. e-commerce for LSI, IoT for time-series), propose it as an **optional variant** but keep conversations as the default.

---

## Deliverables Checklist

Before considering the lab complete, verify all items:

- [ ] Access patterns listed and numbered
- [ ] PK/SK/GSI table with entity mapping and justification
- [ ] CDK stack compiles (`npx tsc --noEmit`)
- [ ] CDK stack deploys cleanly (`npx cdk deploy`)
- [ ] Seed script runs without errors
- [ ] Each access pattern has a corresponding query function
- [ ] At least one `Query` with `KeyConditionExpression`
- [ ] At least one paginated query using `LastEvaluatedKey`
- [ ] At least one sparse GSI demonstrated
- [ ] README covers all 12 required sections
- [ ] At least 3 evolution challenges / retos
- [ ] Cleanup instructions tested
- [ ] No `Scan` used where a `Query` is possible
- [ ] On-demand billing configured
- [ ] `RemovalPolicy.DESTROY` set (lab only)

---

## Minimum Assumptions (when user provides no details)

| Property | Default |
|---|---|
| Domain | Conversations / Chat |
| Phase | Phase 1 (minimal model) |
| Region | `us-east-1` |
| CDK entry | `lib/<domain>-stp-stack.ts` |
| Billing | `PAY_PER_REQUEST` |
| GSIs | Max 2 in Phase 1 |
| Seed records | 2 users · 3 convos · 10 messages |
| SDK | AWS SDK v3 |
| Language | TypeScript |
| Naming | `DynamoSTP<Domain>Lab` |

---

## Pedagogical Rules

1. **Query before Scan** — Always use `QueryCommand`. If a scan is needed for learning, explicitly call it out as a teaching moment showing why it is expensive.
2. **Access pattern first** — Never design a table key before writing access patterns. Enforce this in your output.
3. **Show the why** — For every PK/SK/GSI decision, write one sentence explaining the reasoning linked to an access pattern.
4. **Trade-offs are content** — Mention at least one alternative design per GSI and why it was not chosen.
5. **Phase it** — Introduce complexity incrementally. Phase 1 = minimal table. Phase 2 = add GSI for new AP. Phase 3 = sparse index, overloading.
6. **Compare when helpful** — Briefly note when a multi-table design would be simpler and why STP wins or loses in that trade-off.

---

## Resource Files

| File | Purpose |
|---|---|
| [Access Patterns Template](./templates/access-patterns.md) | Worksheet to fill in before modeling |
| [CDK Stack Template](./templates/cdk-stack.ts) | Starter stack with DynamoDB table + GSIs |
| [Seed Script Template](./templates/seed.ts) | Realistic seed data generator |
| [README Lab Template](./templates/readme-lab.md) | Full README structure for the lab |
| [Query Examples](./examples/queries.ts) | SDK v3 query patterns per access pattern type |
| [STP Modeling Principles](./docs/stp-principles.md) | Decision guide for PK/SK/GSI choices |
| [Example Prompts](./prompts/usage-prompts.md) | Prompts to trigger and extend this skill |

---

## Example Invocations

```
/dynamodb-stp-lab Crea el laboratorio de conversaciones fase 1
/dynamodb-stp-lab conversations domain Añade GSI para buscar mensajes por autor
/dynamodb-stp-lab Evoluciona el modelo: ahora los usuarios pueden estar en grupos
/dynamodb-stp-lab Muéstrame el trade-off entre sparse GSI y tabla separada para conversaciones archivadas
/dynamodb-stp-lab Genera el README completo para el lab de conversaciones
/dynamodb-stp-lab Genera un reto de evolución del modelo para fase 3
```
