/**
 * Seed script for the Conversations DynamoDB single-table lab.
 *
 * Usage:
 *   node --loader ts-node/esm src/seed.ts [options]
 *
 * Options:
 *   --table   <name>    DynamoDB table name (required, or set TABLE_NAME env var)
 *   --count   <number>  Number of conversations to generate (default: 3)
 *   --region  <region>  AWS region (default: eu-west-1 or AWS_REGION env var)
 *
 * Idempotent: re-running overwrites items with the same PK/SK — DynamoDB PutItem semantics.
 */

import {
  DynamoDBClient,
  BatchWriteItemCommand,
  type WriteRequest,
} from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

function parseArgs(): { tableName: string; count: number; region: string } {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const tableName = get('--table') ?? process.env['TABLE_NAME'];
  if (!tableName) {
    throw new Error(
      'Table name is required. Pass --table <name> or set TABLE_NAME env var.',
    );
  }

  const count = parseInt(get('--count') ?? '3', 10);
  if (isNaN(count) || count < 1) throw new Error('--count must be a positive integer.');

  const region = get('--region') ?? process.env['AWS_REGION'] ?? 'eu-west-1';
  return { tableName, count, region };
}

// ---------------------------------------------------------------------------
// Random helpers
// ---------------------------------------------------------------------------

const OFFICES = ['of1', 'of2', 'of3'];
const AGENTS = ['ag1', 'ag2', 'ag3'];
const CURSTATS = ['WAITING', 'START', 'CLOSE'] as const;
type Curstat = (typeof CURSTATS)[number];
const MOTIVES = ['1', '2', '3', '4'];
const BUSINESS_LINES = ['SA', 'CB', 'RE'] as const;
const SUB_BUSINESS_LINES: Record<string, string[]> = {
  SA: ['SA-LIFE', 'SA-NON-LIFE'],
  CB: ['CB-SME', 'CB-CORP'],
  RE: ['RE-RESI', 'RE-COMM'],
};

const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

/** Generates a deterministic-looking but varied ISO timestamp within the last 90 days. */
function randomIso(offsetDaysAgo = 0): string {
  const ms =
    Date.now() -
    (offsetDaysAgo + Math.random() * 5) * 24 * 60 * 60 * 1000 -
    Math.random() * 60 * 60 * 1000;
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, '.000Z');
}

function uuid(): string {
  // crypto.randomUUID is available in Node 14.17+ / 18+
  return crypto.randomUUID();
}

// ---------------------------------------------------------------------------
// Item builders
// ---------------------------------------------------------------------------

interface ConversationItem extends Record<string, unknown> {
  PK: string;
  SK: 'METADATA';
  entityType: 'Conversation';
  convId: string;
  officeId: string;
  agentId: string;
  curstat: Curstat;
  motive: string;
  businessLine: string;
  subBusinessLine: string;
  updateTime: string;
  createdAt: string;
  configuration: {
    channel: string;
    language: string;
    maxDurationSeconds: number;
  };
  // Sparse GSI attributes — only Conversation items carry these
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK: string;
  GSI2SK: string;
  GSI3PK: string;
  GSI3SK: string;
  GSI4PK: string;
  GSI4SK: string;
}

/**
 * Builds all items belonging to a single conversation:
 * 1 × Conversation (METADATA) + N × Message + N × Action + N × HistoryStatusEvent
 */
function buildConversationItems(
  convIndex: number,
): Record<string, unknown>[] {
  const convId = uuid();
  const officeId = pick(OFFICES);
  const agentId = pick(AGENTS);
  const curstat = pick(CURSTATS);
  const motive = pick(MOTIVES);
  const businessLine = pick(BUSINESS_LINES);
  const subBusinessLine = pick(SUB_BUSINESS_LINES[businessLine]!);
  const createdAt = randomIso(convIndex * 7); // spread over past weeks
  const updateTime = randomIso(convIndex * 7 - 1);

  const conversation: ConversationItem = {
    PK: `CONV#${convId}`,
    SK: 'METADATA',
    entityType: 'Conversation',
    convId,
    officeId,
    agentId,
    curstat,
    motive,
    businessLine,
    subBusinessLine,
    updateTime,
    createdAt,
    configuration: {
      channel: pick(['web', 'mobile', 'phone'] as const),
      language: pick(['es', 'en', 'ca'] as const),
      maxDurationSeconds: 600,
    },
    // GSI sparse projections
    GSI1PK: `OFFICE#${officeId}#CURSTAT#${curstat}`,
    GSI1SK: `${updateTime}#${convId}`,
    GSI2PK: `OFFICE#${officeId}#MOTIVE#${motive}`,
    GSI2SK: `${updateTime}#${convId}`,
    GSI3PK: `BL#${businessLine}`,
    GSI3SK: `${updateTime}#${convId}`,
    GSI4PK: `OFFICE#${officeId}#AGENT#${agentId}#CURSTAT#${curstat}`,
    GSI4SK: `${updateTime}#${convId}`,
  };

  const items: Record<string, unknown>[] = [conversation];

  // 2–3 messages per conversation
  const msgCount = 2 + Math.floor(Math.random() * 2);
  for (let m = 0; m < msgCount; m++) {
    const msgId = uuid();
    const msgTime = randomIso(convIndex * 7 - 0.5 - m * 0.1);
    items.push({
      PK: `CONV#${convId}`,
      SK: `MSG#${msgTime}#${msgId}`,
      entityType: 'Message',
      msgId,
      convId,
      author: pick(['agent', 'customer'] as const),
      text: `Sample message ${m + 1} for conversation ${convIndex + 1}`,
      timestamp: msgTime,
    });
  }

  // 1–2 actions per conversation
  const actionCount = 1 + Math.floor(Math.random() * 2);
  for (let a = 0; a < actionCount; a++) {
    const eventId = uuid();
    const actionTime = randomIso(convIndex * 7 - 0.3 - a * 0.1);
    items.push({
      PK: `CONV#${convId}`,
      SK: `ACTION#${actionTime}#${eventId}`,
      entityType: 'Action',
      eventId,
      convId,
      actionType: pick(['TRANSFER', 'TAG', 'CLOSE_REQUEST'] as const),
      performedBy: agentId,
      timestamp: actionTime,
    });
  }

  // 1–2 history status events per conversation
  const hseCount = 1 + Math.floor(Math.random() * 2);
  for (let h = 0; h < hseCount; h++) {
    const hseTime = randomIso(convIndex * 7 - 0.2 - h * 0.1);
    items.push({
      PK: `CONV#${convId}`,
      SK: `HSE#${hseTime}`,
      entityType: 'HistoryStatusEvent',
      convId,
      fromStatus: h === 0 ? 'WAITING' : 'START',
      toStatus: curstat,
      changedAt: hseTime,
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// BatchWriteItem helper (max 25 items per request)
// ---------------------------------------------------------------------------

async function batchWrite(
  client: DynamoDBClient,
  tableName: string,
  items: Record<string, unknown>[],
): Promise<void> {
  const CHUNK_SIZE = 25;
  for (let i = 0; i < items.length; i += CHUNK_SIZE) {
    const chunk = items.slice(i, i + CHUNK_SIZE);
    const requests: WriteRequest[] = chunk.map((item) => ({
      PutRequest: { Item: marshall(item, { removeUndefinedValues: true }) },
    }));

    const command = new BatchWriteItemCommand({
      RequestItems: { [tableName]: requests },
    });

    const response = await client.send(command);

    // Handle unprocessed items with a simple retry
    const unprocessed = response.UnprocessedItems?.[tableName];
    if (unprocessed && unprocessed.length > 0) {
      console.warn(`  ⚠ ${unprocessed.length} unprocessed items, retrying...`);
      await client.send(
        new BatchWriteItemCommand({ RequestItems: { [tableName]: unprocessed } }),
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const { tableName, count, region } = parseArgs();
  const client = new DynamoDBClient({ region });

  console.log(`\nSeeding table "${tableName}" in ${region}`);
  console.log(`Generating ${count} conversation(s)...\n`);

  const allItems: Record<string, unknown>[] = [];
  for (let i = 0; i < count; i++) {
    const items = buildConversationItems(i);
    allItems.push(...items);
    const conv = items[0] as unknown as ConversationItem;
    console.log(
      `  [${i + 1}/${count}] CONV#${conv.convId.slice(0, 8)}...` +
        `  office=${conv.officeId}  agent=${conv.agentId}  curstat=${conv.curstat}` +
        `  bl=${conv.businessLine}  items=${items.length}`,
    );
  }

  await batchWrite(client, tableName, allItems);

  console.log(`\nDone — ${allItems.length} items written to "${tableName}".\n`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
